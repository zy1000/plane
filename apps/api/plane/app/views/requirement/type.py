from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.requirement import RequirementConfigurationConflict
from plane.app.serializers.requirement_type import (
    RequirementTypeConfigurationWriteSerializer,
    RequirementTypeSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    Requirement,
    RequirementDraftRow,
    RequirementLibrary,
    RequirementType,
    Workspace,
)
from plane.utils.requirement import (
    RequirementBuiltinFieldError,
    RequirementDataLossError,
    serialize_requirement_type_field_tree,
)


def _requirement_type_queryset(slug):
    """字段与标准库计数都要排除软删除行 —— 删过字段的类型否则会永久虚高。"""
    return (
        RequirementType.objects.filter(workspace__slug=slug)
        .select_related("workspace", "owner", "created_by", "updated_by")
        .annotate(
            field_count=Count(
                "fields",
                filter=Q(fields__deleted_at__isnull=True),
                distinct=True,
            ),
            library_count=Count(
                "libraries",
                filter=Q(libraries__deleted_at__isnull=True),
                distinct=True,
            ),
        )
    )


class RequirementTypeViewSet(BaseViewSet):
    """需求类型：工作区级的字段定义源，工作区成员即可维护。"""

    model = RequirementType
    serializer_class = RequirementTypeSerializer
    search_fields = ["name"]
    filterset_fields = {"is_active": ["exact"]}

    def get_queryset(self):
        return self.filter_queryset(_requirement_type_queryset(self.workspace_slug))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_requirement_type(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, pk):
        requirement_type = self._get_requirement_type(pk)
        if requirement_type is None:
            return Response(
                {"error": "Requirement type not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(requirement_type).data,
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
        requirement_type = serializer.save(workspace=workspace)
        return Response(
            self.get_serializer(requirement_type).data,
            status=status.HTTP_201_CREATED,
        )

    def _update(self, request, pk, partial):
        requirement_type = self._get_requirement_type(pk)
        if requirement_type is None:
            return Response(
                {"error": "Requirement type not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(
            requirement_type,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        requirement_type = serializer.save()
        return Response(
            self.get_serializer(requirement_type).data,
            status=status.HTTP_200_OK,
        )

    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    def destroy(self, request, slug, pk):
        requirement_type = self._get_requirement_type(pk)
        if requirement_type is None:
            return Response(
                {"error": "Requirement type not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 字段实时引用需求类型，类型被引用时删掉会让引用方失去字段定义。
        #
        # 这个判断是**唯一的实际保护**，不是防御性检查：软删除不会触发外键的
        # PROTECT，而 soft_delete_related_objects 把 PROTECT 当 CASCADE 处理，
        # 所以真删下去会把引用它的需求行一起软删掉。
        if (
            RequirementLibrary.objects.filter(requirement_type=requirement_type).exists()
            or Requirement.objects.filter(
                requirement_type=requirement_type
            ).exists()
            or RequirementDraftRow.objects.filter(
                requirement_type=requirement_type
            ).exists()
        ):
            return Response(
                {
                    "error": "This requirement type is still in use.",
                    "code": "REQUIREMENT_TYPE_IN_USE",
                },
                status=status.HTTP_409_CONFLICT,
            )

        requirement_type.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementTypeConfigurationAPIView(BaseAPIView):
    """需求类型的字段结构读写入口。"""

    def _get_requirement_type(self, slug, pk):
        return _requirement_type_queryset(slug).filter(id=pk).first()

    def _response_payload(self, requirement_type, created_field_ids=None):
        return {
            "requirement_type": RequirementTypeSerializer(
                requirement_type,
                context={
                    "request": self.request,
                    "workspace": requirement_type.workspace,
                },
            ).data,
            "fields": serialize_requirement_type_field_tree(requirement_type),
            "created_field_ids": created_field_ids or {},
        }

    def get(self, request, slug, pk):
        requirement_type = self._get_requirement_type(slug, pk)
        if requirement_type is None:
            return Response(
                {"error": "Requirement type not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self._response_payload(requirement_type),
            status=status.HTTP_200_OK,
        )

    def put(self, request, slug, pk):
        requirement_type = self._get_requirement_type(slug, pk)
        if requirement_type is None:
            return Response(
                {"error": "Requirement type not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = RequirementTypeConfigurationWriteSerializer(
            data=request.data,
            context={
                "request": request,
                "workspace": requirement_type.workspace,
                "requirement_type": requirement_type,
            },
        )
        serializer.is_valid(raise_exception=True)
        try:
            requirement_type, created_field_ids = serializer.save()
        except RequirementConfigurationConflict:
            return Response(
                {
                    "error": "The requirement type was updated by another request.",
                    "code": "REQUIREMENT_CONFIGURATION_CONFLICT",
                },
                status=status.HTTP_409_CONFLICT,
            )
        except RequirementDataLossError as exc:
            return Response(
                {
                    "error": "Saving this structure will remove existing values.",
                    "code": "REQUIREMENT_SCHEMA_DATA_LOSS",
                    "affected_requirement_count": exc.affected_row_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except RequirementBuiltinFieldError as exc:
            return Response(
                {"error": str(exc), "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            self._response_payload(requirement_type, created_field_ids),
            status=status.HTTP_200_OK,
        )
