# Third party imports
from rest_framework import serializers


# Module imports
from .base import BaseSerializer
from plane.db.models import IssueFieldDefinition, IssueType, Project, TypeExtraField, TypeExtraFieldValue
from plane.db.models.issue_type import LIBRARY_FIELD_DEFINITION_COLUMNS, IssueTypeCategory

#: 绑定了库字段的类型字段只能改这些
LIBRARY_BOUND_EDITABLE_FIELDS = {"sort_order", "issue_type"}


class TypeExtraFieldSerializer(BaseSerializer):
    # 字段归方案。project / project_id 取方案的归属项目（模式方案为空），保留给老调用方
    project = serializers.UUIDField(source="scheme.project_id", read_only=True)
    project_id = serializers.UUIDField(source="scheme.project_id", read_only=True)
    scheme_id = serializers.UUIDField(read_only=True)
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)
    issue_type_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueType.objects.none(),
        source="issue_type",
    )
    # 非空 = 绑定了通用字段库里的字段，定义由库统一维护
    library_field_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = TypeExtraField
        fields = [
            "id",
            "library_field_id",
            "project",
            "project_id",
            "scheme_id",
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
            "workspace",
            "issue_type",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        project_id = self.context.get("project_id")
        scheme_id = self.context.get("scheme_id")
        workspace_slug = self.context.get("workspace_slug")
        issue_type_queryset = IssueType.objects.none()

        if scheme_id or project_id or workspace_slug:
            issue_type_queryset = IssueType.objects.filter(deleted_at__isnull=True)
            if scheme_id:
                # 只能挂到当前方案里的类型上
                issue_type_queryset = issue_type_queryset.filter(scheme_id=scheme_id)
            elif project_id:
                # 只能挂到本项目所用方案里的类型上
                issue_type_queryset = issue_type_queryset.filter(scheme__projects=project_id)
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
        project_id = self.context.get("project_id")
        scheme_id = self.context.get("scheme_id")

        if issue_type and scheme_id and str(issue_type.scheme_id) != str(scheme_id):
            raise serializers.ValidationError(
                {"issue_type_id": "工作项类型不属于当前项目"}
            )
        if issue_type and not scheme_id and project_id and not Project.objects.filter(
            pk=project_id, issue_scheme_id=issue_type.scheme_id
        ).exists():
            raise serializers.ValidationError(
                {"issue_type_id": "工作项类型不属于当前项目"}
            )
        if issue_type and self.instance is not None and issue_type.scheme_id != self.instance.scheme_id:
            raise serializers.ValidationError(
                {"issue_type_id": "工作项类型不属于当前项目"}
            )
        # 绑定库字段的行：定义只能到字段库改，这里只能调排序
        if self.instance is not None and self.instance.library_field_id:
            changed = [
                key
                for key, value in attrs.items()
                if key not in LIBRARY_BOUND_EDITABLE_FIELDS and getattr(self.instance, key, None) != value
            ]
            if changed or (attrs.get("issue_type") and attrs["issue_type"].id != self.instance.issue_type_id):
                raise serializers.ValidationError({"error": "字段库字段请到字段库修改"})

        return attrs

    def create(self, validated_data):
        validated_data.setdefault("scheme_id", validated_data["issue_type"].scheme_id)
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
    # 类型归方案。project / project_id 取方案的归属项目（模式方案为空），保留给老调用方
    project = serializers.UUIDField(source="scheme.project_id", read_only=True)
    project_id = serializers.UUIDField(source="scheme.project_id", read_only=True)
    scheme_id = serializers.UUIDField(read_only=True)
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
            "scheme_id",
            "name",
            # 系统标识：种子类型的固定英文 key，代码按它判断；只读，用户自建的类型恒为空
            "system_key",
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
        read_only_fields = ["workspace", "system_key", "created_at", "updated_at"]


class IssueFieldDefinitionSerializer(BaseSerializer):
    """通用字段库的字段。``used_by`` / ``binding_count`` 由视图补。"""

    workspace_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = IssueFieldDefinition
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "logo_props",
            "field_type",
            "is_required",
            "is_active",
            "sort_order",
            "options",
            "default_value",
            "validation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "workspace_id", "created_at", "updated_at"]

    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("字段名称不能为空")
        workspace_id = self.context.get("workspace_id")
        duplicates = IssueFieldDefinition.objects.filter(workspace_id=workspace_id, name=name)
        if self.instance is not None:
            duplicates = duplicates.exclude(pk=self.instance.pk)
        if duplicates.exists():
            raise serializers.ValidationError("字段库里已有同名字段")
        if self.instance is not None and name != self.instance.name:
            # 改名后不能和某个已绑定类型下的私有字段重名（同类型字段名唯一）
            bound_type_ids = self.instance.bindings.filter(deleted_at__isnull=True).values_list("issue_type_id", flat=True)
            clash = (
                TypeExtraField.objects.filter(issue_type_id__in=list(bound_type_ids), name=name)
                .exclude(library_field_id=self.instance.pk)
                .select_related("issue_type")
                .first()
            )
            if clash is not None:
                raise serializers.ValidationError(f"类型「{clash.issue_type.name}」里已有同名字段")
        return name
