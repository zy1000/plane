"""项目阶段：项目自己的一份阶段列表，替代原来的里程碑模块（PMS-101）。

项目创建时从所选研发模式（``Project.dev_mode``）的阶段拷一份出来（``source_stage`` 记来处），
之后项目内可以增删改、加子阶段 —— 模式里改阶段名、调顺序**不再**传播到项目，这是拷贝语义，
与批次 4 之前评审直接挂模式阶段行的做法不同。

「里程碑」不再是独立实体，而是阶段上的一个 ``is_milestone`` 标记（照禅道）。

几条贯穿模型与 ``utils/project_stage.py`` 的规则：

- **占比只算叶子。** 有子阶段的阶段自己不能填占比，它的占比 = 子之和（算出来不存）；
  全项目叶子累计 ≤ 100。父第一次挂子时，父原有的占比下移给这个子。
- **子阶段日期必须落在父阶段范围内**，两边都校验（改父日期时子越界要报错）。
- **状态四态直接改**（``ProjectStageStatus``），不做 advance / rollback 动作；切到进行中补
  实际开始、切到已完成补实际完成、退回未开始清实际日期。「已延期」不落库，是
  ``end_date < 今天 且 status != completed`` 的派生显示。
- **只硬删。** 理由同 ``DevModeStage``：异步软删级联把 RESTRICT 当 CASCADE，软删父阶段会
  异步把子阶段一并软删掉，违反「有子不能删」；软删行还会占住 ``stage_type`` 的引用。
  ``parent`` 用 RESTRICT 而不是 PROTECT：项目硬删任务级联收阶段时，RESTRICT 允许被引用方
  在同一次级联里被删，PROTECT 会把整个项目硬删炸掉。

第一期评审实例（``StageReview.stage``）与裁剪格子仍挂在模式阶段上，第二期换挂到本表时
靠 ``source_stage`` 做对应。
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from .dev_mode import DEFAULT_SORT_ORDER, SORT_ORDER_STEP
from .project import ProjectBaseModel


class ProjectStageStatus(models.TextChoices):
    NOT_STARTED = "not_started", "未开始"
    IN_PROGRESS = "in_progress", "进行中"
    PAUSED = "paused", "已暂停"
    COMPLETED = "completed", "已完成"


class ProjectStage(ProjectBaseModel):
    stage_type = models.ForeignKey(
        "db.StageType",
        # 被项目阶段引用的阶段类型不许删，views/stage_type.py 会提前挡一道给可读的 409
        on_delete=models.RESTRICT,
        related_name="project_stages",
        verbose_name="阶段类型",
    )
    name = models.CharField(max_length=255, verbose_name="阶段名称")
    description = models.TextField(blank=True, default="", verbose_name="描述")
    is_milestone = models.BooleanField(default=False, verbose_name="是否里程碑")
    parent = models.ForeignKey(
        "self",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="父阶段",
    )
    workload_ratio = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="工作量占比（%）",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_project_stages",
        verbose_name="负责人",
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="计划开始")
    end_date = models.DateField(null=True, blank=True, verbose_name="计划结束")
    actual_start = models.DateField(null=True, blank=True, verbose_name="实际开始")
    actual_end = models.DateField(null=True, blank=True, verbose_name="实际完成")
    status = models.CharField(
        max_length=20,
        choices=ProjectStageStatus.choices,
        default=ProjectStageStatus.NOT_STARTED,
        db_index=True,
        verbose_name="状态",
    )
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    source_stage = models.ForeignKey(
        "db.DevModeStage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="project_stages",
        verbose_name="来源模式阶段",
    )

    class Meta:
        db_table = "project_stages"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Project Stage"
        verbose_name_plural = "Project Stages"
        indexes = [
            models.Index(fields=["project", "parent"], name="ps_project_parent"),
            models.Index(fields=["project", "source_stage"], name="ps_project_source"),
        ]

    @property
    def is_delayed(self):
        """计划结束已过且还没完成。派生显示，不落库。"""
        from django.utils import timezone

        return (
            self.end_date is not None
            and self.status != ProjectStageStatus.COMPLETED
            and self.end_date < timezone.localdate()
        )

    def clean(self):
        errors = {}
        if self.stage_type_id and self.project_id:
            if self.stage_type.workspace_id != self.project.workspace_id:
                errors["stage_type"] = "阶段类型必须与项目属于同一个工作区。"
        if self.parent_id:
            if self.parent_id == self.id:
                errors["parent"] = "阶段不能以自己为父阶段。"
            elif self.parent.project_id != self.project_id:
                errors["parent"] = "父阶段必须属于同一个项目。"
        if self.start_date and self.end_date and self.end_date < self.start_date:
            errors["end_date"] = "计划结束不能早于计划开始。"
        if self.actual_start and self.actual_end and self.actual_end < self.actual_start:
            errors["actual_end"] = "实际完成不能早于实际开始。"
        if self.workload_ratio is not None and (
            self.workload_ratio < 0 or self.workload_ratio > 100
        ):
            errors["workload_ratio"] = "工作量占比必须在 0 到 100 之间。"
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        # 追加到项目末尾。显式给了 sort_order（从模式拷贝 / 回填）就尊重它。
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER and self.project_id:
            last = ProjectStage.objects.filter(project_id=self.project_id).aggregate(
                largest=models.Max("sort_order")
            )["largest"]
            if last is not None:
                self.sort_order = last + SORT_ORDER_STEP
        super().save(*args, **kwargs)

    def delete(self, using=None, soft=False, *args, **kwargs):
        # 只硬删，见模块头注
        return super().delete(using=using, soft=False, *args, **kwargs)

    def __str__(self):
        return f"{self.project_id} - {self.name}"
