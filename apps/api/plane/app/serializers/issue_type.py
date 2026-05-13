# Third party imports
from rest_framework import serializers


# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType, TypeExtraField, TypeExtraFieldValue
from plane.db.models.issue_type import IssueTypeCategory


class TypeExtraFieldSerializer(BaseSerializer):
    project_id = serializers.UUIDField(source="project.id", read_only=True)
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueType.objects.none(),
        source="issue_type",
    )

    class Meta:
        model = TypeExtraField
        fields = [
            "id",
            "project",
            "project_id",
            "workspace",
            "workspace_id",
            "issue_type",
            "issue_type_id",
            "name",
            "description",
            "logo_props",
            "field_type",
            "is_required",
            "is_default",
            "is_active",
            "sort_order",
            "options",
            "default_value",
            "validation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "project",
            "workspace",
            "issue_type",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        project_id = self.context.get("project_id")
        workspace_slug = self.context.get("workspace_slug")
        issue_type_queryset = IssueType.objects.none()

        if project_id or workspace_slug:
            issue_type_queryset = IssueType.objects.filter(deleted_at__isnull=True)
            if project_id:
                issue_type_queryset = issue_type_queryset.filter(project_id=project_id)
            if workspace_slug:
                issue_type_queryset = issue_type_queryset.filter(
                    workspace__slug=workspace_slug
                )

        self.fields["issue_type_id"].queryset = issue_type_queryset

    def validate(self, attrs):
        attrs = super().validate(attrs)

        issue_type = attrs.get("issue_type") or getattr(
            self.instance, "issue_type", None
        )
        project_id = self.context.get("project_id") or getattr(
            getattr(self.instance, "project", None), "id", None
        )

        if issue_type and project_id and str(issue_type.project_id) != str(project_id):
            raise serializers.ValidationError(
                {"issue_type_id": "工作项类型不属于当前项目"}
            )

        return attrs

    def create(self, validated_data):
        validated_data.setdefault("project", validated_data["issue_type"].project)
        return super().create(validated_data)


class TypeExtraFieldLiteSerializer(BaseSerializer):

    class Meta:
        model = TypeExtraField
        fields = ["id", "name"]


class IssueTypeExtraFieldSerializer(BaseSerializer):
    class Meta:
        model = TypeExtraField
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "field_type",
            "is_required",
            "is_default",
            "is_active",
            "sort_order",
            "options",
            "default_value",
            "validation",
        ]


class TypeExtraFieldValueWriteSerializer(serializers.Serializer):
    """工作项创建/更新时单个自定义字段值的输入校验。

    仅做最基础的形状校验，复杂的字段类型/必填/选项校验由
    `IssueCreateSerializer.validate` 中统一执行，因为那里能拿到
    `project_id` / `type_id` 的上下文。
    """

    extra_field_id = serializers.UUIDField()
    value = serializers.JSONField(required=False, allow_null=True)


class TypeExtraFieldValueReadSerializer(serializers.Serializer):
    """工作项详情/创建响应中单个自定义字段值的输出形态。"""

    extra_field_id = serializers.UUIDField()
    field_type = serializers.CharField()
    value = serializers.JSONField(allow_null=True)


class IssueTypeCategorySerializer(BaseSerializer):
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = IssueTypeCategory
        fields = [
            "id",
            "workspace",
            "workspace_id",
            "name",
            "description",
            "is_system",
        ]
        read_only_fields = ["is_system", "workspace"]


class IssueTypeSerializer(BaseSerializer):
    project_id = serializers.UUIDField(source="project.id", read_only=True)
    extra_fields = serializers.SerializerMethodField()
    # 暴露 category 为可写外键：写入时使用 `category_id`，工作区上下文下限定 queryset，
    # 避免跨工作区指向不属于当前 workspace 的类别。
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueTypeCategory.objects.none(),
        source="category",
        required=False,
        allow_null=True,
    )
    category_name = serializers.CharField(source="category.name", read_only=True, allow_null=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        workspace_slug = self.context.get("workspace_slug")
        if workspace_slug:
            self.fields["category_id"].queryset = IssueTypeCategory.objects.filter(
                workspace__slug=workspace_slug
            )

    def get_extra_fields(self, obj):
        active_fields = obj.extra_fields.filter(is_active=True)
        return IssueTypeExtraFieldSerializer(active_fields, many=True).data

    class Meta:
        model = IssueType
        fields = [
            "id",
            "project",
            "project_id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_default",
            "is_active",
            "level",
            "external_source",
            "external_id",
            "workspace",
            "extra_fields",
            "category_id",
            "category_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "workspace", "created_at", "updated_at"]
