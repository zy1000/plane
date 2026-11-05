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
    Page,
    Project,
    ProjectMember,
    WorkspaceHomePreference,
    Sticky,
    WorkspaceUserPreference,
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
    job_role_ids = serializers.SerializerMethodField(read_only=True)

    def get_custom_role_ids(self, obj):
        return get_workspace_member_custom_role_ids(obj)

    def get_job_role_ids(self, obj):
        job_role_ids_by_member = self.context.get("job_role_ids_by_member")
        if job_role_ids_by_member is not None:
            return [str(value) for value in job_role_ids_by_member.get(obj.id, [])]
        return [str(value) for value in obj.job_role_links.values_list("job_role_id", flat=True)]

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


class WorkspaceMemberExtraInfoFieldsMixin(serializers.Serializer):
    """成员列表的人员扩展信息（工号 / 部门 / 上级）。列表视图把 extra_info_by_user 放进 context，一次查完；
    没有 context 时按行取（只有 retrieve 会走到）。"""

    employee_id = serializers.SerializerMethodField(read_only=True)
    department = serializers.SerializerMethodField(read_only=True)
    leader = serializers.SerializerMethodField(read_only=True)

    def _extra_info(self, obj):
        extra_info_by_user = self.context.get("extra_info_by_user")
        if extra_info_by_user is not None:
            return extra_info_by_user.get(obj.member_id)
        return getattr(obj.member, "extra_info", None)

    def get_employee_id(self, obj):
        extra = self._extra_info(obj)
        return extra.employee_id if extra else None

    def get_department(self, obj):
        extra = self._extra_info(obj)
        if not extra:
            return None
        return extra.organization.path if extra.organization_id else extra.department

    def get_leader(self, obj):
        extra = self._extra_info(obj)
        if not extra or not extra.leader_id:
            return None
        return {"id": str(extra.leader_id), "display_name": extra.leader.display_name}


# 成员名单（通讯录）对外的字段。不要用 "__all__"：会把每个人的 view_props / default_props 等个人偏好一起吐出去
# （843 人时占响应 58%），还会因模型上的 job_roles 多对多字段对每个成员多查一次字典表（N+1）。
# 岗位 / 权限组 / 团队都走 Mixin 的 *_ids 方法字段，列表视图预先算好放在 context 里。
WORKSPACE_MEMBER_FIELDS = (
    "id",
    "member",
    "created_at",
    "is_active",
    "custom_role_ids",
    "group_role_ids",
    "group_ids",
    "job_role_ids",
    "employee_id",
    "department",
    "leader",
)


class WorkSpaceMemberSerializer(WorkspaceMemberRoleFieldsMixin, WorkspaceMemberExtraInfoFieldsMixin, DynamicBaseSerializer):
    member = UserLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = WORKSPACE_MEMBER_FIELDS
        read_only_fields = ("id", "member", "created_at")


class WorkspaceMemberMeSerializer(WorkspaceMemberRoleFieldsMixin, BaseSerializer):
    draft_issue_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = "__all__"


class WorkspaceMemberAdminSerializer(
    WorkspaceMemberRoleFieldsMixin, WorkspaceMemberExtraInfoFieldsMixin, DynamicBaseSerializer
):
    member = UserAdminLiteSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = WORKSPACE_MEMBER_FIELDS
        read_only_fields = ("id", "member", "created_at")


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
    """权限组。权限内容走 roles/<id>/permissions/，数据权限走 roles/<id>/data-scope/。"""

    class Meta:
        model = WorkspaceRole
        fields = [
            "id",
            "workspace",
            "name",
            "description",
            "is_template",
            "data_scope",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "data_scope",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def validate_type(self, value):
        if self.instance is not None and value != self.instance.type:
            raise serializers.ValidationError("权限组类型创建后不能修改。")
        return value

    def validate_name(self, value):
        workspace = self.context.get("workspace") or getattr(self.instance, "workspace", None)
        queryset = WorkspaceRole.objects.filter(workspace=workspace, name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if workspace and queryset.exists():
            raise serializers.ValidationError("同名权限组已存在。")
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


class WorkspaceMyAccessJobRoleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    label = serializers.CharField()
    color = serializers.CharField(allow_blank=True)


class WorkspaceMyAccessSerializer(serializers.Serializer):
    membership = WorkspaceMyAccessMembershipSerializer()
    job_roles = WorkspaceMyAccessJobRoleSerializer(many=True)
    direct_roles = WorkspaceMyAccessRoleSerializer(many=True)
    groups = WorkspaceMyAccessGroupSerializer(many=True)
    permissions = WorkspaceMyAccessPermissionSerializer(many=True)


class WorkspaceRolePermissionBindingSerializer(serializers.Serializer):
    """权限组编辑器提交的内容。合法性（scope、类型是否存在）在 utils/permission_groups.py。"""

    permission_keys = serializers.ListField(child=serializers.CharField(max_length=255), allow_empty=True)
    type_limits = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField(max_length=64), allow_empty=True),
        required=False,
        default=dict,
    )


class WorkspaceMemberCustomRolesSerializer(serializers.Serializer):
    """整份替换一个工作区成员的权限组和 / 或角色；没传的那一项不动。"""

    custom_role_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=False)
    job_role_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=False)

    def validate_custom_role_ids(self, value):
        normalized_ids = list(dict.fromkeys(value))
        workspace = self.context["workspace"]
        roles = list(
            WorkspaceRole.objects.filter(
                id__in=normalized_ids,
                workspace=workspace,
                deleted_at__isnull=True,
            )
        )
        valid_ids = {role.id for role in roles}
        invalid_ids = [role_id for role_id in normalized_ids if role_id not in valid_ids]
        if invalid_ids:
            raise serializers.ValidationError(
                f"无效的工作区权限组 ID：{', '.join(str(role_id) for role_id in invalid_ids)}"
            )
        self._roles = roles
        return normalized_ids

    def validate_job_role_ids(self, value):
        from plane.utils.job_role import validate_job_role_ids

        valid, invalid = validate_job_role_ids(self.context["workspace"].id, value)
        if invalid:
            raise serializers.ValidationError(f"无效的角色 ID：{', '.join(invalid)}")
        return valid

    def _save_roles(self, member, actor):
        valid_role_ids = {role.id for role in self._roles}
        WorkspaceMemberRole.objects.filter(member=member, deleted_at__isnull=True).exclude(
            role_id__in=valid_role_ids
        ).delete(soft=False)
        existing_role_ids = set(
            WorkspaceMemberRole.objects.filter(
                member=member, role_id__in=valid_role_ids, deleted_at__isnull=True
            ).values_list("role_id", flat=True)
        )
        WorkspaceMemberRole.objects.bulk_create(
            [
                WorkspaceMemberRole(
                    workspace=member.workspace, member=member, role=role, created_by=actor, updated_by=actor
                )
                for role in self._roles
                if role.id not in existing_role_ids
            ],
            ignore_conflicts=True,
        )

    def save(self, **kwargs):
        from plane.utils.job_role import set_member_job_roles

        member = self.context["member"]
        actor = self.context.get("actor")
        if "custom_role_ids" in self.validated_data:
            self._save_roles(member, actor)
        if "job_role_ids" in self.validated_data:
            set_member_job_roles(member, self.validated_data["job_role_ids"])
        return {
            "custom_role_ids": [
                str(role_id)
                for role_id in WorkspaceMemberRole.objects.filter(
                    member=member, role__deleted_at__isnull=True, deleted_at__isnull=True
                ).values_list("role_id", flat=True)
            ],
            "job_role_ids": [str(value) for value in member.job_role_links.values_list("job_role_id", flat=True)],
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
