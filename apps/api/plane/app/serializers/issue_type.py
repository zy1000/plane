# Third party imports
from rest_framework import serializers


# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType, TypeExtraField


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


class IssueTypeSerializer(BaseSerializer):
    project_id = serializers.UUIDField(source="project.id", read_only=True)
    extra_fields = serializers.SerializerMethodField()

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
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["project", "workspace", "created_at", "updated_at"]
