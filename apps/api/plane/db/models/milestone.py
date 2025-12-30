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

    def update_state(self):
        """
        根据时间自动更新 state
        """
        today = timezone.now().date()
        if self.end_date < today and self.state != self.State.COMPLETED.value:
            self.state = self.State.DELAYED
        elif self.start_date > today and self.state != self.State.COMPLETED.value:
            self.state = self.State.NOT_STARTED
        else:
            self.state = self.State.IN_PROGRESS
        self.save()

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
