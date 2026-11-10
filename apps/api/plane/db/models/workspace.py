# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz
from typing import Optional, Any

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

# Module imports
from .base import BaseModel
from plane.utils.constants import RESTRICTED_WORKSPACE_SLUGS
from plane.utils.color import get_random_color


def get_default_props():
    return {
        "filters": {
            "priority": None,
            "state": None,
            "state_group": None,
            "assignees": None,
            "created_by": None,
            "labels": None,
            "start_date": None,
            "target_date": None,
            "subscriber": None,
        },
        "display_filters": {
            "group_by": None,
            "order_by": "-created_at",
            "type": None,
            "sub_issue": True,
            "show_empty_groups": True,
            "layout": "list",
            "calendar_date_range": "",
        },
        "display_properties": {
            "assignee": True,
            "attachment_count": True,
            "created_on": True,
            "due_date": True,
            "estimate": True,
            "key": True,
            "labels": True,
            "link": True,
            "priority": True,
            "start_date": True,
            "state": True,
            "sub_issue_count": True,
            "updated_on": True,
        },
    }


def get_default_filters():
    return {
        "priority": None,
        "state": None,
        "state_group": None,
        "assignees": None,
        "created_by": None,
        "labels": None,
        "start_date": None,
        "target_date": None,
        "subscriber": None,
    }


def get_default_display_filters():
    return {
        "display_filters": {
            "group_by": None,
            "order_by": "-created_at",
            "type": None,
            "sub_issue": True,
            "show_empty_groups": True,
            "layout": "list",
            "calendar_date_range": "",
        }
    }


def get_default_display_properties():
    return {
        "display_properties": {
            "assignee": True,
            "attachment_count": True,
            "created_on": True,
            "due_date": True,
            "estimate": True,
            "key": True,
            "labels": True,
            "link": True,
            "priority": True,
            "start_date": True,
            "state": True,
            "sub_issue_count": True,
            "updated_on": True,
        }
    }


def get_issue_props():
    return {"subscribed": True, "assigned": True, "created": True, "all_issues": True}


def slug_validator(value):
    if value in RESTRICTED_WORKSPACE_SLUGS:
        raise ValidationError("Slug is not valid")



class Workspace(BaseModel):
    TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))

    name = models.CharField(max_length=80, verbose_name="Workspace Name")
    logo = models.TextField(verbose_name="Logo", blank=True, null=True)
    logo_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        related_name="workspace_logo",
        blank=True,
        null=True,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_workspace",
    )
    slug = models.SlugField(max_length=48, db_index=True, unique=True, validators=[slug_validator])
    organization_size = models.CharField(max_length=20, blank=True, null=True)
    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)
    background_color = models.CharField(max_length=255, default=get_random_color)

    def __str__(self):
        """Return name of the Workspace"""
        return self.name

    @property
    def logo_url(self):
        # Return the logo asset url if it exists
        if self.logo_asset:
            return self.logo_asset.asset_url

        # Return the logo url if it exists
        if self.logo:
            return self.logo
        return None

    def delete(self, using: Optional[str] = None, soft: bool = True, *args: Any, **kwargs: Any):
        """
        Override the delete method to append epoch timestamp to the slug when soft deleting.

        Args:
            using: The database alias to use for the deletion.
            soft: Whether to perform a soft delete (True) or hard delete (False).
            *args: Additional positional arguments.
            **kwargs: Additional keyword arguments.
        """
        # Call the parent class's delete method first
        result = super().delete(using=using, soft=soft, *args, **kwargs)

        # If it's a soft delete and the model still exists (not hard deleted)
        if soft and hasattr(self, "deleted_at") and self.deleted_at:
            # Use the deleted_at timestamp to update the slug
            deletion_timestamp: int = int(self.deleted_at.timestamp())
            self.slug = f"{self.slug}__{deletion_timestamp}"
            self.save(update_fields=["slug"])

        return result

    class Meta:
        verbose_name = "Workspace"
        verbose_name_plural = "Workspaces"
        db_table = "workspaces"
        ordering = ("-created_at",)


