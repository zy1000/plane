"""项目风险（自研模块）。

风险是项目的子菜单，与工作项 / 发布 / 迭代平级：登记「可能影响进度、成本、质量的
不确定因素」，分配责任人持续跟踪；与缺陷（类别为「缺陷」的工作项）多对多。

- 编号 ``code``：``PRS`` + 北京时间年月（YYMM）+ 当月流水号（三位起，溢出自然变四位），
  **工作区内**共用一个计数、每月从 001 重置。由 ``utils/risk.py::allocate_risk_code``
  在 advisory 锁下分配；删掉的编号不复用，所以唯一约束不带 ``deleted_at`` 条件。
- 风险等级 ``risk_level`` 按影响程度 × 发生概率（各 1–5）推算：乘积 ≥ 12 为高、6–10 为中、
  ≤ 5 为低，规则只写在 ``utils/risk.py::compute_risk_level`` 一处。之后可以手动改（不动影响
  程度 / 发生概率），再改这两项时重新推算并覆盖手动值；与推算值不同即「手动调整」，不另存标记。
- 富文本只存 ``*_html`` 一列，口径同阶段评审（见 ``stage_review.py`` 的注释）。
- 附件 → ``self.assets``（entity_type=RISK_FILE 的 FileAsset，两步预签名上传）；
  评论 → ``self.comments``；变更历史 → ``self.activities``，三者都不占本表的列。
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from plane.utils.html_processor import strip_tags

from .project import ProjectBaseModel


class RiskStatus(models.TextChoices):
    DRAFT = "draft", "草稿"
    PENDING_ASSESSMENT = "pending_assessment", "待评估"
    TRACKING = "tracking", "持续跟踪"
    CONVERTED = "converted", "已转问题"
    NOT_OCCURRED = "not_occurred", "未发生"


class RiskCategory(models.TextChoices):
    SCHEDULE = "schedule", "进度"
    COST = "cost", "成本"
    QUALITY = "quality", "质量"
    RESOURCE = "resource", "资源"
    SOFTWARE_DESIGN = "software_design", "软件设计"
    HARDWARE_SOLUTION = "hardware_solution", "硬件方案"
    STRUCTURE_SOLUTION = "structure_solution", "结构方案"
    MATERIAL = "material", "物料"
    RELIABILITY = "reliability", "可靠性"
    DFM = "dfm", "DFM"
    DEFECT = "defect", "缺陷"


class RiskScale(models.IntegerChoices):
    """影响程度 / 发生概率共用的五档。存数字是因为等级就是两者相乘。"""

    VERY_LOW = 1, "很低"
    LOW = 2, "低"
    MEDIUM = 3, "中"
    HIGH = 4, "高"
    VERY_HIGH = 5, "很高"


class RiskLevel(models.TextChoices):
    HIGH = "high", "高"
    MEDIUM = "medium", "中"
    LOW = "low", "低"


class RiskStrategy(models.TextChoices):
    AVOID = "avoid", "规避"
    TRANSFER = "transfer", "转移"
    MITIGATE = "mitigate", "减轻"
    ACCEPT = "accept", "接受"


class Risk(ProjectBaseModel):
    code = models.CharField(max_length=20, db_index=True, verbose_name="编号")
    name = models.CharField(max_length=255, verbose_name="名称")
    status = models.CharField(
        max_length=30,
        choices=RiskStatus.choices,
        default=RiskStatus.DRAFT,
        db_index=True,
        verbose_name="状态",
    )
    category = models.CharField(
        max_length=30,
        choices=RiskCategory.choices,
        blank=True,
        default="",
        verbose_name="风险类别",
    )
    description_html = models.TextField(blank=True, default="", verbose_name="描述")
    impact_description_html = models.TextField(
        blank=True, default="", verbose_name="影响描述"
    )
    response_measures_html = models.TextField(
        blank=True, default="", verbose_name="应对措施"
    )
    impact_level = models.PositiveSmallIntegerField(
        choices=RiskScale.choices, verbose_name="影响程度"
    )
    probability = models.PositiveSmallIntegerField(
        choices=RiskScale.choices, verbose_name="发生概率"
    )
    risk_level = models.CharField(
        max_length=10, choices=RiskLevel.choices, db_index=True, verbose_name="风险等级"
    )
    risk_loss = models.CharField(
        max_length=255, blank=True, default="", verbose_name="风险损失"
    )
    trigger_factors = models.CharField(
        max_length=255, blank=True, default="", verbose_name="触发因素"
    )
    strategy = models.CharField(
        max_length=20,
        choices=RiskStrategy.choices,
        blank=True,
        default="",
        verbose_name="风险管理策略",
    )
    # 可空：没有表态就是没表态，不替用户默认成「否」
    is_in_risk_production = models.BooleanField(
        null=True, blank=True, verbose_name="是否列入风险生产/送样"
    )
    proposer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="proposed_risks",
        verbose_name="提出人",
    )
    proposed_date = models.DateField(verbose_name="提出时间")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_risks",
        verbose_name="责任人",
    )
    stakeholders = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="stakeholder_risks",
        db_table="risk_stakeholders",
        verbose_name="相关干系人",
    )
    planned_handle_date = models.DateField(
        null=True, blank=True, verbose_name="计划处理日期"
    )
    actual_close_date = models.DateField(
        null=True, blank=True, verbose_name="实际关闭日期"
    )

    class Meta:
        db_table = "risks"
        ordering = ("-created_at",)
        verbose_name = "Risk"
        verbose_name_plural = "Risks"
        indexes = [
            models.Index(fields=["project", "status"], name="risk_project_status"),
            models.Index(fields=["project", "risk_level"], name="risk_project_level"),
        ]
        constraints = [
            # 故意不带 deleted_at 条件：编号一经分配就不复用，软删的也占着号
            models.UniqueConstraint(
                fields=["workspace", "code"], name="risk_unique_workspace_code"
            ),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"


class RiskIssue(ProjectBaseModel):
    """风险 ↔ 缺陷。显式关联表，可软删、可记 created_by，口径同 ``ReleaseIssue``。

    「只能挂缺陷、且与风险同项目」是跨表规则，由写入口（``utils/risk.py``）校验。
    """

    risk = models.ForeignKey(
        "db.Risk", on_delete=models.CASCADE, related_name="risk_issues"
    )
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="issue_risks"
    )

    class Meta:
        db_table = "risk_issues"
        ordering = ("-created_at",)
        verbose_name = "Risk Issue"
        verbose_name_plural = "Risk Issues"
        constraints = [
            models.UniqueConstraint(
                fields=["risk", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="risk_issue_unique_active",
            ),
        ]

    def __str__(self):
        return f"{self.risk_id} {self.issue_id}"


class RiskComment(ProjectBaseModel):
    """风险下的评论。结构对齐 ``StageReviewComment``。

    评论里的内联图片是 ``RISK_COMMENT_DESCRIPTION`` 资产，定位路径时走评论所属的风险，
    避免评论还没落库时定不出路径。
    """

    risk = models.ForeignKey(
        "db.Risk", on_delete=models.CASCADE, related_name="comments", verbose_name="所属风险"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="risk_comments",
        null=True,
        verbose_name="评论人",
    )
    comment_html = models.TextField(blank=True, default="<p></p>")
    comment_json = models.JSONField(blank=True, default=dict)
    comment_stripped = models.TextField(blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="父评论",
    )
    edited_at = models.DateTimeField(null=True, blank=True, verbose_name="编辑时间")

    class Meta:
        db_table = "risk_comments"
        ordering = ("-created_at",)
        verbose_name = "Risk Comment"
        verbose_name_plural = "Risk Comments"
        indexes = [
            models.Index(fields=["risk", "-created_at"], name="rc_risk_created"),
        ]

    def save(self, *args, **kwargs):
        self.comment_stripped = (
            strip_tags(self.comment_html) if self.comment_html else ""
        )
        if not self.project_id and self.risk_id:
            self.project_id = self.risk.project_id
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.risk_id} {self.actor_id}"


class RiskActivity(ProjectBaseModel):
    """风险的变更历史。字段形状对齐 ``StageReviewActivity``，**同步写入**。"""

    risk = models.ForeignKey(
        "db.Risk",
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name="所属风险",
    )
    verb = models.CharField(max_length=255, default="created", verbose_name="动作")
    field = models.CharField(
        max_length=255, blank=True, null=True, verbose_name="字段名"
    )
    old_value = models.TextField(blank=True, null=True, verbose_name="旧值")
    new_value = models.TextField(blank=True, null=True, verbose_name="新值")
    comment = models.TextField(blank=True, default="", verbose_name="说明")
    risk_comment = models.ForeignKey(
        RiskComment,
        on_delete=models.SET_NULL,
        related_name="comment_activities",
        null=True,
        blank=True,
        verbose_name="关联评论",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="risk_activities",
        verbose_name="操作人",
    )
    old_identifier = models.UUIDField(null=True)
    new_identifier = models.UUIDField(null=True)
    epoch = models.FloatField(null=True)
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "risk_activities"
        ordering = ("created_at",)
        verbose_name = "Risk Activity"
        verbose_name_plural = "Risk Activities"
        indexes = [
            models.Index(fields=["risk", "created_at"], name="ract_risk_created"),
        ]

    def __str__(self):
        return f"{self.risk_id} {self.field} {self.verb}"
