# Module imports
from plane.app.permissions import ProjectMemberPermission
from plane.app.serializers.issue_type import TypeExtraFieldSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import TypeExtraField


class IssueExtraViewSet(BaseViewSet):
    """项目范围内 TypeExtraField 的 REST CRUD（继承 ModelViewSet）。

    - GET / POST …/type-extra-fields/：列表、创建
    - GET / PUT / PATCH / DELETE …/type-extra-fields/<pk>/：详情、全量更新、局部更新、删除（模型默认软删）

    列表可通过 ``?issue_type=<uuid>`` 按工作项类型筛选。
    """

    model = TypeExtraField
    serializer_class = TypeExtraFieldSerializer
    permission_classes = [ProjectMemberPermission]
    filterset_fields = ["issue_type"]

    def get_queryset(self):
        return (
            TypeExtraField.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
            )
            .select_related("issue_type", "project", "workspace")
            .order_by("sort_order", "created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["project_id"] = self.kwargs.get("project_id")
        context["workspace_slug"] = self.kwargs.get("slug")
        return context
