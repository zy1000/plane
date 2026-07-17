# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer, DynamicBaseSerializer
from .user import UserLiteSerializer, UserAdminLiteSerializer


from plane.db.models import (
    Permission,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberInvite,
    WorkspaceTheme,
    WorkspaceRole,
    WorkspaceMemberRole,
    WorkspaceGroup,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceUserProperties,
    WorkspaceUserLink,
    UserRecentVisit,
    Issue,
    IssueType,
    Page,
    Project,
    ProjectMember,
    WorkspaceHomePreference,
    Sticky,
    WorkspaceUserPreference,
)
from plane.db.models.issue_type import (
    ISSUE_TYPE_PERMISSION_KEY_PREFIX,
    ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY,
    build_issue_type_template_permission_descriptors,
)
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS
from plane.utils.url import contains_url
from plane.utils.content_validator import (
    validate_html_content,
    validate_binary_data,
)

# Django imports
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
import re


class WorkSpaceSerializer(DynamicBaseSerializer):
    total_members = serializers.IntegerField(read_only=True)
    logo_url = serializers.CharField(read_only=True)
    role = serializers.IntegerField(read_only=True)

    def validate_name(self, value):
        # Check if the name contains a URL
        if contains_url(value):
            raise serializers.ValidationError("Name must not contain URLs")
        return value

    def validate_slug(self, value):
        # Check if the slug is restricted
        if value in RESTRICTED_WORKSPACE_SLUGS:
            raise serializers.ValidationError("Slug is not valid")
        # Slug should only contain alphanumeric characters, hyphens, and underscores
        if not re.match(r"^[a-zA-Z0-9_-]+$", value):
            raise serializers.ValidationError(
                "Slug can only contain letters, numbers, hyphens (-), and underscores (_)"
            )
        return value

    class Meta:
        model = Workspace
        fields = "__all__"
        read_only_fields = [
            "id",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "owner",
            "logo_url",
        ]


class WorkspaceLiteSerializer(BaseSerializer):
    class Meta:
        model = Workspace
        fields = ["name", "slug", "id", "logo_url"]
        read_only_fields = fields


def get_workspace_member_custom_role_ids(obj):
    active_member_roles = getattr(obj, "active_member_roles", None)
    if active_member_roles is None:
        active_member_roles = WorkspaceMemberRole.objects.filter(
            member=obj,
            deleted_at__isnull=True,
            role__deleted_at__isnull=True,
            role__legacy_role__isnull=True,
            role__type=WorkspaceRole.RoleType.WORKSPACE,
        ).select_related("role")
    return [str(member_role.role_id) for member_role in active_member_roles]


def get_workspace_member_group_role_ids(obj):
    return list(
        WorkspaceGroupRole.objects.filter(
            group__group_members__member=obj,
            group__workspace=obj.workspace,
            group__group_members__deleted_at__isnull=True,
            deleted_at__isnull=True,
            role__workspace=obj.workspace,
            role__deleted_at__isnull=True,
            role__type=WorkspaceRole.RoleType.WORKSPACE,
        )
        .values_list("role_id", flat=True)
        .distinct()
    )


def get_workspace_member_group_ids(obj):
    return list(
        WorkspaceGroupMember.objects.filter(
            member=obj,
            group__workspace=obj.workspace,
            group__deleted_at__isnull=True,
            deleted_at__isnull=True,
        )
        .values_list("group_id", flat=True)
        .distinct()
    )


class WorkspaceMemberRoleFieldsMixin(serializers.Serializer):
    custom_role_ids = serializers.SerializerMethodField(read_only=True)
    group_role_ids = serializers.SerializerMethodField(read_only=True)
    group_ids = serializers.SerializerMethodField(read_only=True)

    def get_custom_role_ids(self, obj):
        return get_workspace_member_custom_role_ids(obj)

    def get_group_role_ids(self, obj):
        group_role_ids_by_member = self.context.get("group_role_ids_by_member")
        if group_role_ids_by_member is not None:
            return group_role_ids_by_member.get(obj.id, [])
        return [str(role_id) for role_id in get_workspace_member_group_role_ids(obj)]

    def get_group_ids(self, obj):
        group_ids_by_member = self.context.get("group_ids_by_member")
        if group_ids_by_member is not None:
            return group_ids_by_member.get(obj.id, [])
        return [str(group_id) for group_id in get_workspace_member_group_ids(obj)]


