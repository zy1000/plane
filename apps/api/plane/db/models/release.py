# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

# Module imports
from plane.utils.html_processor import strip_tags
from .project import ProjectBaseModel


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
        "group_by": None,
        "order_by": "-created_at",
        "type": None,
        "sub_issue": True,
        "show_empty_groups": True,
        "layout": "list",
        "calendar_date_range": "",
    }


def get_default_display_properties():
    return {
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


class ReleaseStatus(models.TextChoices):
    NOT_STARTED = "not-started", "未开始"
    IN_PROGRESS = "in-progress", "进行中"
    PENDING_TEST = "pending-test", "待测试"
    TESTING = "testing", "测试中"
    REJECTED = "rejected", "已驳回"
    COMPLETED = "completed", "已完成"
    CANCELLED = "cancelled", "已取消"


class Release(ProjectBaseModel):
    name = models.CharField(max_length=255, verbose_name="Release Name")
    description = models.TextField(verbose_name="Release Description", blank=True)
    note = models.TextField(verbose_name="Release Note", blank=True, null=True)
    description_text = models.JSONField(verbose_name="Release Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Release Description HTML", blank=True, null=True)
    start_date = models.DateField(null=True)
    target_date = models.DateField(null=True)
    test_handoff_date = models.DateField(null=True)
    status = models.CharField(
        choices=ReleaseStatus.choices,
        default=ReleaseStatus.NOT_STARTED,
        max_length=20,
    )
    lead = models.ForeignKey("db.User", on_delete=models.SET_NULL, related_name="release_leads", null=True)
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="release_members",
        through="ReleaseMember",
        through_fields=("release", "member"),
    )
    files = models.ManyToManyField("db.File", blank=True, related_name="releases")
    view_props = models.JSONField(default=dict)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    archived_at = models.DateTimeField(null=True)
    logo_props = models.JSONField(default=dict)

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="release_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Release"
        verbose_name_plural = "Releases"
        db_table = "releases"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            smallest_sort_order = Release.objects.filter(project=self.project).aggregate(
                smallest=models.Min("sort_order")
            )["smallest"]

            if smallest_sort_order is not None:
                self.sort_order = smallest_sort_order - 10000

        super(Release, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} {self.start_date} {self.target_date}"


class ReleaseMember(ProjectBaseModel):
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE)
    member = models.ForeignKey("db.User", on_delete=models.CASCADE)

    class Meta:
        unique_together = ["release", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["release", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_member_unique_release_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Member"
        verbose_name_plural = "Release Members"
        db_table = "release_members"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.member}"


class ReleaseIssue(ProjectBaseModel):
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, related_name="issue_release")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="issue_release")

    class Meta:
        unique_together = ["issue", "release", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "release"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_issue_unique_issue_release_when_deleted_at_null",
            )
        ]
        verbose_name = "Release Issue"
        verbose_name_plural = "Release Issues"
        db_table = "release_issues"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.issue.name}"


class ReleaseLink(ProjectBaseModel):
    title = models.CharField(max_length=255, blank=True, null=True)
    url = models.URLField()
    release = models.ForeignKey(Release, on_delete=models.CASCADE, related_name="link_release")
    metadata = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Release Link"
        verbose_name_plural = "Release Links"
        db_table = "release_links"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.url}"


class ReleaseUserProperties(ProjectBaseModel):
    release = models.ForeignKey("db.Release", on_delete=models.CASCADE, related_name="release_user_properties")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="release_user_properties",
    )
    filters = models.JSONField(default=get_default_filters)
    display_filters = models.JSONField(default=get_default_display_filters)
    display_properties = models.JSONField(default=get_default_display_properties)
    rich_filters = models.JSONField(default=dict)

    class Meta:
        unique_together = ["release", "user", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["release", "user"],
                condition=models.Q(deleted_at__isnull=True),
                name="release_user_properties_unique_release_user_when_deleted_at_null",
            )
        ]
        verbose_name = "Release User Property"
        verbose_name_plural = "Release User Properties"
        db_table = "release_user_properties"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release.name} {self.user.email}"


class ReleaseOverduePhase(models.TextChoices):
    DEV = "dev", "研发逾期"
    TEST = "test", "测试逾期"


class ReleaseOverdueTrigger(models.TextChoices):
    SYSTEM = "system", "系统自动"
    USER = "user", "人工标记"


class ReleaseOverdueRecord(ProjectBaseModel):
    release = models.ForeignKey(
        Release,
        on_delete=models.CASCADE,
        related_name="overdue_records",
    )
    phase = models.CharField(max_length=8, choices=ReleaseOverduePhase.choices)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    triggered_by = models.CharField(
        max_length=8,
        choices=ReleaseOverdueTrigger.choices,
        default=ReleaseOverdueTrigger.SYSTEM,
    )

    class Meta:
        verbose_name = "Release Overdue Record"
        verbose_name_plural = "Release Overdue Records"
        db_table = "release_overdue_records"
        ordering = ("-started_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["release", "phase"],
                condition=Q(ended_at__isnull=True, deleted_at__isnull=True),
                name="release_overdue_record_unique_active_per_phase",
            )
        ]

    def __str__(self):
        return f"{self.release_id} {self.phase} {self.started_at}"


class ReleaseComment(ProjectBaseModel):
    release = models.ForeignKey(Release, on_delete=models.CASCADE, related_name="release_comments")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="release_comments",
        null=True,
    )
    comment_stripped = models.TextField(verbose_name="Comment", blank=True)
    comment_json = models.JSONField(blank=True, default=dict)
    comment_html = models.TextField(blank=True, default="<p></p>")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="child_release_comments",
    )
    edited_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        self.comment_stripped = strip_tags(self.comment_html) if self.comment_html else ""
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = "Release Comment"
        verbose_name_plural = "Release Comments"
        db_table = "release_comments"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.release_id} {self.actor_id}"


class ReleaseActivity(ProjectBaseModel):
    """发布维度的活动记录（动态），结构对齐 IssueActivity，但主体是 release。

    每条记录代表 release 上的一次属性变更、状态变更、关联变更或评论事件，
    供前端时间线展示。系统触发（例如自动开关延期记录）时 actor 允许为空。
    """

    release = models.ForeignKey(
        Release,
        on_delete=models.CASCADE,
        related_name="release_activities",
    )
    verb = models.CharField(max_length=255, verbose_name="Action", default="created")
    field = models.CharField(max_length=255, verbose_name="Field Name", blank=True, null=True)
    old_value = models.TextField(verbose_name="Old Value", blank=True, null=True)
    new_value = models.TextField(verbose_name="New Value", blank=True, null=True)
    comment = models.TextField(verbose_name="Comment", blank=True)
    release_comment = models.ForeignKey(
        "db.ReleaseComment",
        on_delete=models.SET_NULL,
        related_name="release_comment_activities",
        null=True,
        blank=True,
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="release_activities",
    )
    old_identifier = models.UUIDField(null=True)
    new_identifier = models.UUIDField(null=True)
    epoch = models.FloatField(null=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Release Activity"
        verbose_name_plural = "Release Activities"
        db_table = "release_activities"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["release", "created_at"], name="release_activity_release_ts"),
        ]

    def __str__(self):
        return f"{self.release_id} {self.field} {self.verb}"
