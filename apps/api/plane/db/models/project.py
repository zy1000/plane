# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import pytz
from decimal import Decimal
from uuid import uuid4
from enum import Enum

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

# Module imports
from plane.db.mixins import AuditModel, SoftDeletionManager

from .base import BaseModel

ROLE_CHOICES = ((20, "Admin"), (15, "Member"), (5, "Guest"))


def validate_estimated_hours_half_step(value):
    """预估工时必须为 0.5 小时的整数倍（如 100、100.5、101）。"""
    if value is None:
        return
    d = value if isinstance(value, Decimal) else Decimal(str(value))
    doubled = d * Decimal("2")
    if doubled % Decimal("1") != Decimal("0"):
        raise ValidationError(
            "Estimated hours must be in 0.5 hour increments (e.g. 100, 100.5, 101).",
            code="estimated_hours_half_step",
        )


class SoftProjectManager(SoftDeletionManager):
    def get_queryset(self):
        return super().get_queryset().filter(is_template=False)


class ROLE(Enum):
    ADMIN = 20
    MEMBER = 15
    GUEST = 5


class ProjectNetwork(Enum):
    SECRET = 0
    PUBLIC = 2

    @classmethod
    def choices(cls):
        return [(0, "Secret"), (2, "Public")]


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
    }


def get_default_preferences():
    return {"pages": {"block_display": True}, "navigation": {"default_tab": "work_items", "hide_in_more_menu": []}}


PROJECT_GRADE_CHOICES = (
    ("P+", "P+"),
    ("P", "P"),
    ("A", "A"),
    ("B", "B"),
    ("C", "C"),
)

PROJECT_PRODUCT_TYPE_CHOICES = (
    ("电表", "电表"),
    ("水表", "水表"),
    ("气表", "气表"),
    ("P2P", "P2P"),
    ("PLC", "PLC"),
    ("DCU", "DCU"),
    ("CIU", "CIU"),
    ("工具", "工具"),
    ("LoRaWAN", "LoRaWAN"),
    ("RF mesh", "RF mesh"),
    ("Sigfox", "Sigfox"),
    ("wM-Bus", "wM-Bus"),
    ("Zigbee", "Zigbee"),
    ("BLE", "BLE"),
    ("Gateway", "Gateway"),
    ("WIFI", "WIFI"),
    ("Ethernet", "Ethernet"),
    ("Lora", "Lora"),
    ("Hybrid", "Hybrid"),
    ("WI-SUN", "WI-SUN"),
    ("Repeater", "Repeater"),
    ("RS485", "RS485"),
    ("其他", "其他"),
)


class Project(BaseModel):
    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))
    name = models.CharField(max_length=255, verbose_name="Project Name")
    description = models.TextField(verbose_name="Project Description", blank=True)
    description_text = models.JSONField(verbose_name="Project Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Project Description HTML", blank=True, null=True)
    network = models.PositiveSmallIntegerField(default=2, choices=NETWORK_CHOICES)
    workspace = models.ForeignKey("db.WorkSpace", on_delete=models.CASCADE, related_name="workspace_project")
    identifier = models.CharField(max_length=12, verbose_name="Project Identifier", db_index=True)
    default_assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="default_assignee",
        null=True,
        blank=True,
    )
    project_lead = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_lead",
        null=True,
        blank=True,
    )
    emoji = models.CharField(max_length=255, null=True, blank=True)
    icon_prop = models.JSONField(null=True)
    module_view = models.BooleanField(default=True)
    cycle_view = models.BooleanField(default=True)
    issue_views_view = models.BooleanField(default=True)
    page_view = models.BooleanField(default=True)
    intake_view = models.BooleanField(default=True)
    is_time_tracking_enabled = models.BooleanField(default=False)
    is_issue_type_enabled = models.BooleanField(default=False)
    guest_view_all_features = models.BooleanField(default=False)
    cover_image = models.TextField(blank=True, null=True)
    cover_image_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_cover_image",
    )
    estimate = models.ForeignKey("db.Estimate", on_delete=models.SET_NULL, related_name="projects", null=True)
    archive_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])
    close_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])
    logo_props = models.JSONField(default=dict)
    default_state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, related_name="default_state")
    archived_at = models.DateTimeField(null=True)
    # timezone
    TIMEZONE_CHOICES = tuple(zip(pytz.common_timezones, pytz.common_timezones))
    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)
    # external_id for imports
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    is_template = models.BooleanField(default=False)
    estimated_hours = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=100,
        validators=[
            MinValueValidator(Decimal("0")),
            validate_estimated_hours_half_step,
        ],
        verbose_name="Estimated Hours",
        help_text="Total estimated working hours for this project (default: 100h)",
    )
    grade = models.CharField(
        max_length=4,
        choices=PROJECT_GRADE_CHOICES,
        null=True,
        blank=True,
        default='B',
        verbose_name="Project Grade",
    )
    product_type = models.CharField(
        max_length=32,
        choices=PROJECT_PRODUCT_TYPE_CHOICES,
        null=True,
        blank=True,
        verbose_name="Project Product Type",
    )

    pms_project_name = models.CharField(max_length=255, null=True, blank=True)

    objects = SoftProjectManager()

    def __init__(self, *args, **kwargs):
        # Track if timezone is provided, if so, don't override it with the workspace timezone when saving
        self.is_timezone_provided = kwargs.get("timezone") is not None
        super().__init__(*args, **kwargs)

    @property
    def cover_image_url(self):
        # Return cover image url
        if self.cover_image_asset:
            return self.cover_image_asset.asset_url

        # Return cover image url
        if self.cover_image:
            return self.cover_image

        return None

    def __str__(self):
        """Return name of the project"""
        return f"{self.name} <{self.workspace.name}>"

    class Meta:
        unique_together = [
            ["identifier", "workspace", "deleted_at"],
            ["name", "workspace", "deleted_at"],
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["identifier", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="project_unique_identifier_workspace_when_deleted_at_null",
            ),
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="project_unique_name_workspace_when_deleted_at_null",
            ),
        ]
        verbose_name = "Project"
        verbose_name_plural = "Projects"
        db_table = "projects"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        from plane.db.models import Workspace

        self.identifier = self.identifier.strip().upper()
        is_creating = self._state.adding

        if is_creating and not self.is_timezone_provided:
            workspace = Workspace.objects.get(id=self.workspace_id)
            self.timezone = workspace.timezone

        return super().save(*args, **kwargs)


