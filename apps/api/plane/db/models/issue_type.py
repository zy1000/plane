# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


# Django imports
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q

# Module imports

from .base import BaseModel
from .issue_scheme import SchemeBaseModel
from .project import ProjectBaseModel

class IssueTypeCategory(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    is_system = models.BooleanField(default=False)
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="workspace_%(class)s"
    )

    class Meta:
        db_table = "issue_type_category"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                name='issue_type_category_unique_name',
            )
        ]

    def __str__(self):
        return self.name


class IssueType(SchemeBaseModel):
    # 所属工作项方案。按项目取类型写 IssueType.objects.filter(scheme__projects=<project_id>)
    scheme = models.ForeignKey(
        "db.IssueScheme",
        on_delete=models.CASCADE,
        related_name="issue_types",
    )
    name = models.CharField(max_length=255)
    # 系统标识：种子五个类型的固定英文 key（seed_data/issue_scheme.py），代码按它判断而不按名字。
    # 用户自建的类型为空；创建后不可改（serializer 只读）。
    system_key = models.CharField(max_length=32, null=True, blank=True)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_epic = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    level = models.FloatField(default=0)
    # 页面、分组与字段位置属于类型，不同步到通用字段库。
    field_layout = models.JSONField(default=dict, blank=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    category = models.ForeignKey(
        IssueTypeCategory, on_delete=models.CASCADE, related_name="issue_types", null=True
    )
    # 项目脱离方案时复制出来的类型指回类型库里的原类型。权限组按类型排除时存的是库类型 id，
    # 项目里的副本靠它对上（permissions/base.py::issue_type_permission_info）。库类型自己为空。
    library_type = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_copies",
        verbose_name="类型库原类型",
    )

    class Meta:
        unique_together = ["scheme", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["scheme", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_type_unique_scheme_name_when_deleted_at_null",
            ),
            # 同方案每个系统标识至多一个
            models.UniqueConstraint(
                fields=["scheme", "system_key"],
                condition=Q(deleted_at__isnull=True, system_key__isnull=False),
                name="issue_type_unique_scheme_system_key",
            ),
        ]
        verbose_name = "Issue Type"
        verbose_name_plural = "Issue Types"
        db_table = "issue_types"

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        from plane.utils.issue_type_layout import validate_field_layout
        fields = [] if self._state.adding else self.extra_fields.all()
        validate_field_layout(self.field_layout, fields)

    @transaction.atomic
    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if update_fields is None or "field_layout" in update_fields:
            previous = None if self._state.adding else (
                IssueType.all_objects.select_for_update().filter(pk=self.pk).values("field_layout").first()
            )
            # 字段增删后未重新排版时，普通类型编辑仍可保存；显式更新布局才校验全部引用。
            if previous is None or previous["field_layout"] != self.field_layout:
                self.clean()
        return super().save(*args, **kwargs)


#: 库字段统一定义、同步到绑定行的列（绑定行自己只管 sort_order）
LIBRARY_FIELD_DEFINITION_COLUMNS = (
    "name",
    "description",
    "logo_props",
    "field_type",
    "is_required",
    "is_active",
    "options",
    "default_value",
    "validation",
)


class IssueFieldDefinition(BaseModel):
    """通用字段库：工作区级的字段定义，保证同一个字段在各工作项类型里完全一致。

    类型通过 ``TypeExtraField.library_field`` 绑定库字段。绑定行冗余存一份定义列
    （``LIBRARY_FIELD_DEFINITION_COLUMNS``），读侧（字段值校验、必填、导出、需求网格、流转必填字段）
    照旧读 TypeExtraField，不需要知道库的存在；库字段保存时在同一事务里把定义写到全部绑定行。
    类型照样可以建不绑库的私有字段。
    """

    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="issue_field_definitions"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    field_type = models.CharField(max_length=30, choices=(
        ("text", "Text"),
        ("number", "Number"),
        ("date", "Date"),
        ("boolean", "Boolean"),
        ("select", "Select"),
        ("user", "User"),
    ), default="text")
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    options = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(null=True, blank=True)
    validation = models.JSONField(default=dict, blank=True)
    linkage = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_field_definition_unique_workspace_name",
            )
        ]
        verbose_name = "Issue Field Definition"
        verbose_name_plural = "Issue Field Definitions"
        db_table = "issue_field_definitions"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return self.name

    def definition_values(self):
        return {column: getattr(self, column) for column in LIBRARY_FIELD_DEFINITION_COLUMNS}

    def clean(self):
        super().clean()
        from plane.utils.field_linkage import validate_field
        validate_field(self)

    def save(self, *args, **kwargs):
        from plane.utils.field_linkage import bind_library_dependencies
        from plane.db.models import Workspace
        with transaction.atomic():
            Workspace.objects.select_for_update().get(pk=self.workspace_id)
            self.clean()
            super().save(*args, **kwargs)
            # 定义同步到全部绑定行（含软删的，免得恢复后带着旧定义）
            TypeExtraField.all_objects.filter(library_field_id=self.pk).update(**self.definition_values())
            for issue_type in IssueType.objects.filter(extra_fields__library_field_id=self.pk, extra_fields__deleted_at__isnull=True).distinct():
                bind_library_dependencies(issue_type, [self.pk])
                from plane.utils.field_linkage import validate_graph
                validate_graph(list(TypeExtraField.objects.filter(issue_type=issue_type)))


class TypeExtraField(SchemeBaseModel):
    # 与 issue_type.scheme 恒一致
    scheme = models.ForeignKey(
        "db.IssueScheme",
        on_delete=models.CASCADE,
        related_name="extra_fields",
    )
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
    linkage = models.JSONField(default=dict, blank=True)
    # 绑定的库字段：非空时上面的定义列由库同步、只读（serializer 拦），本行只管 sort_order；空 = 本类型私有字段
    library_field = models.ForeignKey(
        "db.IssueFieldDefinition",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="bindings",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["scheme", "issue_type", "name"],
                condition=Q(deleted_at__isnull=True),
                name="type_extra_field_unique_scheme_name_active",
            )
        ]
        verbose_name = "Type Extra Field"
        verbose_name_plural = "Type Extra Fields"
        db_table = "type_extra_fields"
        ordering = ("sort_order", "created_at")

    def __str__(self):
        return f"{self.name} <{self.issue_type.name}>"

    def clean(self):
        super().clean()
        from plane.utils.field_linkage import validate_field
        validate_field(self)

    @transaction.atomic
    def save(self, *args, **kwargs):
        IssueType.objects.select_for_update().get(pk=self.issue_type_id)
        self.clean()
        if self.issue_type_id and not self.scheme_id:
            self.scheme_id = self.issue_type.scheme_id
        super().save(*args, **kwargs)


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


