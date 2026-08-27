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
    DataDictionaryItem,
    IssueType,
    Permission,
    Project,
    ProjectMember,
    ProjectMemberInvite,
    ProjectIdentifier,
    DeployBoard,
    ProjectPublicMember,
    ProjectGroupRole,
    IssueSequence,
    User,
    WorkspaceMember,
)
from plane.utils.data_dictionary import PROJECT_DICTIONARY_FIELD_KEYS
from .data_dictionary import DataDictionaryItemLiteSerializer
from plane.db.models.issue_type import (
    ISSUE_TYPE_PERMISSION_ACTIONS,
    ISSUE_TYPE_PERMISSION_KEY_PREFIX,
    build_issue_type_permission_key,
)
from plane.utils.content_validator import validate_html_content
from ...db.models.project import (
    PROJECT_GRADE_CHOICES,
    ProjectAnnouncement,
    ProjectMemberRole,
    ProjectPmsInfo,
    ProjectRole,
    validate_estimated_hours_half_step,
)
from plane.utils.project_access import build_project_member_role_sources


def get_active_custom_role_ids(obj):
    active_member_roles = getattr(obj, "active_member_roles", None)
    if active_member_roles is not None:
        return [str(member_role.role_id) for member_role in active_member_roles]

    return [
        str(role_id)
        for role_id in ProjectMemberRole.objects.filter(
            member=obj,
            deleted_at__isnull=True,
            role__deleted_at__isnull=True,
        ).values_list("role_id", flat=True)
    ]


def get_project_member_role_sources(obj, context):
    sources_by_member_id = context.get("role_sources_by_member_id")
    if sources_by_member_id is None:
        # role_sources 与 inherited_role_ids 会各调用一次；按成员记忆，避免重复查库
        memo = context.setdefault("_role_sources_memo", {})
        if obj.id not in memo:
            memo[obj.id] = build_project_member_role_sources([obj]).get(obj.id, [])
        sources = memo[obj.id]
    else:
        sources = sources_by_member_id.get(obj.id, [])

    return [
        {
            "type": source["type"],
            "role": {
                "id": str(source["role"]["id"]),
                "name": source["role"]["name"],
            },
            "group": (
                {
                    "id": str(source["group"]["id"]),
                    "name": source["group"]["name"],
                }
                if source["group"]
                else None
            ),
        }
        for source in sources
    ]


def _dictionary_item_field(required=True):
    # 必须显式声明：模型列 null=True，ModelSerializer 会自动生成 required=False / allow_null=True。
    # 必填字段要的是「创建必填、PATCH 可省略、显式 null 拒绝」—— required=True + allow_null=False 正好。
    return serializers.PrimaryKeyRelatedField(
        queryset=DataDictionaryItem.objects.select_related("dictionary"),
        required=required,
        allow_null=not required,
    )


class ProjectExtendedDetailMixin(serializers.Serializer):
    """0348 扩展字段的只读 detail，ProjectSerializer / ProjectListSerializer 共用。

    必须继承 serializers.Serializer（同 WorkspaceMemberRoleFieldsMixin），
    否则 fields="__all__" 收不到 mixin 上声明的字段。
    """

    business_unit_detail = DataDictionaryItemLiteSerializer(source="business_unit", read_only=True)
    status_detail = DataDictionaryItemLiteSerializer(source="status", read_only=True)
    project_type_detail = DataDictionaryItemLiteSerializer(source="project_type", read_only=True)
    product_manager_detail = UserLiteSerializer(source="product_manager", read_only=True)


