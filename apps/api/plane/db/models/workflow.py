# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

# Module imports
from .base import BaseModel
from .project import ProjectBaseModel


class ApprovalType(models.TextChoices):
    ANY = "any", "任一人通过"
    ALL = "all", "全部通过"
    N_OF_M = "n_of_m", "至少 N 人通过"


class WorkflowApproverTarget(models.TextChoices):
    ASSIGNEES = "assignees", "工作项负责人"
    CREATED_BY = "created_by", "工作项创建人"


class Workflow(ProjectBaseModel):
    """
    某个项目下、某个工作项类型的状态流转工作流。
    每个 project + issue_type 同一时间只允许存在一个激活中的工作流。
    """

    issue_type = models.ForeignKey(
        "db.IssueType",
        on_delete=models.CASCADE,
        related_name="workflows",
        verbose_name="工作项类型",
    )
    name = models.CharField(max_length=255, verbose_name="工作流名称")
    description = models.TextField(blank=True, verbose_name="工作流描述")
    is_active = models.BooleanField(default=False, verbose_name="是否激活")

    class Meta:
        verbose_name = "Workflow"
        verbose_name_plural = "Workflows"
        db_table = "workflows"
        ordering = ("-created_at",)
        # project + issue_type 下最多只允许一条激活的工作流
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type"],
                condition=Q(is_active=True, deleted_at__isnull=True),
                name="workflow_unique_active_per_project_issue_type",
            ),
        ]

    def __str__(self):
        return f"{self.name} <{self.project.name} / {self.issue_type.name}>"

    def clean(self):
        super().clean()
        # issue_type 必须属于当前项目
        if self.issue_type_id and str(self.issue_type.project_id) != str(self.project_id):
            raise ValidationError(
                {
                    "issue_type": "该工作项类型不属于当前项目，无法为其创建工作流。"
                }
            )

    def save(self, *args, **kwargs):
        if self.project_id and not self.workspace_id:
            self.workspace_id = self.project.workspace_id
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class WorkflowTransition(ProjectBaseModel):
    """
    工作流中的一条状态流转边：from_state → to_state。
    from_state 为 None 时表示"初始流转"，即该状态可作为初始状态直接设置。
    两端状态必须都属于 workflow.issue_type 的状态集合。
    """

    workflow = models.ForeignKey(
        Workflow,
        on_delete=models.CASCADE,
        related_name="transitions",
        verbose_name="所属工作流",
    )
    from_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="outgoing_transitions",
        verbose_name="起始状态（为空表示初始流转）",
    )
    to_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        related_name="incoming_transitions",
        verbose_name="目标状态",
    )
    # 审批策略：无审批人时这几个字段不生效
    # - any：任意一人通过即可
    # - all：所有配置的审批人全部通过
    # - n_of_m：至少 required_count 人通过（required_count 必填）
    approval_type = models.CharField(
        max_length=10,
        choices=ApprovalType.choices,
        default=ApprovalType.ANY,
        verbose_name="审批通过规则",
    )
    # 仅 n_of_m 模式时必填，表示至少需要多少人通过
    required_count = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name="最少通过人数（仅 n_of_m 模式生效）",
    )
    dynamic_approver_types = models.JSONField(
        blank=True,
        default=list,
        verbose_name="动态审批人类型",
    )

    class Meta:
        verbose_name = "Workflow Transition"
        verbose_name_plural = "Workflow Transitions"
        db_table = "workflow_transitions"
        ordering = ("workflow", "from_state")
        constraints = [
            models.UniqueConstraint(
                fields=["workflow", "from_state", "to_state"],
                condition=Q(deleted_at__isnull=True),
                name="workflow_transition_unique_when_not_deleted",
            ),
            # n_of_m 模式下 required_count 必须填写
            models.CheckConstraint(
                check=~Q(approval_type=ApprovalType.N_OF_M) | Q(required_count__isnull=False),
                name="workflow_transition_required_count_set_when_n_of_m",
            ),
            # 非 n_of_m 模式下 required_count 必须为空
            models.CheckConstraint(
                check=Q(approval_type=ApprovalType.N_OF_M) | Q(required_count__isnull=True),
                name="workflow_transition_required_count_null_when_not_n_of_m",
            ),
        ]

    def __str__(self):
        from_name = self.from_state.name if self.from_state_id else "（初始）"
        return f"{from_name} → {self.to_state.name} [{self.workflow.name}]"

    def clean(self):
        super().clean()
        issue_type = self.workflow.issue_type
        dynamic_approver_types = self.dynamic_approver_types or []

        # to_state 必须属于 workflow.issue_type
        if self.to_state_id and self.to_state.issue_type_id != issue_type.pk:
            raise ValidationError(
                {
                    "to_state": (
                        f"目标状态 '{self.to_state.name}' 不属于工作项类型 "
                        f"'{issue_type.name}'，不能用于该工作流。"
                    )
                }
            )

        # from_state 若指定，也必须属于 workflow.issue_type
        if self.from_state_id and self.from_state.issue_type_id != issue_type.pk:
            raise ValidationError(
                {
                    "from_state": (
                        f"起始状态 '{self.from_state.name}' 不属于工作项类型 "
                        f"'{issue_type.name}'，不能用于该工作流。"
                    )
                }
            )

        # from_state 与 to_state 不能是同一个状态
        if self.from_state_id and self.from_state_id == self.to_state_id:
            raise ValidationError("起始状态与目标状态不能相同。")

        # 两端状态必须属于当前项目
        if self.to_state_id and self.to_state.project_id != self.project_id:
            raise ValidationError({"to_state": "目标状态不属于当前项目。"})

        if self.from_state_id and self.from_state.project_id != self.project_id:
            raise ValidationError({"from_state": "起始状态不属于当前项目。"})

        if not isinstance(dynamic_approver_types, list):
            raise ValidationError({"dynamic_approver_types": "动态审批人必须是列表。"})

        invalid_targets = [
            approver_target
            for approver_target in dynamic_approver_types
            if approver_target not in WorkflowApproverTarget.values
        ]
        if invalid_targets:
            raise ValidationError(
                {
                    "dynamic_approver_types": (
                        "存在不支持的动态审批人类型："
                        + ", ".join(invalid_targets)
                    )
                }
            )

        normalized_targets = []
        for approver_target in dynamic_approver_types:
            if approver_target not in normalized_targets:
                normalized_targets.append(approver_target)
        self.dynamic_approver_types = normalized_targets

    def save(self, *args, **kwargs):
        # 保持 project 与 workflow.project 一致
        if self.workflow_id and not self.project_id:
            self.project = self.workflow.project
        if self.project_id and not self.workspace_id:
            self.workspace_id = self.project.workspace_id
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class WorkflowTransitionApproval(BaseModel):
    """
    工作流流转边上的审批人配置，每条记录代表一个审批人。
    审批策略（approval_type / allow_self_approve / required_count）定义在 WorkflowTransition 上。
    审批人必须是该流转边所属项目的成员。
    始终通过 transition 访问，无需独立的 project/workspace 冗余字段。
    启用/停用审批人配置请使用软删除（deleted_at）。
    """

    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.CASCADE,
        related_name="approvals",
        verbose_name="所属流转边",
    )
    approver = models.ForeignKey(
        "db.User",
        on_delete=models.CASCADE,
        related_name="workflow_approvals",
        verbose_name="审批人",
    )

    class Meta:
        verbose_name = "Workflow Transition Approval"
        verbose_name_plural = "Workflow Transition Approvals"
        db_table = "workflow_transition_approvals"
        ordering = ("transition", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["transition", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="workflow_approval_unique_transition_approver_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.approver} → {self.transition}"

    def clean(self):
        super().clean()
        from .project import ProjectMember

        # 审批人必须是该流转边所属项目的成员
        if self.approver_id and self.transition_id:
            project = self.transition.workflow.project
            if not ProjectMember.objects.filter(
                    project=project,
                    member=self.approver,
                    is_active=True,
            ).exists():
                raise ValidationError(
                    {"approver": f"用户 '{self.approver}' 不是当前项目的成员，无法设为审批人。"}
                )

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class TransitionRecordStatus(models.TextChoices):
    PENDING = "pending", "待审批"
    APPROVED = "approved", "已通过"
    REJECTED = "rejected", "已拒绝"
    CANCELLED = "cancelled", "已取消"


class IssueTransitionRecord(ProjectBaseModel):
    """
    Issue 发起一次状态流转时产生的申请记录。
    若该 transition 无审批人，status 直接置为 approved，状态立即落库。
    若有审批人，status 初始为 pending，等待所有必要审批完成后再落状态。
    from_state / to_state 任一被删除时，本记录及其子审批记录一并级联删除，
    因为状态不存在后流转记录已无实际意义。
    """

    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="transition_records",
        verbose_name="工单",
    )
    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.SET_NULL,
        null=True,
        related_name="issue_transition_records",
        verbose_name="触发的流转边",
    )
    # from_state 为 null 时表示工单首次设置状态（无起始状态）
    from_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="transition_records_as_source",
        verbose_name="起始状态",
    )
    to_state = models.ForeignKey(
        "db.State",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="transition_records_as_target",
        verbose_name="目标状态",
    )
    status = models.CharField(
        max_length=20,
        choices=TransitionRecordStatus.choices,
        default=TransitionRecordStatus.PENDING,
        verbose_name="审批状态",
        db_index=True,
    )
    # 审批全部通过、实际落库状态变更的时间
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="完成时间")

    class Meta:
        verbose_name = "Issue Transition Record"
        verbose_name_plural = "Issue Transition Records"
        db_table = "issue_transition_records"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["issue", "status"],
                name="idx_issue_trans_status",
            ),
        ]

    def __str__(self):
        return f"Issue({self.issue_id}) {self.from_state} → {self.to_state} [{self.status}]"


