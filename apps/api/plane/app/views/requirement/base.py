from django.core.exceptions import ValidationError
from django.db.models import Count, Prefetch, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions.base import is_workspace_member
from plane.app.serializers.requirement import (
    RequirementConfigurationConflict,
    RequirementConfigurationWriteSerializer,
    RequirementSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.app.views.requirement.detail_base import BaseRequirementDetailViewSet
from plane.app.views.requirement.library_item import get_scoped_library
from plane.app.views.requirement.mixins import (
    RequirementDraftDispatchMixin,
    resolve_detail_layer,
    resolve_requirement_fields,
)
from plane.db.models import (
    Product,
    Requirement,
    RequirementApprover,
    RequirementChangeApproval,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementDetail,
    Workspace,
)
from plane.utils.product import (
    can_edit_product_requirements,
    can_manage_workspace_products,
    can_view_product,
)
from plane.utils.requirement import (
    detail_grid_expected_updated_at,
    field_tree_from_specs,
    requirement_types_field_payload_from_specs,
)


def pending_change_requests():
    """待审批的变更单（含审批记录），供需求序列化器判断「待我审批」。"""
    return (
        RequirementChangeRequest.objects.filter(status=RequirementChangeStatus.PENDING)
        .order_by("-created_at")
        .prefetch_related(
            Prefetch(
                "approvals",
                queryset=RequirementChangeApproval.objects.order_by(
                    "created_at", "id"
                ),
            )
        )
    )


class RequirementViewSet(BaseViewSet):
    model = Requirement
    serializer_class = RequirementSerializer
    search_fields = ["title"]
    filterset_fields = {
        "product_id": ["exact"],
        "project_id": ["exact"],
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
                "owner",
                "created_by",
                "updated_by",
            )
            .prefetch_related(
                Prefetch("approvers", queryset=approvers),
                Prefetch(
                    "change_requests",
                    queryset=pending_change_requests(),
                    to_attr="pending_change_requests",
                ),
            )
            .annotate(
                detail_count=Count(
                    "details",
                    filter=Q(details__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
        )
        workspace = Workspace.objects.filter(slug=self.workspace_slug).first()
        if workspace is not None and not can_manage_workspace_products(
            self.request.user, workspace
        ):
            product_visibility = (
                Q(product__owner=self.request.user)
                | Q(product__reviewers=self.request.user)
                | Q(product__member_product__member=self.request.user)
            )
            if is_workspace_member(self.request.user, self.workspace_slug):
                product_visibility |= Q(product__network=2)
            # product__isnull=True 这一支放行的是项目需求（它们没有产品可见性）
            queryset = queryset.filter(
                Q(product__isnull=True) | product_visibility
            ).distinct()
        return self.filter_queryset(queryset)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_requirement(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def _get_request_product(self, product_id):
        if not product_id:
            return None
        try:
            product = (
                Product.objects.filter(
                    id=product_id,
                    workspace__slug=self.workspace_slug,
                )
                .select_related("workspace")
                .prefetch_related("reviewers")
                .first()
            )
        except (ValidationError, ValueError):
            return None
        if product is None or not can_view_product(self.request.user, product):
            return None
        return product

    @staticmethod
    def _can_write(user, requirement):
        if requirement.product_id:
            return can_edit_product_requirements(user, requirement.product)
        return True

    def list(self, request, slug):
        product_id = request.query_params.get("product_id")
        if product_id and self._get_request_product(product_id) is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
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

        product_id = request.data.get("product_id")
        if product_id:
            product = self._get_request_product(product_id)
            if product is None:
                return Response(
                    {"error": "Product not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if not can_edit_product_requirements(request.user, product):
                return Response(
                    {
                        "error": (
                            "You do not have permission to maintain product requirements."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
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
        if not self._can_write(request.user, requirement):
            return Response(
                {"error": "You do not have permission to maintain this requirement."},
                status=status.HTTP_403_FORBIDDEN,
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
        if not self._can_write(request.user, requirement):
            return Response(
                {"error": "You do not have permission to maintain this requirement."},
                status=status.HTTP_403_FORBIDDEN,
            )
        requirement.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementConfigurationAPIView(RequirementDraftDispatchMixin, BaseAPIView):
    def _get_requirement(self, slug, pk, *, for_update=False):
        queryset = (
            Requirement.objects.filter(
                workspace__slug=slug, id=pk, product__isnull=False
            ).select_related("workspace", "product", "owner")
        )
        if for_update:
            queryset = queryset.select_for_update(of=("self",))
        requirement = queryset.first()
        if (
            requirement is not None
            and requirement.product_id
            and not can_view_product(self.request.user, requirement.product)
        ):
            return None
        return requirement

    @staticmethod
    def _can_write(user, requirement):
        return not requirement.product_id or can_edit_product_requirements(
            user, requirement.product
        )

    def _response_payload(self, requirement):
        requirement = (
            Requirement.objects.filter(id=requirement.id)
            .select_related("workspace", "owner")
            .prefetch_related(
                Prefetch(
                    "approvers",
                    queryset=RequirementApprover.objects.select_related(
                        "approver"
                    ).order_by("sort_order", "created_at", "id"),
                ),
                Prefetch(
                    "change_requests",
                    queryset=pending_change_requests(),
                    to_attr="pending_change_requests",
                ),
            )
            .get()
        )
        draft = self.draft_for_read(requirement)
        payload = {
            "requirement": RequirementSerializer(
                requirement,
                context={
                    "request": self.request,
                    "workspace": requirement.workspace,
                },
            ).data,
        }

        # 产品需求是需求类型的集合：requirement_types 供数据页分视图，fields 保留成
        # 扁平并集，让变更记录与版本对比这两个 tab 完全不用改。
        (
            requirement_type_ids,
            specs,
            by_requirement_type,
            is_frozen,
        ) = resolve_requirement_fields(requirement=requirement, draft=draft)
        payload["requirement_types"] = requirement_types_field_payload_from_specs(
            requirement_type_ids, by_requirement_type
        )
        payload["fields"] = field_tree_from_specs(specs)
        payload["is_frozen"] = is_frozen
        payload["detail_expected_updated_at"] = detail_grid_expected_updated_at(
            owner=requirement, requirement_type_ids=requirement_type_ids
        )
        return payload

    def get(self, request, slug, pk):
        requirement = self._get_requirement(slug, pk)
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self._response_payload(requirement), status=status.HTTP_200_OK)

    def put(self, request, slug, pk):
        requirement = self._get_requirement(slug, pk)
        if requirement is None:
            return Response(
                {"error": "Requirement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not self._can_write(request.user, requirement):
            return Response(
                {"error": "You do not have permission to maintain this requirement."},
                status=status.HTTP_403_FORBIDDEN,
            )
        read_only = self.read_only_response(requirement)
        if read_only is not None:
            return read_only
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
            requirement = serializer.save()
        except RequirementConfigurationConflict:
            return Response(
                {
                    "error": "The requirement was updated by another request.",
                    "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            self._response_payload(requirement),
            status=status.HTTP_200_OK,
        )


class RequirementDetailViewSet(RequirementDraftDispatchMixin, BaseRequirementDetailViewSet):
    """产品需求的明细行，按需分派到正式表或工作副本。"""

    def resolve_owner(self, *, for_update=False):
        # 需求类型只定义字段、不持有明细，所以明细入口只放行产品需求
        queryset = (
            Requirement.objects.filter(
                id=self.kwargs.get("requirement_id"),
                workspace__slug=self.workspace_slug,
                product__isnull=False,
            )
            .select_related("workspace", "product")
        )
        if for_update:
            queryset = queryset.select_for_update(of=("self",))
        requirement = queryset.first()
        if requirement is not None and not can_view_product(
            self.request.user, requirement.product
        ):
            return None
        return requirement

    def can_write(self, owner):
        return can_edit_product_requirements(self.request.user, owner.product)

    def resolve_layer(self, owner, *, for_write):
        if not for_write:
            return (
                resolve_detail_layer(
                    requirement=owner,
                    draft=self.draft_for_read(owner),
                ),
                None,
            )
        read_only = self.read_only_response(owner)
        if read_only is not None:
            return None, read_only
        return (
            resolve_detail_layer(
                requirement=owner,
                draft=self.draft_for_write(owner, self.request.user),
            ),
            None,
        )

    def resolve_library(self, library_id):
        return get_scoped_library(
            slug=self.workspace_slug,
            library_id=library_id,
        )

    def get_queryset(self):
        return (
            RequirementDetail.objects.filter(
                requirement_id=self.kwargs.get("requirement_id"),
                requirement__workspace__slug=self.workspace_slug,
                requirement__product__isnull=False,
            )
            .select_related("requirement")
            .order_by("sort_order", "created_at", "id")
        )
