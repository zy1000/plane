"""阶段类型：工作区级的研发阶段词表，评审模板树挂在它上面。

和 ``product_stage`` 数据字典**刻意分家**（批次 1，2026-09-22）：那本字典是产品的
「当前阶段」属性，值由各工作区自己维护；阶段类型是研发流程的骨架，评审模板树、
（后续批次的）研发模式都按它组织。两者初始词表同源（``seed_data`` 的
``STAGE_TYPE_SPECS``），建完之后各改各的，互不影响。

预置的 10 个类型 ``is_system=True``：编码与名称锁死（改了会让模板树和标准流程对不上），
描述和排序随便改。自定义类型没有这个限制。
"""

from django.db import models
from django.db.models import Q

from .base import BaseModel

DEFAULT_SORT_ORDER = 65535
SORT_ORDER_STEP = 10000


class StageType(BaseModel):
    """一个研发阶段类型，如 I阶段 / O-F1 / V阶段（包含NPI）。"""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="stage_types",
        verbose_name="所属工作区",
    )
    code = models.CharField(max_length=64, verbose_name="编码")
    name = models.CharField(max_length=255, verbose_name="名称")
    description = models.TextField(blank=True, default="", verbose_name="描述")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    is_system = models.BooleanField(default=False, verbose_name="是否预置")

    class Meta:
        db_table = "stage_types"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Stage Type"
        verbose_name_plural = "Stage Types"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "code"],
                condition=Q(deleted_at__isnull=True),
                name="stage_type_unique_workspace_code_active",
            ),
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="stage_type_unique_workspace_name_active",
            ),
        ]

    def save(self, *args, **kwargs):
        # 同 DataDictionaryItem.save：追加到末尾。显式给了 sort_order（拖拽中点 / seed）就尊重它。
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            last = StageType.objects.filter(workspace_id=self.workspace_id).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 只硬删，同 DataDictionary.delete：软删级联任务会把引用方的 RESTRICT 当 CASCADE，
        # 软删一个阶段类型会顺手把挂在它下面的评审模板也软删掉。硬删由 DB 的 RESTRICT 兜底拒绝。
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"