class WorkspaceBaseModel(BaseModel):
    workspace = models.ForeignKey("db.Workspace", models.CASCADE, related_name="workspace_%(class)s")
    project = models.ForeignKey("db.Project", models.CASCADE, related_name="project_%(class)s", null=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.project:
            self.workspace = self.project.workspace
        super(WorkspaceBaseModel, self).save(*args, **kwargs)


class WorkspaceMember(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_member")
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="member_workspace",
    )
    company_role = models.TextField(null=True, blank=True)
    view_props = models.JSONField(default=get_default_props)
    default_props = models.JSONField(default=get_default_props)
    issue_props = models.JSONField(default=get_issue_props)
    is_active = models.BooleanField(default=True)
    getting_started_checklist = models.JSONField(default=dict)
    tips = models.JSONField(default=dict)
    explored_features = models.JSONField(default=dict)
    custom_roles = models.ManyToManyField(
        "WorkspaceRole",
        through="WorkspaceMemberRole",
        blank=True,
        related_name="role_members",
    )
    # 角色（「他是干什么的」，取自数据字典 job_role），与权限组无关
    job_roles = models.ManyToManyField(
        "db.DataDictionaryItem",
        through="WorkspaceMemberJobRole",
        blank=True,
        related_name="workspace_members",
    )

    class Meta:
        unique_together = ["workspace", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_unique_workspace_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Member"
        verbose_name_plural = "Workspace Members"
        db_table = "workspace_members"
        ordering = ("-created_at",)

    def __str__(self):
        """Return members of the workspace"""
        return f"{self.member.email} <{self.workspace.name}>"


class WorkspaceMemberInvite(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_member_invite")
    email = models.CharField(max_length=255)
    accepted = models.BooleanField(default=False)
    token = models.CharField(max_length=255)
    message = models.TextField(null=True)
    responded_at = models.DateTimeField(null=True)
    custom_role_ids = models.JSONField(default=list)

    class Meta:
        unique_together = ["email", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["email", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_invite_unique_email_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Member Invite"
        verbose_name_plural = "Workspace Member Invites"
        db_table = "workspace_member_invites"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.email} {self.accepted}"


class Team(BaseModel):
    name = models.CharField(max_length=255, verbose_name="Team Name")
    description = models.TextField(verbose_name="Team Description", blank=True)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="workspace_team")
    logo_props = models.JSONField(default=dict)

    def __str__(self):
        """Return name of the team"""
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="team_unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Team"
        verbose_name_plural = "Teams"
        db_table = "teams"
        ordering = ("-created_at",)


class WorkspaceTheme(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="themes")
    name = models.CharField(max_length=300)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="themes")
    colors = models.JSONField(default=dict)

    def __str__(self):
        return str(self.name) + str(self.actor.email)

    class Meta:
        unique_together = ["workspace", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_theme_unique_workspace_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Theme"
        verbose_name_plural = "Workspace Themes"
        db_table = "workspace_themes"
        ordering = ("-created_at",)


class WorkspaceUserProperties(BaseModel):
    class NavigationControlPreference(models.TextChoices):
        ACCORDION = "ACCORDION", "Accordion"
        TABBED = "TABBED", "Tabbed"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_properties",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_properties",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    navigation_project_limit = models.IntegerField(default=10)
    navigation_control_preference = models.CharField(
        max_length=25,
        choices=NavigationControlPreference.choices,
        default=NavigationControlPreference.ACCORDION,
    )

    class Meta:
        unique_together = ["workspace", "user", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_properties_unique_workspace_user_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace User Property"
        verbose_name_plural = "Workspace User Property"
        db_table = "workspace_user_properties"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.user.email}"


class WorkspaceUserLink(WorkspaceBaseModel):
    title = models.CharField(max_length=255, null=True, blank=True)
    url = models.TextField()
    metadata = models.JSONField(default=dict)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owner_workspace_user_link",
    )

    class Meta:
        verbose_name = "Workspace User Link"
        verbose_name_plural = "Workspace User Links"
        db_table = "workspace_user_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.id} {self.url}"


class WorkspaceHomePreference(BaseModel):
    """Preference for the home page of a workspace for a user"""

    class HomeWidgetKeys(models.TextChoices):
        QUICK_LINKS = "quick_links", "Quick Links"
        RECENTS = "recents", "Recents"
        MY_STICKIES = "my_stickies", "My Stickies"
        NEW_AT_PLANE = "new_at_plane", "New at Plane"
        QUICK_TUTORIAL = "quick_tutorial", "Quick Tutorial"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_home_preferences",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_home_preferences",
    )
    key = models.CharField(max_length=255)
    is_enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["workspace", "user", "key", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_home_preferences_unique_workspace_user_key_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Home Preference"
        verbose_name_plural = "Workspace Home Preferences"
        db_table = "workspace_home_preferences"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.user.email} {self.key}"


class WorkspaceUserWorkPreference(BaseModel):
    """「我的工作」页的个人视图设置（待处理 / 已处理各自启用哪些工作来源、默认分组排序、时间范围）。

    一行一个 (workspace, user)，整份设置存在 ``config`` 里；缺省值与形状校验在
    ``plane/utils/user_work.py``，这里只负责落库。
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_work_preferences",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_work_preferences",
    )
    config = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_work_preferences_unique_workspace_user_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace User Work Preference"
        verbose_name_plural = "Workspace User Work Preferences"
        db_table = "workspace_user_work_preferences"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.workspace.name} {self.user.email} user work preference"


class WorkspaceUserPreference(BaseModel):
    """Preference for the workspace for a user"""

    class UserPreferenceKeys(models.TextChoices):
        VIEWS = "views", "Views"
        ACTIVE_CYCLES = "active_cycles", "Active Cycles"
        ANALYTICS = "analytics", "Analytics"
        TEST_MANAGEMENT = 'test-management','Test Management'
        DRAFTS = "drafts", "Drafts"
        YOUR_WORK = "your_work", "Your Work"
        ARCHIVES = "archives", "Archives"
        STICKIES = "stickies", "Stickies"

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_user_preferences",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_user_preferences",
    )
    key = models.CharField(max_length=255)
    is_pinned = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    class Meta:
        unique_together = ["workspace", "user", "key", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "user", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_user_preferences_unique_workspace_user_key_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace User Preference"
        verbose_name_plural = "Workspace User Preferences"
        db_table = "workspace_user_preferences"
        ordering = ("-created_at",)


def default_data_scope():
    return {"projects": {"mode": "all"}, "products": {"mode": "all"}}


class WorkspaceRole(BaseModel):
    """工作区设置里的「权限组」，按 ``kind`` 分三类（docs/permission-refactor/split-plan.md）：

    - ``workspace`` 工作区权限组：``permissions`` 装 workspace.* + project.* key，有成员（直绑 / 经团队）。
      project.* 部分在成员能看到的所有项目上生效。
    - ``project_template`` 项目权限模板：``permissions`` 只装 project.* key，没有成员；
      引用集合 = 工作区全部项目 − ``project_exclusions``，项目里只能绑人、不能改、可删（= 排除）。
    - ``data`` 数据权限：只有 ``data_scope``（项目 / 产品白名单，各自
      ``{"mode": "all" | "selected" | "filter", "ids": [...], "filter": {...}}``），有成员；
      白名单并集决定成员能看到、能进哪些项目 / 产品。
    同一类型内名称唯一；不同类型可以同名。kind 创建后不可改。
    """

    KIND_WORKSPACE = "workspace"
    KIND_PROJECT_TEMPLATE = "project_template"
    KIND_DATA = "data"
    KIND_CHOICES = (
        (KIND_WORKSPACE, "工作区权限组"),
        (KIND_PROJECT_TEMPLATE, "项目权限模板"),
        (KIND_DATA, "数据权限"),
    )

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_roles",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=KIND_WORKSPACE, verbose_name="类型")
    permissions = models.JSONField(default=dict)
    data_scope = models.JSONField(default=default_data_scope, verbose_name="数据权限")

    class Meta:
        unique_together = ["workspace", "kind", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "kind", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_role_unique_workspace_kind_name_when_deleted_at_null",
            ),
        ]
        verbose_name = "Workspace Role"
        verbose_name_plural = "Workspace Roles"
        db_table = "workspace_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.workspace.name}>"

    @property
    def is_workspace_group(self):
        return self.kind == self.KIND_WORKSPACE

    @property
    def is_project_template(self):
        return self.kind == self.KIND_PROJECT_TEMPLATE

    @property
    def is_data_group(self):
        return self.kind == self.KIND_DATA

    @property
    def can_have_members(self):
        """模板没有成员，人在项目里绑定。"""
        return self.kind != self.KIND_PROJECT_TEMPLATE

    def clean(self):
        super().clean()
        perms = self.permissions if isinstance(self.permissions, dict) else {}
        keys = perms.get("permission_keys") or []
        if self.kind == self.KIND_DATA and keys:
            raise ValidationError("数据权限组不能有操作权限。")
        if self.kind == self.KIND_PROJECT_TEMPLATE and any(key.startswith("workspace.") for key in keys):
            raise ValidationError("项目标准权限组只能有项目权限。")
        if self.kind != self.KIND_DATA and self.data_scope != default_data_scope():
            raise ValidationError("只有数据权限组能配置白名单。")


class WorkspaceRoleProjectExclusion(BaseModel):
    """模板组的「引用排除」：这个项目不再引用这个模板（项目里删除引用 / 组的引用项目页移除）。纯连接行，硬删。"""

    role = models.ForeignKey(WorkspaceRole, on_delete=models.CASCADE, related_name="project_exclusions")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="template_exclusions")

    class Meta:
        db_table = "workspace_role_project_exclusions"
        ordering = ("-created_at",)
        verbose_name = "Workspace Role Project Exclusion"
        verbose_name_plural = "Workspace Role Project Exclusions"
        constraints = [
            models.UniqueConstraint(
                fields=["role", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_role_project_exclusion_unique_active",
            ),
        ]

    def delete(self, using=None, soft=False, *args, **kwargs):
        return super().delete(using=using, soft=False, *args, **kwargs)


class WorkspaceMemberRole(BaseModel):
    """WorkspaceMember direct assignment to a workspace-scoped WorkspaceRole."""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_member_roles",
    )
    member = models.ForeignKey(
        WorkspaceMember,
        on_delete=models.CASCADE,
        related_name="member_roles",
    )
    role = models.ForeignKey(
        WorkspaceRole,
        on_delete=models.CASCADE,
        related_name="role_member_entries",
    )

    def clean(self):
        super().clean()
        if self.member_id and self.workspace_id != self.member.workspace_id:
            raise ValidationError("The member does not belong to this workspace.")
        if self.role_id:
            if self.workspace_id != self.role.workspace_id:
                raise ValidationError("The role does not belong to this workspace.")
            if not self.role.can_have_members:
                raise ValidationError("项目标准权限组不能直接绑定成员，请在项目里绑定。")

    def save(self, *args, **kwargs):
        if self.member_id:
            self.workspace_id = self.member.workspace_id
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)

    class Meta:
        unique_together = [["member", "role", "deleted_at"]]
        constraints = [
            models.UniqueConstraint(
                fields=["member", "role"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_role_unique_member_role_when_active",
            )
        ]
        verbose_name = "Workspace Member Role"
        verbose_name_plural = "Workspace Member Roles"
        db_table = "workspace_member_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member} -> {self.role.name}"


class WorkspaceGroup(BaseModel):
    """Workspace 级用户组，成员固定，可跨项目复用"""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_groups",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ["workspace", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_group_unique_workspace_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Group"
        verbose_name_plural = "Workspace Groups"
        db_table = "workspace_groups"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.workspace.name}>"


class WorkspaceGroupMember(BaseModel):
    """WorkspaceGroup ↔ WorkspaceMember M2M 中间表"""

    group = models.ForeignKey(WorkspaceGroup, on_delete=models.CASCADE, related_name="group_members")
    member = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="member_groups")

    def clean(self):
        super().clean()
        if (
            self.group_id
            and self.member_id
            and self.group.workspace_id != self.member.workspace_id
        ):
            raise ValidationError("The member does not belong to this workspace.")

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)

    class Meta:
        unique_together = ["group", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_group_member_unique_group_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Group Member"
        verbose_name_plural = "Workspace Group Members"
        db_table = "workspace_group_members"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.group.name} -> {self.member}"


class WorkspaceGroupRole(BaseModel):
    """WorkspaceGroup ↔ workspace-scoped WorkspaceRole assignment."""

    group = models.ForeignKey(WorkspaceGroup, on_delete=models.CASCADE, related_name="group_roles")
    role = models.ForeignKey(WorkspaceRole, on_delete=models.CASCADE, related_name="role_groups")

    def clean(self):
        super().clean()
        if self.group_id and self.role_id:
            if self.group.workspace_id != self.role.workspace_id:
                raise ValidationError("The role does not belong to this workspace.")
            if not self.role.can_have_members:
                raise ValidationError("项目标准权限组不能绑定团队，请在项目里绑定。")

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)

    class Meta:
        unique_together = ["group", "role", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "role"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_group_role_unique_group_role_when_deleted_at_null",
            )
        ]
        verbose_name = "Workspace Group Role"
        verbose_name_plural = "Workspace Group Roles"
        db_table = "workspace_group_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.group.name} -> {self.role.name}"


class WorkspaceMemberJobRole(BaseModel):
    """工作区成员挂的角色（数据字典 job_role 的值）。纯连接行，硬删。"""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="workspace_member_job_roles",
    )
    member = models.ForeignKey(
        WorkspaceMember,
        on_delete=models.CASCADE,
        related_name="job_role_links",
    )
    job_role = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.PROTECT,
        related_name="workspace_member_links",
    )

    class Meta:
        db_table = "workspace_member_job_roles"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["member", "job_role"],
                condition=models.Q(deleted_at__isnull=True),
                name="workspace_member_job_role_unique_active",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.member_id and not self.workspace_id:
            self.workspace_id = self.member.workspace_id
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        return super().delete(using=using, soft=False, *args, **kwargs)