class ProjectSerializer(ProjectExtendedDetailMixin, BaseSerializer):
    workspace_detail = WorkspaceLiteSerializer(source="workspace", read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")
    # code 不用声明：模型列无 blank=True，DRF 自动 required + allow_blank=False；归一化与查重在 validate_code。
    # 下面这些列 DB 可空 / API 创建必填（business_unit 选填），语义同 ProductSerializer。
    business_unit = _dictionary_item_field(required=False)
    status = _dictionary_item_field()
    project_type = _dictionary_item_field()
    product_manager = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=True)
    start_date = serializers.DateField(required=True)
    end_date = serializers.DateField(required=True)

    class Meta:
        model = Project
        fields = "__all__"
        read_only_fields = ["workspace", "deleted_at"]

    def validate_code(self, value):
        # DRF 的 CharField 已先 trim 并拒绝空串，这里只做查重
        code = value.strip()
        # 与 DB 条件唯一约束同口径：未软删行全部参与，包括 is_template=True 的模板项目
        queryset = Project.all_objects.filter(
            workspace_id=self.context["workspace_id"], code=code, deleted_at__isnull=True
        )
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("PROJECT_CODE_ALREADY_EXIST")
        return code

    def validate_product_manager(self, user):
        # 值没变就不再查成员资格：负责人事后被移出工作区的项目，不该因此改不了别的字段
        if self.instance is not None and self.instance.product_manager_id == user.id:
            return user
        # 只要求工作区活跃成员，不要求（也不自动加入）项目成员，与 Product.project_lead 同口径
        if not WorkspaceMember.objects.filter(
            workspace_id=self.context["workspace_id"],
            member=user,
            is_active=True,
            deleted_at__isnull=True,
        ).exists():
            raise serializers.ValidationError("PROJECT_PRODUCT_MANAGER_NOT_WORKSPACE_MEMBER")
        return user

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

        project = Project.objects.filter(
            identifier=identifier, workspace_id=workspace_id
        )

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
            is_valid, error_msg, sanitized_html = validate_html_content(
                str(data["description_html"])
            )
            # Update the data with sanitized HTML if available
            if sanitized_html is not None:
                data["description_html"] = sanitized_html

            if not is_valid:
                raise serializers.ValidationError(
                    {"error": "html content is not valid"}
                )

        if self.instance is None:
            allowed_grades = {c[0] for c in PROJECT_GRADE_CHOICES}
            grade = data.get("grade")
            if grade is None or grade == "":
                raise serializers.ValidationError({"grade": "PROJECT_GRADE_REQUIRED"})
            if grade not in allowed_grades:
                raise serializers.ValidationError({"grade": "INVALID_PROJECT_GRADE"})

        # 字典值必须属于本工作区、且来自对应的系统字典（状态字段不能塞一个「项目类型」的值）
        workspace_id = str(self.context["workspace_id"])
        errors = {}
        for field, key in PROJECT_DICTIONARY_FIELD_KEYS.items():
            item = data.get(field)
            if item is None:
                continue
            if str(item.workspace_id) != workspace_id or item.dictionary.key != key:
                errors[field] = ["PROJECT_DICTIONARY_ITEM_INVALID"]
        if errors:
            raise serializers.ValidationError(errors)

        # 完成日期不能早于开始日期；PATCH 只带其中一个时与实例上的另一个比
        start_date = data.get("start_date", getattr(self.instance, "start_date", None))
        end_date = data.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError({"end_date": ["PROJECT_END_DATE_BEFORE_START_DATE"]})

        return data

    def create(self, validated_data):
        workspace_id = self.context["workspace_id"]

        project = Project.objects.create(**validated_data, workspace_id=workspace_id)

        ProjectIdentifier.objects.create(
            name=project.identifier, project=project, workspace_id=workspace_id
        )

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
            "product_type",
        ]
        read_only_fields = fields


