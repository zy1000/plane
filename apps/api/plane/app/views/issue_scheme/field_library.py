"""通用字段库：workspaces/<slug>/issue-fields/。

库字段的定义（名称、类型、选项、说明、必填、默认值、校验、启用）全工作区统一；类型通过
``TypeExtraField.library_field`` 绑定，保存库字段时定义同步到全部绑定行（``IssueFieldDefinition.save``）。
鉴权走研发模式权限（读要 view 或 manage，写要 manage），同类型库。
"""

from django.db.models import Count, Max, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.issue_type import IssueFieldDefinitionSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import IssueFieldDefinition, IssueScheme, TypeExtraField, Workspace

DEV_MODE_READ_KEYS = (PermissionKey.WORKSPACE_DEV_MODE_VIEW, PermissionKey.WORKSPACE_DEV_MODE_MANAGE)

#: 删除仍被类型绑定的库字段
ISSUE_FIELD_IN_USE = "ISSUE_FIELD_IN_USE"


class IssueFieldDefinitionViewSet(BaseViewSet):
    model = IssueFieldDefinition
    serializer_class = IssueFieldDefinitionSerializer

    def get_queryset(self):
        return (
            IssueFieldDefinition.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .annotate(
                binding_count=Count("bindings", filter=Q(bindings__deleted_at__isnull=True), distinct=True)
            )
            .order_by("sort_order", "created_at")
        )

    def _workspace(self):
        return Workspace.objects.filter(slug=self.kwargs.get("slug")).first()

    def _with_usage(self, definitions):
        """补 used_by（类型库里绑定它的类型）与 binding_count（全工作区绑定行数，含自定义项目拷出的类型）。"""
        definitions = list(definitions)
        if not definitions:
            return []
        library_ids = list(
            IssueScheme.objects.filter(workspace_id=definitions[0].workspace_id, project__isnull=True).values_list(
                "id", flat=True
            )
        )
        used_by = {}
        for row in (
            TypeExtraField.objects.filter(
                library_field_id__in=[d.id for d in definitions],
                scheme_id__in=library_ids,
                issue_type__deleted_at__isnull=True,
            )
            .select_related("issue_type")
            .order_by("issue_type__level", "issue_type__created_at")
        ):
            used_by.setdefault(row.library_field_id, []).append(
                {
                    "issue_type_id": str(row.issue_type_id),
                    "name": row.issue_type.name,
                    "logo_props": row.issue_type.logo_props,
                }
            )
        data = IssueFieldDefinitionSerializer(definitions, many=True).data
        for item, definition in zip(data, definitions):
            item["used_by"] = used_by.get(definition.id, [])
            count = getattr(definition, "binding_count", None)
            item["binding_count"] = (
                count if count is not None else definition.bindings.filter(deleted_at__isnull=True).count()
            )
        return data

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug):
        return Response(self._with_usage(self.get_queryset()), status=status.HTTP_200_OK)

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        definition = self.get_queryset().filter(pk=pk).first()
        if definition is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._with_usage([definition])[0], status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def create(self, request, slug):
        workspace = self._workspace()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueFieldDefinitionSerializer(data=request.data, context={"workspace_id": workspace.id})
        if not serializer.is_valid():
            return Response(_first_error(serializer.errors), status=status.HTTP_400_BAD_REQUEST)
        last = IssueFieldDefinition.objects.filter(workspace_id=workspace.id).aggregate(m=Max("sort_order"))["m"] or 0
        definition = serializer.save(workspace_id=workspace.id, sort_order=last + 10000)
        return Response(self._with_usage([definition])[0], status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        definition = IssueFieldDefinition.objects.filter(workspace__slug=slug, pk=pk).first()
        if definition is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        serializer = IssueFieldDefinitionSerializer(
            definition, data=request.data, partial=True, context={"workspace_id": definition.workspace_id}
        )
        if not serializer.is_valid():
            return Response(_first_error(serializer.errors), status=status.HTTP_400_BAD_REQUEST)
        # save() 在同一事务里把定义同步到全部绑定行
        definition = serializer.save()
        return Response(self._with_usage([definition])[0], status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        definition = IssueFieldDefinition.objects.filter(workspace__slug=slug, pk=pk).first()
        if definition is None:
            return Response({"error": "字段不存在"}, status=status.HTTP_404_NOT_FOUND)
        binding_count = definition.bindings.filter(deleted_at__isnull=True).count()
        if binding_count:
            return Response(
                {
                    "error": f"还有 {binding_count} 个类型在用该字段，请先从这些类型里移除",
                    "code": ISSUE_FIELD_IN_USE,
                    "binding_count": binding_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        # 软删的绑定行（类型里移除过的）仍以 RESTRICT 引用它：解开引用再硬删，名字立刻可以复用
        TypeExtraField.all_objects.filter(library_field_id=definition.id).update(library_field_id=None)
        definition.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _first_error(errors):
    """DRF 的 {字段: [消息]} 收成前端 toast 直接显示的 {error}。"""
    for value in errors.values():
        message = value[0] if isinstance(value, list) and value else value
        return {"error": str(message), **errors}
    return {"error": "参数不正确"}
