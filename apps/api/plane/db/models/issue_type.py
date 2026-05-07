# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

# Module imports
from .project import ProjectBaseModel


# IssueType 自动衍生的项目级权限定义。
# key 形式：project.issue_type.<id_hex>.<action>
#   - 用 id.hex 而不是 name 作为 key 主体，既能通过 Permission.key 的正则约束
#     (^[a-z0-9_]+(\.[a-z0-9_]+){2,}$)，也能在 IssueType 改名时保持权限绑定关系不丢失。
#   - 所有 IssueType 都会衍生 5 条权限，由 IssueType.id 唯一确定，
#     运行时鉴权也直接基于 issue_type_id 推导 key（见 plane.app.permissions.base）。
ISSUE_TYPE_PERMISSION_KEY_PREFIX = "project.issue_type."
ISSUE_TYPE_PERMISSION_ACTIONS = (
    ("create", "创建{}类型工作项"),
    ("edit", "编辑{}类型工作项"),
    ("delete", "删除{}类型工作项"),
    ("archive", "归档{}类型工作项"),
    ("unarchive", "恢复{}类型工作项"),
)


def build_issue_type_permission_key(issue_type_id, action: str) -> str:
    if hasattr(issue_type_id, "hex"):
        id_hex = issue_type_id.hex
    else:
        id_hex = str(issue_type_id).replace("-", "")
    return f"{ISSUE_TYPE_PERMISSION_KEY_PREFIX}{id_hex}.{action}"


def sync_issue_type_permissions(issue_type, *, deactivate: bool = False) -> None:
    """根据 IssueType 当前状态 upsert 其对应的 5 条 Permission 行。

    Permission 表的 name(255) / category(100) 长度有限，IssueType.name 上限 255 时
    叠加固定文案会溢出，因此对入库前的展示文本做截断保护。
    """
    from .permission import Permission

    raw_name = issue_type.name or ""
    # 标签上限：Permission.name max_length=255，前缀「创建/编辑/...类型工作项」最多 8 字符，
    # 这里给名字预留 240 字符空间，截断超长部分以避免 DataError。
    safe_name_for_label = raw_name[:240]
    # 分类上限：Permission.category max_length=100，前缀「工作项类型 - 」9 字符，
    # 名字预留 80 字符空间。
    safe_name_for_category = raw_name[:80]
    module = f"issue.type.{issue_type.id.hex}"
    category = f"工作项类型 - {safe_name_for_category}"
    is_active = (not deactivate) and issue_type.is_active
    for action, label_template in ISSUE_TYPE_PERMISSION_ACTIONS:
        key = build_issue_type_permission_key(issue_type.id, action)
        label = label_template.format(safe_name_for_label)
        Permission.objects.update_or_create(
            key=key,
            defaults={
                "name": label,
                "description": label,
                "scope": "project",
                "module": module,
                "action": action,
                "category": category,
                "sort_order": 100,
                "is_active": is_active,
            },
        )


def remove_issue_type_permissions(issue_type_id) -> None:
    from .permission import Permission

    keys = [
        build_issue_type_permission_key(issue_type_id, action)
        for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS
    ]
    # Permission 继承 SoftDeleteModel，QuerySet.delete() 默认走软删除
    # （只把 deleted_at 设为当前时间，行仍占着 key 的 unique 槽位）。
    # 衍生 Permission 是 IssueType 的纯派生数据，没有保留历史的价值，因此硬删除。
    Permission.objects.filter(key__in=keys).delete(soft=False)


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


@receiver(post_save, sender=IssueType)
def _sync_issue_type_permissions_on_save(sender, instance, **kwargs):
    # 软删除时（SoftDeleteModel.delete(soft=True) 走 save 路径），deleted_at 非空，
    # 此时把对应权限标记为 is_active=False，防止它出现在权限选择列表里。
    sync_issue_type_permissions(
        instance, deactivate=instance.deleted_at is not None
    )


@receiver(post_delete, sender=IssueType)
def _remove_issue_type_permissions_on_delete(sender, instance, **kwargs):
    # 硬删除（delete(soft=False)）时彻底清理对应 Permission 行。
    remove_issue_type_permissions(instance.id)