class ProjectListSerializer(ProjectExtendedDetailMixin, DynamicBaseSerializer):
    is_favorite = serializers.BooleanField(read_only=True)
    sort_order = serializers.FloatField(read_only=True)
    member_role = serializers.IntegerField(read_only=True)
    anchor = serializers.CharField(read_only=True)
    members = serializers.SerializerMethodField()
    cover_image_url = serializers.CharField(read_only=True)
    inbox_view = serializers.BooleanField(read_only=True, source="intake_view")
    next_work_item_sequence = serializers.IntegerField(read_only=True)

    def get_members(self, obj):
        project_members = getattr(obj, "members_list", None)
        if project_members is not None:
            # Filter members by the project ID
            return [
                member.member_id
                for member in project_members
                if member.is_active and not member.member.is_bot
            ]
        return []


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
    inherited_role_ids = serializers.SerializerMethodField(read_only=True)
    role_sources = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = "__all__"

    def get_custom_role_ids(self, obj):
        return get_active_custom_role_ids(obj)

    def get_permission_keys(self, obj):
        precomputed = self.context.get("permission_keys")
        if precomputed is not None:
            return list(precomputed)

        project = getattr(obj, "project", None)
        role_sources = get_project_member_role_sources(obj, self.context)
        role_ids = {source["role"]["id"] for source in role_sources}
        return list(
            _get_user_project_permission_keys(
                user=obj.member,
                workspace_slug=obj.workspace.slug,
                project_id=str(obj.project_id),
                project=project,
                role_ids=role_ids,
            )
        )

    def get_role_sources(self, obj):
        return get_project_member_role_sources(obj, self.context)

    def get_inherited_role_ids(self, obj):
        return list(
            dict.fromkeys(
                source["role"]["id"]
                for source in self.get_role_sources(obj)
                if source["type"] == "group_role"
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
    inherited_role_ids = serializers.SerializerMethodField(read_only=True)
    role_sources = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ProjectMember
        fields = (
            "id",
            "role",
            "member",
            "project",
            "original_role",
            "created_at",
            "custom_role_ids",
            "inherited_role_ids",
            "role_sources",
        )
        read_only_fields = ["original_role", "created_at", "custom_role_ids"]

    def get_custom_role_ids(self, obj):
        return get_active_custom_role_ids(obj)

    def get_role_sources(self, obj):
        return get_project_member_role_sources(obj, self.context)

    def get_inherited_role_ids(self, obj):
        return list(
            dict.fromkeys(
                source["role"]["id"]
                for source in self.get_role_sources(obj)
                if source["type"] == "group_role"
            )
        )


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
        fields = ["name", "description", "project"]


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
            raise serializers.ValidationError(
                {"project": "project_id is required in context"}
            )
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


class ProjectGroupRoleSerializer(BaseSerializer):
    role_detail = ProjectRoleSerializer(source="role", read_only=True)

    class Meta:
        model = ProjectGroupRole
        fields = [
            "id",
            "project",
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
            "project",
            "group",
            "role_detail",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "deleted_at",
        ]

    def validate_role(self, value):
        project = self.context.get("project")
        group = self.context.get("group")
        if project and value.project_id != project.id:
            raise serializers.ValidationError("The role does not belong to this project.")
        if value.deleted_at is not None:
            raise serializers.ValidationError("The role is no longer active.")
        if group and project and group.workspace_id != project.workspace_id:
            raise serializers.ValidationError("The group does not belong to this project's workspace.")

        duplicate = ProjectGroupRole.objects.filter(
            group=group,
            role=value,
            deleted_at__isnull=True,
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError("This role is already assigned to the group.")
        return value


class ProjectGroupSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True, allow_blank=True, allow_null=True)
    member_count = serializers.IntegerField(read_only=True)
    project_member_count = serializers.IntegerField(read_only=True)
    grants = ProjectGroupRoleSerializer(many=True, read_only=True)


class ProjectGroupMemberOptionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    workspace_member_id = serializers.UUIDField(read_only=True)
    member = UserLiteSerializer(read_only=True)
    is_project_member = serializers.BooleanField(read_only=True)


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

        # issue_type 权限是按项目维度物化的，需要再校验所传 key 确实属于本项目，
        # 防止把别的项目的 issue_type 权限写到当前角色上。
        role = self.context.get("role")
        project = (
            getattr(role, "project", None) if role else self.context.get("project")
        )
        if project is not None:
            allowed_issue_type_keys = self._get_project_issue_type_keys(project)
            existing_keys = {
                k
                for k in existing_keys
                if not k.startswith(ISSUE_TYPE_PERMISSION_KEY_PREFIX)
                or k in allowed_issue_type_keys
            }

        return [key for key in normalized_keys if key in existing_keys]

    def _get_project_issue_type_keys(self, project) -> set:
        issue_type_ids = IssueType.objects.filter(
            project=project, deleted_at__isnull=True
        ).values_list("id", flat=True)
        return {
            build_issue_type_permission_key(issue_type_id, action)
            for issue_type_id in issue_type_ids
            for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS
        }

    def save(self, **kwargs):
        role = self.context["role"]
        permissions_payload = (
            role.permissions if isinstance(role.permissions, dict) else {}
        )
        permissions_payload["permission_keys"] = self.validated_data["permission_keys"]
        role.permissions = permissions_payload
        role.save()
        return role


class ImportProjectRoleSerializer(serializers.Serializer):
    """从工作区项目角色模板导入；固定为独立副本（与模板解绑，不设置 source_template）。"""

    workspace_role_id = serializers.UUIDField(required=True)
