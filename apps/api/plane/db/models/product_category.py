"""产品分类：工作区级的标准库分类（电表、水表…），每个分类维护一组一级模块。

标准库可选一个产品分类。选了之后，库的第一层模块就是分类的一级模块
（``RequirementModule.category_module`` 指回来），并且**实时跟随**分类变化：
分类里新增 / 改名 / 排序 / 删除一级模块，所有用该分类的库同步变化；库里不能
自己增删改第一层，只能在第一层下面建子模块。同步规则集中在
``plane.utils.product_category``。

与数据字典里的「产品类别」（``product_category`` 字典，产品上的属性）无关。
"""

from django.db import models
from django.db.models import Q

from .base import BaseModel

DEFAULT_SORT_ORDER = 65535
SORT_ORDER_STEP = 10000


class ProductCategory(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="product_categories",
        verbose_name="所属工作区",
    )
    name = models.CharField(max_length=255, verbose_name="分类名称")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "product_categories"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Product Category"
        verbose_name_plural = "Product Categories"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="product_category_unique_workspace_name_active",
            ),
        ]

    def save(self, *args, **kwargs):
        # 新建追加到末尾；显式给了 sort_order 就尊重它（同 StageType）
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            last = ProductCategory.objects.filter(
                workspace_id=self.workspace_id
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 只硬删：软删的异步级联会把引用方（RequirementLibrary.product_category 是
        # RESTRICT）当 CASCADE，顺手把标准库也软删掉。被库引用时由 DB 拒绝。
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return self.name


class ProductCategoryModule(BaseModel):
    """分类下的一个一级模块。名称长度与 RequirementModule.name 保持一致。"""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="product_category_modules",
        verbose_name="所属工作区",
    )
    category = models.ForeignKey(
        ProductCategory,
        on_delete=models.CASCADE,
        related_name="modules",
        verbose_name="所属产品分类",
    )
    name = models.CharField(max_length=30, verbose_name="模块名称")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "product_category_modules"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Product Category Module"
        verbose_name_plural = "Product Category Modules"
        constraints = [
            models.UniqueConstraint(
                fields=["category", "name"],
                condition=Q(deleted_at__isnull=True),
                name="product_category_module_unique_name_active",
            ),
        ]

    def save(self, *args, **kwargs):
        if not self.workspace_id and self.category_id:
            self.workspace_id = self.category.workspace_id
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            last = ProductCategoryModule.objects.filter(
                category_id=self.category_id
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 同 ProductCategory：只硬删，库里对应的一级模块由同步工具先行处理
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return self.name