class ProjectBaseModel(BaseModel):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_%(class)s")
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s")

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.workspace = self.project.workspace
        super(ProjectBaseModel, self).save(*args, **kwargs)


class ProjectMemberInvite(ProjectBaseModel):
    email = models.CharField(max_length=255)
    accepted = models.BooleanField(default=False)
    token = models.CharField(max_length=255)
    message = models.TextField(null=True)
    responded_at = models.DateTimeField(null=True)
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)

    class Meta:
        verbose_name = "Project Member Invite"
        verbose_name_plural = "Project Member Invites"
        db_table = "project_member_invites"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project.name} {self.email} {self.accepted}"


class ProjectRole(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    permissions = models.JSONField(default=dict)
    source_template = models.ForeignKey(
        "db.WorkspaceRole",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_project_roles",
    )

    class Meta:
        unique_together = [["project", "name", "deleted_at"]]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(deleted_at__isnull=True),
                name="project_role_unique_project_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Role"
        verbose_name_plural = "Project Roles"
        db_table = "project_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} <{self.project.name}>"


class ProjectMember(ProjectBaseModel):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="member_project",
    )
    comment = models.TextField(blank=True, null=True)
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=5)
    view_props = models.JSONField(default=get_default_props)
    default_props = models.JSONField(default=get_default_props)
    preferences = models.JSONField(default=get_default_preferences)
    sort_order = models.FloatField(default=65535)
    is_active = models.BooleanField(default=True)
    custom_roles = models.ManyToManyField(
        "ProjectRole",
        through="ProjectMemberRole",
        blank=True,
        related_name="role_members",
    )

    def save(self, *args, **kwargs):
        if self._state.adding and self.member:
            # Get the minimum sort_order for this member in the workspace
            min_sort_order_result = ProjectUserProperty.objects.filter(
                workspace_id=self.project.workspace_id, user=self.member
            ).aggregate(min_sort_order=models.Min("sort_order"))
            min_sort_order = min_sort_order_result.get("min_sort_order")

            # create project user property with project sort order
            ProjectUserProperty.objects.create(
                workspace_id=self.project.workspace_id,
                project=self.project,
                user=self.member,
                sort_order=(min_sort_order - 10000 if min_sort_order is not None else 65535),
            )

        super(ProjectMember, self).save(*args, **kwargs)

    class Meta:
        unique_together = ["project", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member"],
                condition=Q(deleted_at__isnull=True),
                name="project_member_unique_project_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Member"
        verbose_name_plural = "Project Members"
        db_table = "project_members"
        ordering = ("-created_at",)

    def __str__(self):
        """Return members of the project"""
        return f"{self.member.email} <{self.project.name}>"


class ProjectMemberRole(ProjectBaseModel):
    """ProjectMember ↔ ProjectRole M2M 中间表"""

    member = models.ForeignKey(ProjectMember, on_delete=models.CASCADE, related_name="member_roles")
    role = models.ForeignKey(ProjectRole, on_delete=models.CASCADE, related_name="role_member_entries")

    class Meta:
        unique_together = [["member", "role", "deleted_at"]]
        constraints = [
            models.UniqueConstraint(
                fields=["member", "role"],
                condition=Q(deleted_at__isnull=True),
                name="project_member_role_unique_member_role_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Member Role"
        verbose_name_plural = "Project Member Roles"
        db_table = "project_member_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member} -> {self.role.name}"


class ProjectGroupRole(ProjectBaseModel):
    """WorkspaceGroup 在某个项目中被授予的 ProjectRole（组在此项目的权限授权）"""

    group = models.ForeignKey("db.WorkspaceGroup", on_delete=models.CASCADE, related_name="project_group_roles")
    role = models.ForeignKey(ProjectRole, on_delete=models.CASCADE, related_name="group_role_entries")

    def clean(self):
        super().clean()
        if self.role_id and self.project_id != self.role.project_id:
            raise ValidationError("The role does not belong to this project.")
        if self.group_id and self.project_id and self.group.workspace_id != self.project.workspace_id:
            raise ValidationError("The group does not belong to this project's workspace.")

    def save(self, *args, **kwargs):
        if self.role_id:
            self.project_id = self.role.project_id
            self.workspace_id = self.role.workspace_id
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)

    class Meta:
        unique_together = [["group", "role", "deleted_at"]]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "role"],
                condition=Q(deleted_at__isnull=True),
                name="project_group_role_unique_group_role_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Group Role"
        verbose_name_plural = "Project Group Roles"
        db_table = "project_group_roles"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.group.name} -> {self.role.name}"


