# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import IssueSchemeConfigPermission
from plane.app.serializers.issue_type import TypeExtraFieldSerializer, TypeExtraFieldLiteSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.issue_scheme.scope import IssueSchemeScopeMixin
from django.db import transaction
from django.db.models import Max

from plane.db.models import IssueFieldDefinition, IssueType, TypeExtraField
from plane.utils.issue_scheme import (
    extra_field_references,
    in_use_response_data,
    is_referenced,
    project_visible_type_q,
)


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
        queryset = (
            TypeExtraField.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                scheme_id=self.get_scheme_id(),
                deleted_at__isnull=True,
            )
            .select_related("issue_type", "scheme", "workspace")
            .order_by("sort_order", "created_at")
        )
        if not self.is_scheme_route:
            # 跟随项目只看得到所属研发模式关联的类型的字段
            queryset = queryset.filter(project_visible_type_q(self.kwargs.get("project_id"), "issue_type_id"))
        return queryset

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

    def bind_library(self, request, slug, project_id=None, issue_scheme_id=None):
        """POST …/type-extra-fields/bind-library/ ``{issue_type, library_field_ids}``：给类型批量绑定库字段。

        定义从库里复制（之后随库同步），排在该类型现有字段之后。同类型已有同名字段 → 400。
        """
        scheme_id = self.get_scheme_id()
        issue_type = IssueType.objects.filter(
            pk=request.data.get("issue_type"), scheme_id=scheme_id, workspace__slug=slug
        ).first()
        if issue_type is None:
            return Response({"error": "工作项类型不属于当前项目"}, status=status.HTTP_400_BAD_REQUEST)
        raw_ids = request.data.get("library_field_ids")
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"error": "请选择要添加的字段"}, status=status.HTTP_400_BAD_REQUEST)
        ids = list(dict.fromkeys(str(item) for item in raw_ids))
        definitions = {
            str(d.id): d
            for d in IssueFieldDefinition.objects.filter(id__in=ids, workspace_id=issue_type.workspace_id)
        }
        if len(definitions) != len(ids):
            return Response({"error": "字段不在字段库里"}, status=status.HTTP_400_BAD_REQUEST)
        existing_names = set(TypeExtraField.objects.filter(issue_type=issue_type).values_list("name", flat=True))
        clashes = [definitions[item].name for item in ids if definitions[item].name in existing_names]
        if clashes:
            return Response(
                {"error": f"类型「{issue_type.name}」里已有同名字段：{'、'.join(clashes)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            last = TypeExtraField.objects.filter(issue_type=issue_type).aggregate(m=Max("sort_order"))["m"] or 0
            created = []
            for index, item in enumerate(ids):
                definition = definitions[item]
                created.append(
                    TypeExtraField.objects.create(
                        scheme_id=issue_type.scheme_id,
                        issue_type=issue_type,
                        library_field=definition,
                        sort_order=last + (index + 1) * 10000,
                        **definition.definition_values(),
                    )
                )
        serializer = TypeExtraFieldSerializer(created, many=True, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)
