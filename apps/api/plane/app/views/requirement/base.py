import json

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response

from plane.app.serializers.requirement import (
    RequirementConfigurationConflict,
    RequirementConfigurationWriteSerializer,
    RequirementDetailBatchSaveSerializer,
    RequirementDetailCreateSerializer,
    RequirementDetailFilterSerializer,
    RequirementDetailSerializer,
    RequirementDetailUpdateSerializer,
    RequirementSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    Requirement,
    RequirementApprover,
    RequirementDetail,
    Workspace,
)
from plane.utils.requirement import (
    RequirementDataLossError,
    RequirementDetailBatchConflict,
    filter_requirement_detail_ids,
    insert_requirement_detail,
    save_requirement_detail_batch,
    serialize_requirement_field_tree,
)


class RequirementViewSet(BaseViewSet):
    model = Requirement
    serializer_class = RequirementSerializer
    search_fields = ["title"]
    filterset_fields = {
        "is_template": ["exact"],
        "product_id": ["exact"],
        "project_id": ["exact"],
        "template_id": ["exact"],
        "status": ["exact", "in"],
        "owner_id": ["exact"],
        "is_active": ["exact"],
    }

    def get_queryset(self):
        approvers = RequirementApprover.objects.select_related("approver").order_by(
            "sort_order", "created_at", "id"
        )
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related(
                "workspace",
                "product",
                "project",
                "template",
                "owner",
                "created_by",
                "updated_by",
            )
            .prefetch_related(Prefetch("approvers", queryset=approvers))
        )
        return self.filter_queryset(queryset)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_requirement(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, pk):
        requirement = self._get_requirement(pk)
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(requirement).data,
            status=status.HTTP_200_OK,
        )

    def create(self, request, slug):
        workspace = self.get_serializer_context().get("workspace")
        if workspace is None:
            return Response(
                {"error": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requirement = serializer.save(workspace=workspace)
        return Response(
            self.get_serializer(requirement).data,
            status=status.HTTP_201_CREATED,
        )

    def _update(self, request, pk, partial):
        requirement = self._get_requirement(pk)
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(
            requirement,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        requirement = serializer.save()
        return Response(
            self.get_serializer(requirement).data,
            status=status.HTTP_200_OK,
        )

    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    def destroy(self, request, slug, pk):
        requirement = self._get_requirement(pk)
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        requirement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementConfigurationAPIView(BaseAPIView):
    def _get_template(self, slug, pk, *, for_update=False):
        queryset = Requirement.objects.filter(
            workspace__slug=slug,
            id=pk,
            is_template=True,
        ).select_related("workspace", "owner")
        if for_update:
            queryset = queryset.select_for_update()
        return queryset.first()

    def _response_payload(self, requirement, created_field_ids=None):
        requirement = (
            Requirement.objects.filter(id=requirement.id)
            .select_related("workspace", "owner")
            .prefetch_related(
                Prefetch(
                    "approvers",
                    queryset=RequirementApprover.objects.select_related(
                        "approver"
                    ).order_by("sort_order", "created_at", "id"),
                )
            )
            .get()
        )
        return {
            "requirement": RequirementSerializer(
                requirement,
                context={
                    "request": self.request,
                    "workspace": requirement.workspace,
                },
            ).data,
            "fields": serialize_requirement_field_tree(requirement),
            "created_field_ids": created_field_ids or {},
        }

    def get(self, request, slug, pk):
        requirement = self._get_template(slug, pk)
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self._response_payload(requirement), status=status.HTTP_200_OK)

    def put(self, request, slug, pk):
        requirement = self._get_template(slug, pk)
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = RequirementConfigurationWriteSerializer(
            data=request.data,
            context={
                "request": request,
                "workspace": requirement.workspace,
                "requirement": requirement,
            },
        )
        serializer.is_valid(raise_exception=True)
        try:
            requirement, created_field_ids = serializer.save()
        except RequirementConfigurationConflict:
            return Response(
                {
                    "error": "The template was updated by another request.",
                    "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )
        except RequirementDataLossError as exc:
            return Response(
                {
                    "error": "Saving this structure will remove existing values.",
                    "code": "REQUIREMENT_SCHEMA_DATA_LOSS",
                    "affected_detail_count": exc.affected_detail_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            self._response_payload(requirement, created_field_ids),
            status=status.HTTP_200_OK,
        )


class RequirementDetailViewSet(BaseViewSet):
    model = RequirementDetail
    serializer_class = RequirementDetailSerializer

    def _get_template(self):
        return Requirement.objects.filter(
            id=self.kwargs.get("requirement_id"),
            workspace__slug=self.workspace_slug,
            is_template=True,
        ).first()

    def get_queryset(self):
        return (
            RequirementDetail.objects.filter(
                requirement_id=self.kwargs.get("requirement_id"),
                requirement__workspace__slug=self.workspace_slug,
                requirement__is_template=True,
            )
            .select_related("requirement")
            .order_by("sort_order", "created_at", "id")
        )

    def list(self, request, slug, requirement_id):
        requirement = self._get_template()
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_filters = request.query_params.get("filters", "[]")
        try:
            filter_payload = json.loads(raw_filters)
        except (TypeError, ValueError, json.JSONDecodeError):
            return Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(filter_payload, list):
            return Response(
                {"filters": "Filters must be a JSON array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        filter_serializer = RequirementDetailFilterSerializer(
            data=filter_payload,
            many=True,
            context={"requirement": requirement},
        )
        filter_serializer.is_valid(raise_exception=True)
        normalized_filters = [
            {
                "field_id": str(item["field_id"]),
                "operator": item["operator"],
                **({"value": item.get("value")} if "value" in item else {}),
            }
            for item in filter_serializer.validated_data
        ]

        queryset = self.get_queryset()
        search = request.query_params.get("search", "")
        if search.strip() or normalized_filters:
            matching_ids = filter_requirement_detail_ids(
                requirement=requirement,
                search=search,
                filters=normalized_filters,
            )
            queryset = queryset.filter(id__in=matching_ids)
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda results: RequirementDetailSerializer(
                results, many=True
            ).data,
            default_per_page=20,
            max_per_page=100,
        )

    def create(self, request, slug, requirement_id):
        requirement = self._get_template()
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = RequirementDetailCreateSerializer(
            data=request.data,
            context={"requirement": requirement},
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                detail = insert_requirement_detail(
                    requirement=requirement,
                    data=serializer.validated_data["data"],
                    actor=request.user,
                    before_id=serializer.validated_data.get("before_id"),
                    after_id=serializer.validated_data.get("after_id"),
                )
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            RequirementDetailSerializer(detail).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, slug, requirement_id, pk):
        requirement = self._get_template()
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = RequirementDetailUpdateSerializer(
            data=request.data,
            context={"requirement": requirement},
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            detail = self.get_queryset().select_for_update().filter(id=pk).first()
            if detail is None:
                return Response(
                    {"error": "Requirement detail not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if detail.version != serializer.validated_data["version"]:
                return Response(
                    {
                        "error": "The detail was updated by another request.",
                        "code": "REQUIREMENT_DETAIL_VERSION_CONFLICT",
                        "current_version": detail.version,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            detail.data = serializer.validated_data["data"]
            detail.version += 1
            detail.updated_by = request.user
            detail.save(
                update_fields=["data", "version", "updated_at", "updated_by"]
            )
        return Response(
            RequirementDetailSerializer(detail).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request, slug, requirement_id, pk):
        detail = self.get_queryset().filter(id=pk).first()
        if detail is None:
            return Response(
                {"error": "Requirement detail not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        detail.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_destroy(self, request, slug, requirement_id):
        requirement = self._get_template()
        if requirement is None:
            return Response(
                {"error": "Requirement template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        ids_serializer = drf_serializers.ListField(
            child=drf_serializers.UUIDField(), allow_empty=False
        )
        try:
            detail_ids = ids_serializer.run_validation(request.data.get("ids"))
        except drf_serializers.ValidationError as exc:
            return Response({"ids": exc.detail}, status=status.HTTP_400_BAD_REQUEST)
        queryset = self.get_queryset().filter(id__in=detail_ids)
        if queryset.count() != len(set(detail_ids)):
            return Response(
                {"ids": "One or more details were not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def bulk_save(self, request, slug, requirement_id):
        with transaction.atomic():
            requirement = (
                Requirement.objects.select_for_update()
                .filter(
                    id=requirement_id,
                    workspace__slug=self.workspace_slug,
                    is_template=True,
                )
                .first()
            )
            if requirement is None:
                return Response(
                    {"error": "Requirement template not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            serializer = RequirementDetailBatchSaveSerializer(
                data=request.data,
                context={"requirement": requirement},
            )
            serializer.is_valid(raise_exception=True)
            if (
                requirement.updated_at
                != serializer.validated_data["expected_updated_at"]
            ):
                return Response(
                    {
                        "error": "The requirement template changed before the batch was saved.",
                        "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                        "current_updated_at": requirement.updated_at,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            try:
                created, updated, deleted_ids = save_requirement_detail_batch(
                    requirement=requirement,
                    creates=serializer.validated_data["creates"],
                    updates=serializer.validated_data["updates"],
                    deletes=serializer.validated_data["deletes"],
                    actor=request.user,
                )
            except RequirementDetailBatchConflict as exc:
                return Response(
                    {
                        "error": "One or more requirement details changed before the batch was saved.",
                        "code": "REQUIREMENT_DETAIL_BATCH_CONFLICT",
                        "conflicts": exc.conflicts,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        return Response(
            {
                "created": [
                    {
                        "client_id": str(client_id),
                        "detail": RequirementDetailSerializer(detail).data,
                    }
                    for client_id, detail in created
                ],
                "updated": RequirementDetailSerializer(updated, many=True).data,
                "deleted_ids": [str(detail_id) for detail_id in deleted_ids],
            },
            status=status.HTTP_200_OK,
        )