class WorkSpaceMemberSerializer(WorkspaceMemberRoleFieldsMixin, DynamicBaseSerializer):
    member = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"


class WorkspaceMemberMeSerializer(WorkspaceMemberRoleFieldsMixin, BaseSerializer):
    draft_issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"


class WorkspaceMemberAdminSerializer(WorkspaceMemberRoleFieldsMixin, DynamicBaseSerializer):
    member = UserAdminLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"


class WorkSpaceMemberInviteSerializer(BaseSerializer):
    workspace = WorkspaceLiteSerializer(read_only=True)
    invite_link = serializers.SerializerMethodField()

    def get_invite_link(self, obj):
        return f"/workspace-invitations/?invitation_id={obj.id}&slug={obj.workspace.slug}&token={obj.token}"

    class Meta:
        model = WorkspaceMemberInvite
        fields = "__all__"
        read_only_fields = [
            "id",
            "email",
            "token",
            "workspace",
            "message",
            "responded_at",
            "created_at",
            "updated_at",
            "invite_link",
        ]


class WorkspaceThemeSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceTheme
        fields = "__all__"
        read_only_fields = ["workspace", "actor"]


class WorkspaceRoleSerializer(BaseSerializer):
    is_system = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = WorkspaceRole
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "permissions",
            "type",
            "legacy_role",
            "is_system",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
            "legacy_role",
            "is_system",
        ]

    def get_is_system(self, obj):
        return obj.legacy_role is not None

    def validate(self, attrs):
        if self.instance and self.instance.legacy_role is not None:
            raise serializers.ValidationError("System roles cannot be modified.")
        return super().validate(attrs)

    def validate_name(self, value):
        workspace = self.context.get("workspace") or getattr(
            self.instance, "workspace", None
        )
        queryset = WorkspaceRole.objects.filter(workspace=workspace, name=value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if workspace and queryset.exists():
            raise serializers.ValidationError(
                "Role with this name already exists in the workspace."
            )

        return value

    def validate_permissions(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Permissions must be a JSON object.")

        return value


class PermissionSerializer(BaseSerializer):
    is_bound = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Permission
        fields = [
            "id",
            "key",
            "name",
            "description",
            "scope",
            "module",
            "action",
            "category",
            "sort_order",
            "is_active",
            "is_bound",
        ]
        read_only_fields = fields

    def get_is_bound(self, obj):
        bound_permission_keys = set(self.context.get("bound_permission_keys", []))
        return obj.key in bound_permission_keys


class WorkspaceMyAccessRoleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True, allow_null=True)


class WorkspaceMyAccessEntityReferenceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class WorkspaceMyAccessMembershipSerializer(serializers.Serializer):
    id = serializers.UUIDField(allow_null=True)
    role = serializers.IntegerField(allow_null=True)
    joined_at = serializers.DateTimeField(allow_null=True)
    is_workspace_owner = serializers.BooleanField()
    is_instance_admin = serializers.BooleanField()


class WorkspaceMyAccessGroupSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True, allow_null=True)
    joined_at = serializers.DateTimeField(allow_null=True)
    roles = WorkspaceMyAccessRoleSerializer(many=True)


class WorkspaceMyAccessPermissionSourceSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=(
            "direct_role",
            "group_role",
            "workspace_owner",
            "instance_admin",
        )
    )
    role = WorkspaceMyAccessEntityReferenceSerializer(allow_null=True)
    group = WorkspaceMyAccessEntityReferenceSerializer(allow_null=True)


class WorkspaceMyAccessPermissionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    key = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField(allow_blank=True, allow_null=True)
    scope = serializers.ChoiceField(choices=("workspace",))
    module = serializers.CharField(allow_blank=True, allow_null=True)
    action = serializers.CharField(allow_blank=True, allow_null=True)
    category = serializers.CharField(allow_blank=True, allow_null=True)
    sort_order = serializers.IntegerField()
    is_granted = serializers.BooleanField()
    sources = WorkspaceMyAccessPermissionSourceSerializer(many=True)


class WorkspaceMyAccessSerializer(serializers.Serializer):
    membership = WorkspaceMyAccessMembershipSerializer()
    direct_roles = WorkspaceMyAccessRoleSerializer(many=True)
    groups = WorkspaceMyAccessGroupSerializer(many=True)
    permissions = WorkspaceMyAccessPermissionSerializer(many=True)


class WorkspaceRolePermissionBindingSerializer(serializers.Serializer):
    permission_keys = serializers.ListField(
        child=serializers.CharField(max_length=255),
        allow_empty=True,
        required=True,
    )

    def validate_permission_keys(self, value):
        normalized_keys = list(dict.fromkeys(value))
        role = self.context.get("role")
        if role and role.legacy_role is not None:
            raise serializers.ValidationError("System role permissions cannot be modified.")

        # 按 type 决定允许绑定的 scope
        allowed_scope = None
        if role:
            if role.type == WorkspaceRole.RoleType.WORKSPACE:
                allowed_scope = "workspace"
            elif role.type == WorkspaceRole.RoleType.PROJECT_TEMPLATE:
                allowed_scope = "project"

        query = Permission.objects.filter(key__in=normalized_keys, is_active=True)
        if allowed_scope:
            query = query.filter(scope=allowed_scope)
        if role and role.type == WorkspaceRole.RoleType.PROJECT_TEMPLATE:
            query = query.exclude(key__startswith=ISSUE_TYPE_PERMISSION_KEY_PREFIX)

        existing_keys = set(query.values_list("key", flat=True))
        issue_type_template_permissions = {}
        if role and role.type == WorkspaceRole.RoleType.PROJECT_TEMPLATE:
            available_template_permissions = (
                self._get_workspace_issue_type_template_permissions(role.workspace)
            )
            selected_template_keys = {
                key for key in normalized_keys if key in available_template_permissions
            }
            existing_keys.update(selected_template_keys)
            issue_type_template_permissions = {
                key: available_template_permissions[key] for key in selected_template_keys
            }
        self._issue_type_template_permissions = issue_type_template_permissions

        invalid_keys = [key for key in normalized_keys if key not in existing_keys]

        if invalid_keys:
            scope_label = {"workspace": "工作区", "project": "项目"}.get(
                allowed_scope, ""
            )
            raise serializers.ValidationError(
                f"无效的{scope_label}权限 key：{', '.join(invalid_keys)}"
            )

        return normalized_keys

    def _get_workspace_issue_type_template_permissions(self, workspace):
        issue_type_names = (
            IssueType.objects.filter(
                project__workspace=workspace,
                deleted_at__isnull=True,
                is_active=True,
            )
            .order_by("name")
            .values_list("name", flat=True)
            .distinct()
        )
        return build_issue_type_template_permission_descriptors(issue_type_names)

    def save(self, **kwargs):
        role = self.context["role"]
        permissions_payload = (
            role.permissions if isinstance(role.permissions, dict) else {}
        )
        permissions_payload["permission_keys"] = self.validated_data["permission_keys"]
        if role.type == WorkspaceRole.RoleType.PROJECT_TEMPLATE:
            permissions_payload[ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY] = getattr(
                self, "_issue_type_template_permissions", {}
            )
        else:
            permissions_payload.pop(ISSUE_TYPE_TEMPLATE_PERMISSION_DESCRIPTOR_KEY, None)
        role.permissions = permissions_payload
        role.save()
        return role


