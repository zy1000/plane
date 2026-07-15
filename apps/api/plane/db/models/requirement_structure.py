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


class RequirementTemplateField(BaseModel):
    template = models.ForeignKey(
        RequirementFieldTemplate,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    field_key = models.UUIDField(default=uuid.uuid4, editable=False)
    parent_field = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="child_fields",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    field_type = models.CharField(
        max_length=30,
        choices=RequirementStructuredFieldType.choices,
    )
    sort_key = models.DecimalField(max_digits=36, decimal_places=18)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    validation = models.JSONField(default=dict, blank=True)
    options = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "requirement_template_fields"
        ordering = ("sort_key", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["template", "field_key"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_template_field_unique_key",
            ),
            models.UniqueConstraint(
                fields=["template", "name"],
                condition=Q(parent_field__isnull=True, deleted_at__isnull=True),
                name="requirement_template_root_field_unique_name",
            ),
            models.UniqueConstraint(
                fields=["template", "parent_field", "name"],
                condition=Q(parent_field__isnull=False, deleted_at__isnull=True),
                name="requirement_template_child_field_unique_name",
            ),
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
    schema_hash = models.CharField(max_length=64, blank=True, default="")
    content_hash = models.CharField(max_length=64, blank=True, default="")
    root_row_count = models.PositiveIntegerField(default=0)
    child_row_count = models.PositiveIntegerField(default=0)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "requirement_structured_revisions"
        ordering = ("-created_at",)


class RequirementStructuredField(BaseModel):
    revision = models.ForeignKey(
        RequirementStructuredRevision,
        on_delete=models.CASCADE,
        related_name="fields",
    )
    field_key = models.UUIDField(default=uuid.uuid4, editable=False)
    parent_field = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="child_fields",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    field_type = models.CharField(
        max_length=30,
        choices=RequirementStructuredFieldType.choices,
    )
    sort_key = models.DecimalField(max_digits=36, decimal_places=18)
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    validation = models.JSONField(default=dict, blank=True)
    options = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "requirement_structured_fields"
        ordering = ("sort_key", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["revision", "field_key"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_structured_field_unique_key",
            ),
            models.UniqueConstraint(
                fields=["revision", "name"],
                condition=Q(parent_field__isnull=True, deleted_at__isnull=True),
                name="requirement_structured_root_field_unique_name",
            ),
            models.UniqueConstraint(
                fields=["revision", "parent_field", "name"],
                condition=Q(parent_field__isnull=False, deleted_at__isnull=True),
                name="requirement_structured_child_field_unique_name",
            ),
        ]


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
    table_field = models.ForeignKey(
        RequirementStructuredField,
        on_delete=models.CASCADE,
        related_name="table_rows",
        null=True,
        blank=True,
    )
    sequence_number = models.PositiveBigIntegerField(null=True, blank=True)
    display_id = models.CharField(max_length=255, null=True, blank=True)
    sort_key = models.DecimalField(max_digits=36, decimal_places=18)

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
                    Q(parent_row__isnull=True, table_field__isnull=True)
                    | Q(parent_row__isnull=False, table_field__isnull=False)
                ),
                name="requirement_structured_row_parent_table_pair",
            ),
        ]


class RequirementStructuredValue(BaseModel):
    revision = models.ForeignKey(
        RequirementStructuredRevision,
        on_delete=models.CASCADE,
        related_name="values",
    )
    row = models.ForeignKey(
        RequirementStructuredRow,
        on_delete=models.CASCADE,
        related_name="values",
    )
    field = models.ForeignKey(
        RequirementStructuredField,
        on_delete=models.CASCADE,
        related_name="values",
    )
    value_text = models.TextField(null=True, blank=True)
    value_number = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    value_boolean = models.BooleanField(null=True, blank=True)
    value_date = models.DateField(null=True, blank=True)
    value_min = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    value_max = models.DecimalField(max_digits=30, decimal_places=10, null=True, blank=True)
    value_json = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "requirement_structured_values"
        constraints = [
            models.UniqueConstraint(
                fields=["row", "field"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_structured_value_unique_row_field",
            )
        ]
        indexes = [
            models.Index(fields=["field", "value_number"]),
            models.Index(fields=["field", "value_date"]),
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


class RequirementStructuredDiffEntry(BaseModel):
    class Scope(models.TextChoices):
        SCHEMA = "schema", "Schema"
        ROOT_ROW = "root_row", "Root Row"
        CHILD_ROW = "child_row", "Child Row"

    class ChangeType(models.TextChoices):
        ADDED = "added", "Added"
        REMOVED = "removed", "Removed"
        MODIFIED = "modified", "Modified"
        MOVED = "moved", "Moved"

    change = models.ForeignKey(
        "db.RequirementChange",
        on_delete=models.CASCADE,
        related_name="structured_diff_entries",
    )
    scope = models.CharField(max_length=20, choices=Scope.choices)
    change_type = models.CharField(max_length=20, choices=ChangeType.choices)
    field_key = models.UUIDField(null=True, blank=True)
    row_key = models.UUIDField(null=True, blank=True)
    parent_row_key = models.UUIDField(null=True, blank=True)
    label = models.CharField(max_length=255, blank=True, default="")
    before_value = models.JSONField(null=True, blank=True)
    after_value = models.JSONField(null=True, blank=True)
    sort_key = models.DecimalField(max_digits=36, decimal_places=18, default=0)

    class Meta:
        db_table = "requirement_structured_diff_entries"
        ordering = ("sort_key", "created_at", "id")
        indexes = [
            models.Index(fields=["change", "scope", "change_type"]),
            models.Index(fields=["change", "row_key"]),
        ]
