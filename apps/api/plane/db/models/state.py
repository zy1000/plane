# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.template.defaultfilters import slugify
from django.db.models import Q

# Module imports
from .issue_scheme import SchemeBaseModel
from plane.db.mixins import SoftDeletionManager

class StateGroup(models.TextChoices):
    BACKLOG = "backlog", "Backlog"
    UNSTARTED = "unstarted", "Unstarted"
    STARTED = "started", "Started"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    TRIAGE = "triage", "Triage"


# Default states
DEFAULT_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": StateGroup.BACKLOG.value,
        "default": True,
    },
    {
        "name": "Todo",
        "color": "#60646C",
        "sequence": 25000,
        "group": StateGroup.UNSTARTED.value,
    },
    {
        "name": "In Progress",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Done",
        "color": "#46A758",
        "sequence": 45000,
        "group": StateGroup.COMPLETED.value,
    },
    {
        "name": "Cancelled",
        "color": "#9AA4BC",
        "sequence": 55000,
        "group": StateGroup.CANCELLED.value,
    },
    {
        "name": "Triage",
        "color": "#4E5355",
        "sequence": 65000,
        "group": StateGroup.TRIAGE.value,
    },
]

DEFAULT_BUG_STATES = [
    {
        "name": "Backlog",
        "color": "#60646C",
        "sequence": 15000,
        "group": StateGroup.BACKLOG.value,
        "default": True,
    },
    {
        "name": "Open",
        "color": "#60646C",
        "sequence": 25000,
        "group": StateGroup.UNSTARTED.value,
    },
    {
        "name": "Fixed",
        "color": "#F59E0B",
        "sequence": 35000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Pending-Reject",
        "color": "#F59E0B",
        "sequence": 45000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Suspend",
        "color": "#F59E0B",
        "sequence": 55000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Reopen",
        "color": "#F59E0B",
        "sequence": 65000,
        "group": StateGroup.STARTED.value,
    },
    {
        "name": "Closed",
        "color": "#46A758",
        "sequence": 75000,
        "group": StateGroup.COMPLETED.value,
    },
    {
        "name": "Rejected",
        "color": "#b30000",
        "sequence": 85000,
        "group": StateGroup.CANCELLED.value,
    },
]


class StateManager(SoftDeletionManager):
    """Default manager - excludes triage states"""

    def get_queryset(self):
        return super().get_queryset().exclude(group=StateGroup.TRIAGE.value)


class TriageStateManager(SoftDeletionManager):
    """Manager for triage states only"""

    def get_queryset(self):
        return super().get_queryset().filter(group=StateGroup.TRIAGE.value)


class State(SchemeBaseModel):
    # 所属工作项方案。按项目取状态写 State.objects.filter(scheme__projects=<project_id>)；
    # triage 每方案一条、不挂类型
    scheme = models.ForeignKey(
        "db.IssueScheme",
        on_delete=models.CASCADE,
        related_name="states",
    )
    name = models.CharField(max_length=255, verbose_name="State Name")
    description = models.TextField(verbose_name="State Description", blank=True)
    color = models.CharField(max_length=255, verbose_name="State Color")
    slug = models.SlugField(max_length=100, blank=True)
    sequence = models.FloatField(default=65535)
    group = models.CharField(
        choices=StateGroup.choices,
        default=StateGroup.BACKLOG,
        max_length=20,
    )
    is_triage = models.BooleanField(default=False)
    default = models.BooleanField(default=False)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    issue_type = models.ForeignKey("db.IssueType",related_name="states",null=True, on_delete=models.CASCADE)


    objects = StateManager()
    all_state_objects = models.Manager()
    triage_objects = TriageStateManager()

    def __str__(self):
        """Return name of the state"""
        return f"{self.name} <{self.scheme.name}>"

    class Meta:
        unique_together = ["name", "issue_type", "scheme", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "issue_type", "scheme"],
                condition=Q(deleted_at__isnull=True),
                name="state_unique_name_scheme_when_deleted_at_null",
            )
        ]
        verbose_name = "State"
        verbose_name_plural = "States"
        db_table = "states"
        ordering = ("sequence",)

    def save(self, *args, **kwargs):
        self.slug = slugify(self.name)
        if self.issue_type_id and not self.scheme_id:
            self.scheme_id = self.issue_type.scheme_id
        if self._state.adding:
            # Get the maximum sequence value from the database
            last_id = State.objects.filter(scheme_id=self.scheme_id).aggregate(largest=models.Max("sequence"))["largest"]
            # if last_id is not None
            if last_id is not None:
                self.sequence = last_id + 15000

        return super().save(*args, **kwargs)