class WorkspaceMemberCustomRolesSerializer(serializers.Serializer):
    custom_role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
        required=True,
    )

    def validate_custom_role_ids(self, value):
        normalized_ids = list(dict.fromkeys(value))
        workspace = self.context["workspace"]
        roles = list(
            WorkspaceRole.objects.filter(
                id__in=normalized_ids,
                workspace=workspace,
                type=WorkspaceRole.RoleType.WORKSPACE,
                legacy_role__isnull=True,
                deleted_at__isnull=True,
            )
        )
        valid_ids = {role.id for role in roles}
        invalid_ids = [role_id for role_id in normalized_ids if role_id not in valid_ids]
        if invalid_ids:
            raise serializers.ValidationError(
                f"无效的工作区角色 ID：{', '.join(str(role_id) for role_id in invalid_ids)}"
            )
        self._roles = roles
        return normalized_ids

    def save(self, **kwargs):
        member = self.context["member"]
        actor = self.context.get("actor")
        valid_role_ids = {role.id for role in self._roles}

        WorkspaceMemberRole.objects.filter(
            member=member,
            role__legacy_role__isnull=True,
            deleted_at__isnull=True,
        ).exclude(role_id__in=valid_role_ids).delete(soft=False)

        existing_role_ids = set(
            WorkspaceMemberRole.objects.filter(
                member=member,
                role_id__in=valid_role_ids,
                deleted_at__isnull=True,
            ).values_list("role_id", flat=True)
        )
        WorkspaceMemberRole.objects.bulk_create(
            [
                WorkspaceMemberRole(
                    workspace=member.workspace,
                    member=member,
                    role=role,
                    created_by=actor,
                    updated_by=actor,
                )
                for role in self._roles
                if role.id not in existing_role_ids
            ],
            ignore_conflicts=True,
        )
        return {
            "custom_role_ids": [
                str(role_id)
                for role_id in WorkspaceMemberRole.objects.filter(
                    member=member,
                    role__legacy_role__isnull=True,
                    role__deleted_at__isnull=True,
                    deleted_at__isnull=True,
                ).values_list("role_id", flat=True)
            ]
        }


class WorkspaceMemberGroupsSerializer(serializers.Serializer):
    group_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
        required=True,
    )

    def validate_group_ids(self, value):
        normalized_ids = list(dict.fromkeys(value))
        workspace = self.context["workspace"]
        groups = list(
            WorkspaceGroup.objects.filter(
                id__in=normalized_ids,
                workspace=workspace,
                deleted_at__isnull=True,
            )
        )
        valid_ids = {group.id for group in groups}
        invalid_ids = [group_id for group_id in normalized_ids if group_id not in valid_ids]
        if invalid_ids:
            raise serializers.ValidationError(
                f"无效的工作区团队 ID：{', '.join(str(group_id) for group_id in invalid_ids)}"
            )
        self._groups = groups
        return normalized_ids

    def save(self, **kwargs):
        member = self.context["member"]
        actor = self.context.get("actor")
        valid_group_ids = {group.id for group in self._groups}

        WorkspaceGroupMember.objects.filter(
            member=member,
            deleted_at__isnull=True,
        ).exclude(group_id__in=valid_group_ids).delete()

        existing_group_ids = set(
            WorkspaceGroupMember.objects.filter(
                member=member,
                group_id__in=valid_group_ids,
                deleted_at__isnull=True,
            ).values_list("group_id", flat=True)
        )
        WorkspaceGroupMember.objects.bulk_create(
            [
                WorkspaceGroupMember(
                    group=group,
                    member=member,
                    created_by=actor,
                    updated_by=actor,
                )
                for group in self._groups
                if group.id not in existing_group_ids
            ],
            ignore_conflicts=True,
        )

        group_ids = [
            str(group_id) for group_id in get_workspace_member_group_ids(member)
        ]
        group_role_ids = [
            str(role_id) for role_id in get_workspace_member_group_role_ids(member)
        ]
        return {
            "group_ids": group_ids,
            "group_role_ids": group_role_ids,
        }


