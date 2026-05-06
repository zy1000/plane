# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel


class IssueType(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_epic = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    level = models.FloatField(default=0)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        unique_together = ["project", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_type_unique_project_name_when_deleted_at_null",
            )
        ]
        verbose_name = "Issue Type"
        verbose_name_plural = "Issue Types"
        db_table = "issue_types"

    def __str__(self):
        return self.name


class TypeExtraField(ProjectBaseModel):
    FIELD_TYPE_CHOICES = (
        ("text", "Text"),
        ("number", "Number"),
        ("date", "Date"),
        ("boolean", "Boolean"),
        ("select", "Select"),
        ("user", "User"),
    )

    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="extra_fields",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    field_type = models.CharField(
        max_length=30, choices=FIELD_TYPE_CHOICES, default="text"
    )
    is_required = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    options = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(null=True, blank=True)
    validation = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="type_extra_field_unique_name_active",
            )
        ]
        verbose_name = "Type Extra Field"
        verbose_name_plural = "Type Extra Fields"
        db_table = "type_extra_fields"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.name} <{self.issue_type.name}>"


class TypeExtraFieldValue(ProjectBaseModel):
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="type_extra_field_values",
    )
    extra_field = models.ForeignKey(
        "db.TypeExtraField",
        on_delete=models.CASCADE,
        related_name="values",
    )
    value = models.JSONField(null=True, blank=True)
    value_text = models.TextField(null=True, blank=True)
    value_number = models.DecimalField(
        max_digits=20, decimal_places=6, null=True, blank=True
    )
    value_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "extra_field"],
                condition=Q(deleted_at__isnull=True),
                name="type_extra_field_value_unique_active",
            )
        ]
        verbose_name = "Type Extra Field Value"
        verbose_name_plural = "Type Extra Field Values"
        db_table = "type_extra_field_values"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.issue_id} - {self.extra_field.name}"
