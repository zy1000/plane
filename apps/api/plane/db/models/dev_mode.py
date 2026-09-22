"""研发模式：工作区级的开发方式定义，决定项目能用哪些组件、有哪些阶段、每阶段启用哪些评审。

三层结构的中间一层（见 ``docs/dev-mode/dev-mode-requirements.md`` 1.3）::

    阶段类型库（StageType）──引用──> 研发模式（DevMode）──必选──> 项目
      └ 标准评审树                     └ 阶段（DevModeStage）
        (StageReviewTemplate)            └ 勾选的评审节点（DevModeStageTemplate）

本批（批次 2）只建这三张表和维护接口，**项目侧完全感知不到模式**：不加
``Project.dev_mode``，裁剪表与评审实例照旧。接项目是批次 3、4 的事。

预置的三个模式（IDOV / Scrum / 混合模式）``is_system=True``：不可删、不可改名；
组件开关、描述、图标、阶段都可以随便改。
"""

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from plane.db.seed_data.dev_modes import normalize_features

from .base import BaseModel

DEFAULT_SORT_ORDER = 65535
SORT_ORDER_STEP = 10000

#: 一个模式内所有阶段的工作量占比累计上限
MAX_WORKLOAD_RATIO_TOTAL = 100


class DevMode(BaseModel):
    """一种开发方式，如 IDOV / Scrum / 混合模式。"""

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="dev_modes",
        verbose_name="所属工作区",
    )
    name = models.CharField(max_length=255, verbose_name="名称")
    description = models.TextField(blank=True, default="", verbose_name="描述")
    # 与 IssueType.logo_props 同形状：{"in_use": "icon", "icon": {name, color, background_color}}
    icon_props = models.JSONField(default=dict, blank=True, verbose_name="图标配置")
    # 九个布尔 key，形状由 seed_data.dev_modes.normalize_features 收敛
    features = models.JSONField(default=dict, blank=True, verbose_name="组件开关")
    is_system = models.BooleanField(default=False, verbose_name="是否预置")

    class Meta:
        db_table = "dev_modes"
        ordering = ("created_at", "id")
        verbose_name = "Dev Mode"
        verbose_name_plural = "Dev Modes"
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="dev_mode_unique_workspace_name_active",
            ),
        ]

    def save(self, *args, **kwargs):
        # 九个 key 恒定齐全：读侧（前端 chip、批次 3 的项目开关取交集）就不用到处兜底
        self.features = normalize_features(self.features)
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 只硬删，同 StageType.delete：软删级联任务把 RESTRICT 当 CASCADE 处理，
        # 软删一个模式会顺手把它的阶段、勾选连同（批次 3 之后）引用它的项目一起软删。
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return self.name


class DevModeStage(BaseModel):
    """模式里的一个阶段，由阶段类型实例化而来。

    同一模式里允许两个阶段指向同一个类型（o-1、o-2 都是 O阶段类型），所以唯一的是
    ``(dev_mode, name)`` 而不是 ``(dev_mode, stage_type)``。

    ``code`` 不落库：它恒等于 ``stage_type.code``，冗余一份只会在类型改码时产生两个
    事实来源。serializer 从 ``stage_type`` 带出。
    """

    dev_mode = models.ForeignKey(
        DevMode,
        on_delete=models.CASCADE,
        related_name="stages",
        verbose_name="所属研发模式",
    )
    stage_type = models.ForeignKey(
        "db.StageType",
        # RESTRICT：被模式引用的阶段类型不许删（views/stage_type.py 里还会提前挡一道，
        # 好给用户一个可读的 409 而不是数据库异常）
        on_delete=models.RESTRICT,
        related_name="dev_mode_stages",
        verbose_name="阶段类型",
    )
    # 冗余一列方便「这个工作区的全部模式阶段」这类查询不必 join 两层
    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="dev_mode_stages",
        verbose_name="所属工作区",
    )
    name = models.CharField(max_length=255, verbose_name="阶段名称")
    # 本期只存不算，没有消费方；后续里程碑 / 项目进度才用
    workload_ratio = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="工作量占比（%）",
    )
    standard_days = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="标准周期（天）"
    )
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "dev_mode_stages"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Dev Mode Stage"
        verbose_name_plural = "Dev Mode Stages"
        constraints = [
            models.UniqueConstraint(
                fields=["dev_mode", "name"],
                condition=Q(deleted_at__isnull=True),
                name="dev_mode_stage_unique_mode_name_active",
            ),
        ]

    def clean(self):
        # 阶段类型必须与模式同工作区。跨工作区引用会让模式里冒出别家的评审树。
        if self.stage_type_id and self.dev_mode_id:
            if self.stage_type.workspace_id != self.dev_mode.workspace_id:
                raise ValidationError(
                    {"stage_type": "阶段类型必须与研发模式属于同一个工作区。"}
                )

    def save(self, *args, **kwargs):
        # workspace 是 dev_mode 的从属信息，不接受调用方乱传
        if self.dev_mode_id and not self.workspace_id:
            self.workspace_id = self.dev_mode.workspace_id
        # 同 StageType.save：追加到末尾。显式给了 sort_order（拖拽中点 / 种子）就尊重它。
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            last = DevModeStage.objects.filter(dev_mode_id=self.dev_mode_id).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 只硬删，理由同 DevMode.delete
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.dev_mode_id} - {self.name}"


class DevModeStageTemplate(BaseModel):
    """阶段勾选的一个评审节点。

    只存引用，不复制评审树：评审树改了标题，模式里立刻看到新名字。反过来，评审树删了
    节点，这里的引用要跟着消失 —— 走的是 ``views/stage_review/template.py`` 删除时的
    同步硬删，不能依赖异步软删级联（那会让模式里短暂看到已删节点）。
    """

    dev_mode_stage = models.ForeignKey(
        DevModeStage,
        on_delete=models.CASCADE,
        related_name="template_links",
        verbose_name="所属阶段",
    )
    template = models.ForeignKey(
        "db.StageReviewTemplate",
        on_delete=models.CASCADE,
        related_name="dev_mode_stage_links",
        verbose_name="评审模板节点",
    )

    class Meta:
        db_table = "dev_mode_stage_templates"
        ordering = ("created_at", "id")
        verbose_name = "Dev Mode Stage Template"
        verbose_name_plural = "Dev Mode Stage Templates"
        constraints = [
            models.UniqueConstraint(
                fields=["dev_mode_stage", "template"],
                condition=Q(deleted_at__isnull=True),
                name="dev_mode_stage_template_unique_active",
            ),
        ]

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 勾选是纯连接行，没有保留软删痕迹的价值；硬删还能让唯一约束立刻放行重新勾选
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.dev_mode_stage_id} - {self.template_id}"
