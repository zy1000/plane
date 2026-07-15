import uuid

from django.db import models
from django.db.models import Q

from .base import BaseModel


class RequirementStructuredFieldType(models.TextChoices):
    TEXT = "text", "Text"
    NUMBER = "number", "Number"
    NUMBER_RANGE = "number_range", "Number Range"
    BOOLEAN = "boolean", "Boolean"
    DATE = "date", "Date"
    SELECT = "select", "Select"
    AUTO_ID = "auto_id", "Auto ID"
    TABLE = "table", "Table"


class RequirementFieldTemplate(BaseModel):
    class TemplateType(models.TextChoices):
        STRUCTURED = "structured", "Structured"

    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_field_templates",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    template_type = models.CharField(
        max_length=30,
        choices=TemplateType.choices,
        default=TemplateType.STRUCTURED,
    )
    revision = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    # Field definitions stored as an ordered list of API-shaped dicts
    # (key/parent_key/name/field_type/sort_key/config/validation/options/...).
    schema = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "requirement_field_templates"
        ordering = ("name", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_field_template_unique_product_name",
            )
        ]


class RequirementStructuredRevision(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        LOCKED = "locked", "Locked"

    requirement = models.ForeignKey(
        "db.Requirement",
        on_delete=models.CASCADE,
        related_name="structured_revisions",
    )
    change = models.OneToOneField(
        "db.RequirementChange",
        on_delete=models.CASCADE,
        related_name="structured_revision",
    )
    source_revision = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="derived_revisions",
        null=True,
        blank=True,
    )
    source_template = models.ForeignKey(
        RequirementFieldTemplate,
        on_delete=models.SET_NULL,
        related_name="imported_revisions",
        null=True,
        blank=True,
    )
    source_template_revision = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    lock_version = models.PositiveIntegerField(default=1)
    # Frozen field definitions for this revision (same shape as template schema).
    schema = models.JSONField(default=list, blank=True)
    schema_hash = models.CharField(max_length=64, blank=True, default="")
    content_hash = models.CharField(max_length=64, blank=True, default="")
    root_row_count = models.PositiveIntegerField(default=0)
    child_row_count = models.PositiveIntegerField(default=0)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "requirement_structured_revisions"
        ordering = ("-created_at",)


class RequirementStructuredRow(BaseModel):
    revision = models.ForeignKey(
        RequirementStructuredRevision,
        on_delete=models.CASCADE,
        related_name="rows",
    )
    row_key = models.UUIDField(default=uuid.uuid4, editable=False)
    parent_row = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="child_rows",
        null=True,
        blank=True,
    )
    # Which child-table field (by field_key) this row belongs to; null for root rows.
    table_field_key = models.UUIDField(null=True, blank=True)
    sequence_number = models.PositiveBigIntegerField(null=True, blank=True)
    display_id = models.CharField(max_length=255, null=True, blank=True)
    sort_key = models.DecimalField(max_digits=36, decimal_places=18)
    # All field values for this row, keyed by field_key (string).
    values = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "requirement_structured_rows"
        ordering = ("sort_key", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["revision", "row_key"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_structured_row_unique_key",
            ),
            models.CheckConstraint(
                check=(
                    Q(parent_row__isnull=True, table_field_key__isnull=True)
                    | Q(parent_row__isnull=False, table_field_key__isnull=False)
                ),
                name="requirement_structured_row_parent_table_pair",
            ),
        ]


class RequirementSequenceCounter(BaseModel):
    requirement = models.ForeignKey(
        "db.Requirement",
        on_delete=models.CASCADE,
        related_name="sequence_counters",
    )
    field_key = models.UUIDField()
    parent_row_key = models.UUIDField(null=True, blank=True)
    next_number = models.PositiveBigIntegerField(default=1)

    class Meta:
        db_table = "requirement_sequence_counters"
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "field_key"],
                condition=Q(parent_row_key__isnull=True, deleted_at__isnull=True),
                name="requirement_root_sequence_counter_unique",
            ),
            models.UniqueConstraint(
                fields=["requirement", "field_key", "parent_row_key"],
                condition=Q(parent_row_key__isnull=False, deleted_at__isnull=True),
                name="requirement_child_sequence_counter_unique",
            ),
        ]
