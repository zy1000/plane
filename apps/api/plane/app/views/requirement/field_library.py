"""需求通用字段库：workspaces/<slug>/requirement-field-definitions/。

库字段的定义全工作区统一，需求类型通过 ``RequirementField.library_field`` 绑定；保存库字段时
定义同步到全部绑定它的类型（utils/requirement_field_library.py）。
鉴权同需求类型：读 = 工作区成员，写 = workspace.requirement_type.manage。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, has_workspace_permission
from plane.app.serializers.requirement_field_library import (
    RequirementFieldDefinitionWriteSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    RequirementField,
    RequirementFieldDefinition,
    Workspace,
)
from plane.utils.requirement_field_library import (
    RequirementFieldLibraryDataLoss,
    RequirementFieldLibraryError,
    load_definitions,
    promote_field_to_definition,
    save_field_definition,
    serialize_definitions,
)

from .type import is_workspace_member

#: 保存会清掉已有字段值，需要用户确认后带 confirm_data_loss 重发
REQUIREMENT_FIELD_LIBRARY_DATA_LOSS = "REQUIREMENT_FIELD_LIBRARY_DATA_LOSS"
#: 删除仍被需求类型绑定的库字段
REQUIREMENT_FIELD_DEFINITION_IN_USE = "REQUIREMENT_FIELD_DEFINITION_IN_USE"


def _can_manage(user, slug):
    return has_workspace_permission(
        user, slug, PermissionKey.WORKSPACE_REQUIREMENT_TYPE_MANAGE
    )


def _forbidden():
    return Response(
        {"error": "没有维护需求通用字段的权限。"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _first_error(errors):
    """DRF 的 {字段: [消息]} 收成前端 toast 直接显示的 {error}。"""
    for value in errors.values():
        while isinstance(value, (list, dict)) and value:
            value = value[0] if isinstance(value, list) else next(iter(value.values()))
        return {"error": str(value), **errors}
    return {"error": "参数不正确"}


def _serialize_one(definition):
    return serialize_definitions(
        load_definitions(definition.workspace_id, [definition.id])
    )[0]


class RequirementFieldDefinitionViewSet(BaseViewSet):
    model = RequirementFieldDefinition

    def _workspace(self, slug):
        return Workspace.objects.filter(slug=slug).first()

    def _definition(self, slug, pk):
        return RequirementFieldDefinition.objects.filter(
            workspace__slug=slug, parent__isnull=True, pk=pk
        ).first()

    def list(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        workspace = self._workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            serialize_definitions(load_definitions(workspace.id)),
            status=status.HTTP_200_OK,
        )

    def _save(self, request, workspace, definition):
        serializer = RequirementFieldDefinitionWriteSerializer(
            data=request.data,
            context={"workspace": workspace, "definition": definition},
        )
        if not serializer.is_valid():
            return Response(_first_error(serializer.errors), status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        try:
            saved = save_field_definition(
                workspace=workspace,
                definition=definition,
                data=data,
                actor=request.user,
                confirm_data_loss=data["confirm_data_loss"],
            )
        except RequirementFieldLibraryDataLoss as exc:
            return Response(
                {
                    "error": "保存后部分需求的字段值会被清除。",
                    "code": REQUIREMENT_FIELD_LIBRARY_DATA_LOSS,
                    "affected_requirement_count": sum(count for _, count in exc.affected),
                    "affected": [
                        {
                            "requirement_type_id": str(requirement_type.id),
                            "name": requirement_type.name,
                            "logo_props": requirement_type.logo_props or {},
                            "affected_requirement_count": count,
                        }
                        for requirement_type, count in exc.affected
                    ],
                },
                status=status.HTTP_409_CONFLICT,
            )
        except (RequirementFieldLibraryError, ValueError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            _serialize_one(saved),
            status=status.HTTP_201_CREATED if definition is None else status.HTTP_200_OK,
        )

    def create(self, request, slug):
        if not _can_manage(request.user, slug):
            return _forbidden()
        workspace = self._workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return self._save(request, workspace, None)

    def partial_update(self, request, slug, pk):
        if not _can_manage(request.user, slug):
            return _forbidden()
        definition = self._definition(slug, pk)
        if definition is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        return self._save(request, definition.workspace, definition)

    def destroy(self, request, slug, pk):
        if not _can_manage(request.user, slug):
            return _forbidden()
        definition = self._definition(slug, pk)
        if definition is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        # 回收站里的绑定行也算：值还在，库字段没了它们就恢复不成通用字段了
        binding_count = (
            RequirementField.objects.filter(
                library_field=definition,
                parent_field__isnull=True,
                requirement_type__deleted_at__isnull=True,
            )
            .values("requirement_type_id")
            .distinct()
            .count()
        )
        if binding_count:
            return Response(
                {
                    "error": f"还有 {binding_count} 个需求类型在用该字段（含回收站），请先从这些类型里移除。",
                    "code": REQUIREMENT_FIELD_DEFINITION_IN_USE,
                    "binding_count": binding_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        # 子定义自己同步删：软删级联走 Celery，等它的话列表接口会短暂读到孤儿子字段
        for child in definition.children.all():
            child.delete()
        definition.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequirementFieldPromoteAPIView(BaseAPIView):
    """把需求类型里的一个私有字段转为通用字段（原地绑定，字段 id 与已有值不变）。"""

    def post(self, request, slug, pk, field_id):
        if not _can_manage(request.user, slug):
            return _forbidden()
        field = RequirementField.objects.filter(
            requirement_type__workspace__slug=slug,
            requirement_type_id=pk,
            pk=field_id,
        ).first()
        if field is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        try:
            definition = promote_field_to_definition(field)
        except RequirementFieldLibraryError as exc:
            return Response(
                {"error": str(exc), "code": exc.code},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(_serialize_one(definition), status=status.HTTP_201_CREATED)
