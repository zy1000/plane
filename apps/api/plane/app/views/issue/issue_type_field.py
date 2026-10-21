# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import IssueSchemeConfigPermission
from plane.app.serializers.issue_type import TypeExtraFieldSerializer, TypeExtraFieldLiteSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.issue_scheme.scope import IssueSchemeScopeMixin
from plane.db.models import TypeExtraField
from plane.utils.issue_scheme import extra_field_references, in_use_response_data, is_referenced


class IssueExtraViewSet(IssueSchemeScopeMixin, BaseViewSet):
    """项目范围内 TypeExtraField 的 REST CRUD（继承 ModelViewSet）。

    - GET / POST …/type-extra-fields/：列表、创建
    - GET / PUT / PATCH / DELETE …/type-extra-fields/<pk>/：详情、全量更新、局部更新、删除（模型默认软删）

    列表可通过 ``?issue_type=<uuid>`` 按工作项类型筛选。
    项目级与方案级（模板中心）路由共用，见 IssueSchemeScopeMixin。
    """

    model = TypeExtraField
    serializer_class = TypeExtraFieldSerializer
    permission_classes = [IssueSchemeConfigPermission]
    filterset_fields = ["issue_type",'is_active']

    def get_queryset(self):
        return (
            TypeExtraField.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                scheme_id=self.get_scheme_id(),
                deleted_at__isnull=True,
            )
            .select_related("issue_type", "scheme", "workspace")
            .order_by("sort_order", "created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(self.serializer_scope_context())
        context["workspace_slug"] = self.kwargs.get("slug")
        return context

    def destroy(self, request, *args, **kwargs):
        # 删除保护（需求 4.3）：字段归方案，任一项目（含已脱离的）有这个字段的值就不能删，只能停用
        field = self.get_object()
        refs = extra_field_references(field.id)
        if is_referenced(refs):
            return Response(in_use_response_data(refs, "字段"), status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.request.query_params.get("lite"):
            return TypeExtraFieldLiteSerializer
        return super().get_serializer_class()