class WorkspaceGroupSerializer(BaseSerializer):
    member_count = serializers.IntegerField(read_only=True)
    role_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkspaceGroup
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "member_count",
            "role_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "member_count",
            "role_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def validate_name(self, value):
        workspace = self.context.get("workspace") or getattr(
            self.instance, "workspace", None
        )
        queryset = WorkspaceGroup.objects.filter(workspace=workspace, name=value)

        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)

        if workspace and queryset.exists():
            raise serializers.ValidationError(
                "Group with this name already exists in the workspace."
            )

        return value


class WorkspaceGroupMemberSerializer(BaseSerializer):
    member_detail = WorkspaceMemberAdminSerializer(source="member", read_only=True)

    class Meta:
        model = WorkspaceGroupMember
        fields = [
            "id",
            "group",
            "member",
            "member_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "group",
            "member_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def validate_member(self, value):
        group = self.context.get("group")

        if not value.is_active:
            raise serializers.ValidationError(
                "Inactive workspace members cannot be added to a group."
            )

        if group and value.workspace_id != group.workspace_id:
            raise serializers.ValidationError(
                "The member does not belong to this workspace."
            )

        return value


class WorkspaceGroupRoleSerializer(BaseSerializer):
    role_detail = WorkspaceRoleSerializer(source="role", read_only=True)

    class Meta:
        model = WorkspaceGroupRole
        fields = [
            "id",
            "group",
            "role",
            "role_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "group",
            "role_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def validate_role(self, value):
        group = self.context.get("group")

        if group and value.workspace_id != group.workspace_id:
            raise serializers.ValidationError(
                "The role does not belong to this workspace."
            )
        if value.type != WorkspaceRole.RoleType.WORKSPACE:
            raise serializers.ValidationError(
                "Only workspace roles can be assigned to workspace groups."
            )
        if value.deleted_at is not None:
            raise serializers.ValidationError("The role is no longer active.")

        return value


class WorkspaceUserPropertiesSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserProperties
        fields = "__all__"
        read_only_fields = ["workspace", "user"]


class WorkspaceUserLinkSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserLink
        fields = "__all__"
        read_only_fields = ["workspace", "owner"]

    def to_internal_value(self, data):
        url = data.get("url", "")
        if url and not url.startswith(("http://", "https://")):
            data["url"] = "http://" + url

        return super().to_internal_value(data)

    def validate_url(self, value):
        url_validator = URLValidator()
        try:
            url_validator(value)
        except ValidationError:
            raise serializers.ValidationError({"error": "Invalid URL format."})

        return value

    def create(self, validated_data):
        # Filtering the WorkspaceUserLink with the given url to check if the link already exists.

        url = validated_data.get("url")

        workspace_user_link = WorkspaceUserLink.objects.filter(
            url=url,
            workspace_id=validated_data.get("workspace_id"),
            owner_id=validated_data.get("owner_id"),
        )

        if workspace_user_link.exists():
            raise serializers.ValidationError(
                {"error": "URL already exists for this workspace and owner"}
            )

        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Filtering the WorkspaceUserLink with the given url to check if the link already exists.

        url = validated_data.get("url")

        workspace_user_link = WorkspaceUserLink.objects.filter(
            url=url, workspace_id=instance.workspace_id, owner=instance.owner
        )

        if workspace_user_link.exclude(pk=instance.id).exists():
            raise serializers.ValidationError(
                {"error": "URL already exists for this workspace and owner"}
            )

        return super().update(instance, validated_data)


class IssueRecentVisitSerializer(serializers.ModelSerializer):
    project_identifier = serializers.SerializerMethodField()
    assignees = serializers.SerializerMethodField()
    type_name = serializers.CharField(
        read_only=True, source="type.name", allow_null=True
    )
    is_epic = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = [
            "id",
            "name",
            "state",
            "priority",
            "assignees",
            "type",
            "type_name",
            "is_epic",
            "sequence_id",
            "project_id",
            "project_identifier",
        ]

    def get_project_identifier(self, obj):
        project = obj.project
        return project.identifier if project else None

    def get_assignees(self, obj):
        return list(
            obj.assignees.filter(issue_assignee__deleted_at__isnull=True).values_list(
                "id", flat=True
            )
        )

    def get_is_epic(self, obj):
        return bool(obj.type and obj.type.is_epic)


class ProjectRecentVisitSerializer(serializers.ModelSerializer):
    project_members = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "name", "logo_props", "project_members", "identifier"]

    def get_project_members(self, obj):
        members = ProjectMember.objects.filter(
            project_id=obj.id, member__is_bot=False, is_active=True
        ).values_list("member", flat=True)

        return members


class PageRecentVisitSerializer(serializers.ModelSerializer):
    project_id = serializers.SerializerMethodField()
    project_identifier = serializers.SerializerMethodField()

    class Meta:
        model = Page
        fields = [
            "id",
            "name",
            "logo_props",
            "project_id",
            "owned_by",
            "project_identifier",
        ]

    def get_project_id(self, obj):
        return (
            obj.project_id
            if hasattr(obj, "project_id")
            else obj.projects.values_list("id", flat=True).first()
        )

    def get_project_identifier(self, obj):
        project = obj.projects.first()

        return project.identifier if project else None


def get_entity_model_and_serializer(entity_type):
    entity_map = {
        "issue": (Issue, IssueRecentVisitSerializer),
        "page": (Page, PageRecentVisitSerializer),
        "project": (Project, ProjectRecentVisitSerializer),
    }
    return entity_map.get(entity_type, (None, None))


class WorkspaceRecentVisitSerializer(BaseSerializer):
    entity_data = serializers.SerializerMethodField()

    class Meta:
        model = UserRecentVisit
        fields = ["id", "entity_name", "entity_identifier", "entity_data", "visited_at"]
        read_only_fields = ["workspace", "owner", "created_by", "updated_by"]

    def get_entity_data(self, obj):
        entity_name = obj.entity_name
        entity_identifier = obj.entity_identifier

        entity_model, entity_serializer = get_entity_model_and_serializer(entity_name)

        if entity_model and entity_serializer:
            try:
                if entity_model is Issue:
                    entity = entity_model.objects.select_related("type", "project").get(
                        pk=entity_identifier
                    )
                else:
                    entity = entity_model.objects.get(pk=entity_identifier)

                return entity_serializer(entity).data
            except entity_model.DoesNotExist:
                return None
        return None


class WorkspaceHomePreferenceSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceHomePreference
        fields = ["key", "is_enabled", "sort_order"]
        read_only_fields = ["workspace", "created_by", "updated_by"]


class StickySerializer(BaseSerializer):
    class Meta:
        model = Sticky
        fields = "__all__"
        read_only_fields = ["workspace", "owner"]
        extra_kwargs = {"name": {"required": False}}

    def validate(self, data):
        # Validate description content for security
        if "description_html" in data and data["description_html"]:
            is_valid, error_msg, sanitized_html = validate_html_content(
                data["description_html"]
            )
            if not is_valid:
                raise serializers.ValidationError(
                    {"error": "html content is not valid"}
                )
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

        if "description_binary" in data and data["description_binary"]:
            is_valid, error_msg = validate_binary_data(data["description_binary"])
            if not is_valid:
                raise serializers.ValidationError(
                    {"description_binary": "Invalid binary data"}
                )

        return data


class WorkspaceUserPreferenceSerializer(BaseSerializer):
    class Meta:
        model = WorkspaceUserPreference
        fields = ["key", "is_pinned", "sort_order"]
        read_only_fields = ["workspace", "created_by", "updated_by"]
