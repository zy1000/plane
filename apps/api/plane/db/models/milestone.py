from django.db import models
from django.utils import timezone

from plane.db.models import BaseModel, Project


class Milestone(BaseModel):
    class State(models.TextChoices):
        NOT_STARTED = '未开始', 'gray'
        IN_PROGRESS = '进行中', 'blue'
        DELAYED = '延期', 'yellow'
        COMPLETED = '已完成', 'green'

    STATE_COLOR_MAP = {
        State.NOT_STARTED: 'gray',
        State.IN_PROGRESS: 'blue',
        State.DELAYED: 'yellow',
        State.COMPLETED: 'green',
    }

    name = models.CharField(max_length=100, verbose_name="TestCaseRepository Name")
    description = models.TextField(verbose_name="TestCaseRepository Description", blank=True)
    start_date = models.DateField(verbose_name="Start Date", blank=True, null=True)
    end_date = models.DateField(verbose_name="End Date", blank=True, null=True)
    state = models.CharField(choices=State.choices, default=State.NOT_STARTED, verbose_name="Milestone State")

    issues = models.ManyToManyField('db.Issue', related_name="milestones", blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_%(class)s")

    from django.utils import timezone
    from django.db import transaction

    def update_state(self, save=True):
        """
        根据 start_date 和 end_date 自动更新里程碑状态，尊重已完成状态的不可逆性。

        Args:
            save (bool): 是否在状态变更后自动保存模型实例。默认为 True。
        """
        if self.state == self.State.COMPLETED:
            # 已完成状态不可逆，不自动更改
            return

        today = timezone.now().date()

        # 情况1: 已设置结束日期且已过期 → 延期
        if self.end_date and self.end_date < today:
            new_state = self.State.DELAYED

        # 情况2: 设置了开始日期且尚未开始 → 未开始
        elif self.start_date and self.start_date > today:
            new_state = self.State.NOT_STARTED
        elif (self.end_date and self.end_date > today) or (self.start_date and self.start_date < today):
            new_state = self.State.IN_PROGRESS
        # 其他情况（在开始之后、结束之前，或无明确时间）→ 进行中
        else:
            new_state = self.state

        # 只有状态发生变化时才更新并保存
        if new_state != self.state:
            self.state = new_state
            if save:
                # 使用 update_field 避免触发其他字段的更新或信号开销
                self.save(update_fields=["state", "updated_at"])

    class Meta:
        verbose_name = "Milestone"
        verbose_name_plural = "Milestone"
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_milestone_name_per_project_when_active",
            )
        ]
        db_table = "milestone"
        ordering = ("-created_at",)
