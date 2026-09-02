from django.db import models
from django.db.models import Q

from .base import BaseModel

DEFAULT_SORT_ORDER = 65535
SORT_ORDER_STEP = 10000


class DataDictionary(BaseModel):
    """工作区级数据字典头。

    系统字典（is_system=True）由 plane/utils/data_dictionary.py 预置：key 不可改、不可删，
    name / description 可改；用户也可以自建字典（is_system=False）。
    产品的阶段 / 类别 / 状态 / 三个研发等级引用 DataDictionaryItem。
    is_colored 是字典级开关：开着时该字典的值在所有使用处渲染成彩色标签（颜色见 item.color）。
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="data_dictionaries",
        verbose_name="所属工作区",
    )
    key = models.CharField(max_length=64, verbose_name="字典编码")
    name = models.CharField(max_length=255, verbose_name="字典名称")
    description = models.TextField(blank=True, default="", verbose_name="描述")
    is_system = models.BooleanField(default=False, verbose_name="是否系统预置")
    is_colored = models.BooleanField(default=False, verbose_name="彩色显示")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "data_dictionaries"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "key"],
                condition=Q(deleted_at__isnull=True),
                name="data_dictionary_unique_workspace_key_active",
            ),
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="data_dictionary_unique_workspace_name_active",
            ),
        ]

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 字典只硬删：soft_delete_related_objects 会把引用方的 RESTRICT 当 CASCADE，
        # 软删一个字典会顺手把引用它的产品也软删掉。硬删则由 DB 的 RESTRICT 兜底拒绝。
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.key} - {self.name}"


class DataDictionaryItem(BaseModel):
    dictionary = models.ForeignKey(
        DataDictionary,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="所属字典",
    )
    # 冗余列：save() 从 dictionary 传播，让 queryset 能一步按 workspace__slug 过滤
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="data_dictionary_items",
        verbose_name="所属工作区",
    )
    label = models.CharField(max_length=255, verbose_name="字典值")
    # 预设色 key（gray / red / …，见 serializer 的 DATA_DICTIONARY_COLOR_KEYS）或 #rrggbb 小写；
    # 空串 = 未指定，字典开了彩色时按灰渲染
    color = models.CharField(max_length=255, blank=True, default="", verbose_name="颜色")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "data_dictionary_items"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["dictionary", "label"],
                condition=Q(deleted_at__isnull=True),
                name="data_dictionary_item_unique_dictionary_label_active",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.dictionary_id and not self.workspace_id:
            self.workspace_id = self.dictionary.workspace_id
        # 同 Label.save：追加到末尾。显式给了 sort_order（拖拽中点 / seed）就尊重它。
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            last = DataDictionaryItem.objects.filter(
                dictionary_id=self.dictionary_id
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 见 DataDictionary.delete
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return self.label
