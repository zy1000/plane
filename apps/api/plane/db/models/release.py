# Django imports
from django.conf import settings
from django.db import models
from django.db.models import Q

# Module imports
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
    BACKLOG = "backlog"
    PLANNED = "planned"
    IN_PROGRESS = "in-progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Release(ProjectBaseModel):
    name = models.CharField(max_length=255, verbose_name="Release Name")
    description = models.TextField(verbose_name="Release Description", blank=True)
    note = models.TextField(verbose_name="Release Note", blank=True, null=True)
    description_text = models.JSONField(verbose_name="Release Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Release Description HTML", blank=True, null=True)
    start_date = models.DateField(null=True)
    target_date = models.DateField(null=True)
    status = models.CharField(
        choices=(
            ("backlog", "Backlog"),
            ("planned", "Planned"),
            ("in-progress", "In Progress"),
            ("paused", "Paused"),
            ("completed", "Completed"),
            ("cancelled", "Cancelled"),
        ),
        default="planned",
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