# TODO: Remove workspace relation later
class ProjectIdentifier(AuditModel):
    workspace = models.ForeignKey("db.Workspace", models.CASCADE, related_name="project_identifiers", null=True)
    project = models.OneToOneField(Project, on_delete=models.CASCADE, related_name="project_identifier")
    name = models.CharField(max_length=12, db_index=True)

    class Meta:
        unique_together = ["name", "workspace", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Identifier"
        verbose_name_plural = "Project Identifiers"
        db_table = "project_identifiers"
        ordering = ("-created_at",)


def get_anchor():
    return uuid4().hex


def get_default_views():
    return {
        "list": True,
        "kanban": True,
        "calendar": True,
        "gantt": True,
        "spreadsheet": True,
    }


# DEPRECATED TODO:
# used to get the old anchors for the project deploy boards
class ProjectDeployBoard(ProjectBaseModel):
    anchor = models.CharField(max_length=255, default=get_anchor, unique=True, db_index=True)
    comments = models.BooleanField(default=False)
    reactions = models.BooleanField(default=False)
    intake = models.ForeignKey("db.Intake", related_name="board_intake", on_delete=models.SET_NULL, null=True)
    votes = models.BooleanField(default=False)
    views = models.JSONField(default=get_default_views)

    class Meta:
        unique_together = ["project", "anchor"]
        verbose_name = "Project Deploy Board"
        verbose_name_plural = "Project Deploy Boards"
        db_table = "project_deploy_boards"
        ordering = ("-created_at",)

    def __str__(self):
        """Return project and anchor"""
        return f"{self.anchor} <{self.project.name}>"


class ProjectPublicMember(ProjectBaseModel):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="public_project_members",
    )

    class Meta:
        unique_together = ["project", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_public_member_unique_project_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Public Member"
        verbose_name_plural = "Project Public Members"
        db_table = "project_public_members"
        ordering = ("-created_at",)


class ProjectTemplate(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, verbose_name="Project Template Name")
    description = models.TextField(verbose_name="Project Description", blank=True)

    project = models.OneToOneField(Project, null=True, on_delete=models.CASCADE, related_name="template")

    class Meta:
        db_table = "project_template"


class ProjectUserProperty(ProjectBaseModel):
    from .issue import get_default_filters, get_default_display_filters, get_default_display_properties

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_property_user",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)
    preferences = models.JSONField(default=get_default_preferences)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Project User Property"
        verbose_name_plural = "Project User Properties"
        db_table = "project_user_properties"
        ordering = ("-created_at",)
        unique_together = ["user", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "project"],
                condition=Q(deleted_at__isnull=True),
                name="project_user_property_unique_user_project_when_deleted_at_null",
            )
        ]

    def __str__(self):
        """Return properties status of the project"""
        return str(self.user)


class ProjectAnnouncement(BaseModel):
    name = models.CharField(max_length=255, verbose_name="Project Announcement Name")
    description = models.TextField(verbose_name="Project Announcement Description", blank=True, null=True)

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_%(class)s")

    class Meta:
        db_table = "project_announcement"
        ordering = ("-created_at",)


class ProjectPmsInfo(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_pms_info")
    sub_project = models.CharField(max_length=255, verbose_name="子项目名称")
    project_code = models.CharField(max_length=255, verbose_name='项目编号')
    meter_type = models.CharField(max_length=255, verbose_name='产品类型')
    software_version = models.CharField(max_length=255, verbose_name='软件版本')
    tool_version = models.CharField(max_length=255, verbose_name='工具软件版本')
    reproduce = models.CharField(max_length=255, verbose_name='易现等级1')

    issue_ids = models.JSONField(default=list)

    class Meta:
        db_table = "project_pms_info"
