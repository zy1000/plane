# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from django.db.models import Max
from plane.app.serializers.workspace import WorkspaceLiteSerializer
from plane.app.serializers.user import UserLiteSerializer, UserAdminLiteSerializer
from plane.app.permissions.base import _get_user_project_permission_keys
from plane.db.models import (
    Permission,
    Project,
    ProjectMember,
    ProjectMemberInvite,
    ProjectIdentifier,
    DeployBoard,
    ProjectPublicMember,
    IssueSequence,
)
from plane.utils.content_validator import validate_html_content
from ...db.models.project import (
    ProjectAnnouncement,
    ProjectPmsInfo,
    ProjectRole,
    validate_estimated_hours_half_step,
)


class ProjectSerializer(BaseSerializer):
    workspace_detail = WorkspaceLiteSerializer(source="workspace", read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")

    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ["workspace", "deleted_at"]

    def validate_name(self, name):
        project_id = self.instance.id if self.instance else None
        workspace_id = self.context["workspace_id"]

        project = Project.objects.filter(name=name, workspace_id=workspace_id)

        if project_id:
            project = project.exclude(id=project_id)

        if project.exists():
            raise serializers.ValidationError(
                detail="PROJECT_NAME_ALREADY_EXIST",
            )

        return name

    def validate_identifier(self, identifier):
        project_id = self.instance.id if self.instance else None
        workspace_id = self.context["workspace_id"]

        project = Project.objects.filter(identifier=identifier, workspace_id=workspace_id)

        if project_id:
            project = project.exclude(id=project_id)

        if project.exists():
            raise serializers.ValidationError(
                detail="PROJECT_IDENTIFIER_ALREADY_EXIST",
            )

        return identifier

    def validate_estimated_hours(self, value):
        if value is None:
            return value
        try:
            validate_estimated_hours_half_step(value)
        except DjangoValidationError:
            raise serializers.ValidationError("ESTIMATED_HOURS_HALF_STEP")
        return value

    def validate(self, data):
        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(str(data["description_html"]))
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

            if not is_valid:
                raise serializers.ValidationError({"error": "html content is not valid"})

        return data

    def create(self, validated_data):
        workspace_id = self.context["workspace_id"]

        project = Project.objects.create(**validated_data, workspace_id=workspace_id)

        ProjectIdentifier.objects.create(name=project.identifier, project=project, workspace_id=workspace_id)

        return project


class ProjectLiteSerializer(BaseSerializer):
    class Meta:
        model = Project
        fields = [
            "id",
            "identifier",
            "name",
            "cover_image",
            "cover_image_url",
            "logo_props",
            "description",
            "grade",
        ]
        read_only_fields = fields


class ProjectListSerializer(DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)
    sort_order = serializers.FloatField(read_only=True)
    member_role = serializers.IntegerField(read_only=True)
    anchor = serializers.CharField(read_only=True)
    members = serializers.SerializerMethodField()
    cover_image_url = serializers.CharField(read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")
    next_work_item_sequence = serializers.SerializerMethodField()

    def get_members(self, obj):
        project_members = getattr(obj, "members_list", None)
        if project_members is not None:
            # Filter members by the project ID
            return [member.member_id for member in project_members if member.is_active and not member.member.is_bot]
        return []

    def get_next_work_item_sequence(self, obj):
        """Get the next sequence ID that will be assigned to a new issue"""
        max_sequence = IssueSequence.objects.filter(project_id=obj.id).aggregate(max_seq=Max("sequence"))["max_seq"]
        return (max_sequence + 1) if max_sequence else 1

    class Meta:
        model = Project
        fields = "__all__"


class ProjectDetailSerializer(BaseSerializer):
    # workspace = WorkSpaceSerializer(read_only=True)
    default_assignee = UserLiteSerializer(read_only=True)
    project_lead = UserLiteSerializer(read_only=True)
    is_favorite = serializers.BooleanField(read_only=True)
    sort_order = serializers.FloatField(read_only=True)
    member_role = serializers.IntegerField(read_only=True)
    anchor = serializers.CharField(read_only=True)

    class Meta:
        model = Project
        fields = "__all__"


class ProjectMemberSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    project = ProjectLiteSerializer(read_only=True)
    member = UserLiteSerializer(read_only=True)
    custom_role_ids = serializers.SerializerMethodField(read_only=True)
    permission_keys = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = "__all__"

    def get_custom_role_ids(self, obj):
        return [str(role.id) for role in obj.custom_roles.all()]

    def get_permission_keys(self, obj):
        return list(
            _get_user_project_permission_keys(
                user=obj.member,
                workspace_slug=obj.workspace.slug,
                project_id=str(obj.project_id),
            )
        )


class ProjectMemberPreferenceSerializer(BaseSerializer):
    class Meta:
        model = ProjectMember
        fields = ["preferences", "project_id", "member_id", "workspace_id"]

    def validate_preferences(self, value):
        preferences = self.instance.preferences

        preferences.update(value)
        return preferences


class ProjectMemberAdminSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    project = ProjectLiteSerializer(read_only=True)
    member = UserAdminLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMember
        fields = "__all__"


class ProjectMemberRoleSerializer(DynamicBaseSerializer):
    original_role = serializers.IntegerField(source="role", read_only=True)
    custom_role_ids = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ("id", "role", "member", "project", "original_role", "created_at", "custom_role_ids")
        read_only_fields = ["original_role", "created_at", "custom_role_ids"]

    def get_custom_role_ids(self, obj):
        return [str(r.id) for r in obj.custom_roles.all()]


class ProjectMemberInviteSerializer(BaseSerializer):
    project = ProjectLiteSerializer(read_only=True)
    workspace = WorkspaceLiteSerializer(read_only=True)

    class Meta:
        model = ProjectMemberInvite
        fields = "__all__"


class ProjectIdentifierSerializer(BaseSerializer):
    class Meta:
        model = ProjectIdentifier
        fields = "__all__"


class ProjectMemberLiteSerializer(BaseSerializer):
    member = UserLiteSerializer(read_only=True)
    is_subscribed = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = ["member", "id", "is_subscribed"]
        read_only_fields = fields


class DeployBoardSerializer(BaseSerializer):
    project_details = ProjectLiteSerializer(read_only=True, source="project")
    workspace_detail = WorkspaceLiteSerializer(read_only=True, source="workspace")

    class Meta:
        model = DeployBoard
        fields = "__all__"
        read_only_fields = ["workspace", "project", "anchor"]


class ProjectPublicMemberSerializer(BaseSerializer):
    class Meta:
        model = ProjectPublicMember
        fields = "__all__"
        read_only_fields = ["workspace", "project", "member"]


class ProjectAnnouncementListSerializer(BaseSerializer):
    class Meta:
        model = ProjectAnnouncement
        fields = "__all__"


class ProjectAnnouncementCreateSerializer(BaseSerializer):
    class Meta:
        model = ProjectAnnouncement
        fields = ['name', 'description', 'project']


METER_TYPE_VALUES = frozenset(
    {
        "01-电表",
        "02-水表",
        "03-气表",
        "04-P2P",
        "05-PLC",
        "06-DCU",
        "07-CIU",
    }
)
METER_TYPE_LEGACY_TO_CANONICAL = {
    "01": "01-电表",
    "02": "02-水表",
    "03": "03-气表",
    "04": "04-P2P",
    "05": "05-PLC",
    "06": "06-DCU",
    "07": "07-CIU",
}
REPRODUCE_LEVELS = frozenset({"表象级", "操作级", "发散级", "难重现", "其他"})


class ProjectPmsInfoSerializer(BaseSerializer):
    class Meta:
        model = ProjectPmsInfo
        fields = "__all__"
        read_only_fields = ["project"]

    def validate_meter_type(self, value: str) -> str:
        if value in METER_TYPE_VALUES:
            return value
        if value in METER_TYPE_LEGACY_TO_CANONICAL:
            return METER_TYPE_LEGACY_TO_CANONICAL[value]
        raise serializers.ValidationError("INVALID_METER_TYPE")

    def validate_reproduce(self, value: str) -> str:
        if value not in REPRODUCE_LEVELS:
            raise serializers.ValidationError("INVALID_REPRODUCE")
        return value

    def create(self, validated_data):
        project_id = self.context.get("project_id")
        if not project_id:
            raise serializers.ValidationError({"project": "project_id is required in context"})
        validated_data["project_id"] = project_id
        return super().create(validated_data)


class ProjectRoleSerializer(BaseSerializer):
    source_template_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectRole
        fields = [
            "id",
            "project",
            "name",
            "description",
            "permissions",
            "source_template",
            "source_template_name",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "project",
            "source_template",
            "source_template_name",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def get_source_template_name(self, obj):
        if obj.source_template_id:
            return obj.source_template.name
        return None

    def validate_name(self, value):
        project = self.context.get("project") or getattr(self.instance, "project", None)
        queryset = ProjectRole.objects.filter(project=project, name=value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if project and queryset.exists():
            raise serializers.ValidationError("该项目中已存在同名角色。")

        return value

    def validate_permissions(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permissions must be a JSON object.")
        return value


class ProjectRolePermissionBindingSerializer(serializers.Serializer):
    permission_keys = serializers.ListField(
        child=serializers.CharField(max_length=255),
        allow_empty=True,
        required=True,
    )

    def validate_permission_keys(self, value):
        normalized_keys = list(dict.fromkeys(value))
        queryset = Permission.objects.filter(
            key__in=normalized_keys,
            is_active=True,
            scope="project",
        )
        existing_keys = set(queryset.values_list("key", flat=True))

        return [key for key in normalized_keys if key in existing_keys]

    def save(self, **kwargs):
        role = self.context["role"]
        permissions_payload = role.permissions if isinstance(role.permissions, dict) else {}
        permissions_payload["permission_keys"] = self.validated_data["permission_keys"]
        role.permissions = permissions_payload
        role.save()
        return role


class ImportProjectRoleSerializer(serializers.Serializer):
    """从工作区项目角色模板导入；固定为独立副本（与模板解绑，不设置 source_template）。"""

    workspace_role_id = serializers.UUIDField(required=True)