class ApprovalAction(models.TextChoices):
    APPROVED = "approved", "通过"
    REJECTED = "rejected", "拒绝"


class IssueTransitionApprovalRecord(BaseModel):
    """
    某次 IssueTransitionRecord 中，单个审批人的操作记录。
    每个有资格审批的成员对应一条记录，初始 action 为 None（待操作）。
    始终通过 transition_record 访问，无需独立的 project/workspace 冗余字段。
    """

    transition_record = models.ForeignKey(
        IssueTransitionRecord,
        on_delete=models.CASCADE,
        related_name="approval_records",
        verbose_name="所属流转申请",
    )
    approver = models.ForeignKey(
        "db.User",
        on_delete=models.CASCADE,
        related_name="issue_approval_records",
        verbose_name="审批人",
    )
    action = models.CharField(
        max_length=20,
        choices=ApprovalAction.choices,
        null=True,
        blank=True,
        verbose_name="审批操作（null 表示尚未操作）",
    )
    comment = models.TextField(blank=True, null=True, verbose_name="审批意见")

    class Meta:
        verbose_name = "Issue Transition Approval Record"
        verbose_name_plural = "Issue Transition Approval Records"
        db_table = "issue_transition_approval_records"
        ordering = ("transition_record", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["transition_record", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="issue_approval_record_unique_record_approver_when_not_deleted",
            )
        ]

    def __str__(self):
        action_label = self.action or "待审批"
        return f"{self.approver} [{action_label}] on {self.transition_record_id}"
