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


class WorkflowPrincipalDimension(models.TextChoices):
    INITIATOR = "initiator", "发起人"
    ASSIGNEE = "assignee", "目标负责人"
    APPROVER = "approver", "审批人"


class WorkflowPrincipalKind(models.TextChoices):
    MEMBER = "member", "指定成员"
    ROLE = "role", "项目角色"
    DYNAMIC = "dynamic", "动态对象"


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
        if self.issue_type_id and str(self.issue_type.project_id) != str(
            self.project_id
        ):
            raise ValidationError(
                {"issue_type": "该工作项类型不属于当前项目，无法为其创建工作流。"}
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
                check=~Q(approval_type=ApprovalType.N_OF_M)
                | Q(required_count__isnull=False),
                name="workflow_transition_required_count_set_when_n_of_m",
            ),
            # 非 n_of_m 模式下 required_count 必须为空
            models.CheckConstraint(
                check=Q(approval_type=ApprovalType.N_OF_M)
                | Q(required_count__isnull=True),
                name="workflow_transition_required_count_null_when_not_n_of_m",
            ),
        ]

    def __str__(self):
        from_name = self.from_state.name if self.from_state_id else "（初始）"
        return f"{from_name} → {self.to_state.name} [{self.workflow.name}]"

    def clean(self):
        super().clean()
        issue_type = self.workflow.issue_type

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

    def save(self, *args, **kwargs):
        # 保持 project 与 workflow.project 一致
        if self.workflow_id and not self.project_id:
            self.project = self.workflow.project
        if self.project_id and not self.workspace_id:
            self.workspace_id = self.project.workspace_id
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class WorkflowTransitionPrincipal(BaseModel):
    """
    工作流流转边上"被选中的对象"，统一承载发起人 / 目标负责人 / 审批人三个维度。
    - dimension 区分维度（initiator / assignee / approver）。
    - kind 区分对象类型（member 指定成员 / role 项目角色 / dynamic 动态对象），
      并与 member / role / dynamic_target 三列严格一一对应（恰好一列有值）。
    项目作用域经 transition 间接获得，无需独立的 project/workspace 冗余字段。
    启用/停用配置请使用软删除（deleted_at）。
    """

    transition = models.ForeignKey(
        WorkflowTransition,
        on_delete=models.CASCADE,
        related_name="principals",
        verbose_name="所属流转边",
    )
    dimension = models.CharField(
        max_length=10,
        choices=WorkflowPrincipalDimension.choices,
        verbose_name="维度",
    )
    kind = models.CharField(
        max_length=10,
        choices=WorkflowPrincipalKind.choices,
        verbose_name="对象类型",
    )
    member = models.ForeignKey(
        "db.User",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_transition_principals",
        verbose_name="指定成员",
    )
    role = models.ForeignKey(
        "db.ProjectRole",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="workflow_transition_principals",
        verbose_name="项目角色",
    )
    dynamic_target = models.CharField(
        max_length=20,
        choices=WorkflowApproverTarget.choices,
        null=True,
        blank=True,
        verbose_name="动态对象",
    )

    class Meta:
        verbose_name = "Workflow Transition Principal"
        verbose_name_plural = "Workflow Transition Principals"
        db_table = "workflow_transition_principals"
        ordering = ("transition", "dimension", "created_at")
        constraints = [
            # kind 与三列严格一致（恰好一列有值）
            models.CheckConstraint(
                check=(
                    Q(kind="member", member__isnull=False, role__isnull=True, dynamic_target__isnull=True)
                    | Q(kind="role", member__isnull=True, role__isnull=False, dynamic_target__isnull=True)
                    | Q(kind="dynamic", member__isnull=True, role__isnull=True, dynamic_target__isnull=False)
                ),
                name="wf_principal_kind_coherent",
            ),
            # 唯一性按 (transition, dimension, <对象>) 范围，避免同维度重复选同一对象
            models.UniqueConstraint(
                fields=["transition", "dimension", "member"],
                condition=Q(member__isnull=False, deleted_at__isnull=True),
                name="wf_principal_uniq_member",
            ),
            models.UniqueConstraint(
                fields=["transition", "dimension", "role"],
                condition=Q(role__isnull=False, deleted_at__isnull=True),
                name="wf_principal_uniq_role",
            ),
            models.UniqueConstraint(
                fields=["transition", "dimension", "dynamic_target"],
                condition=Q(dynamic_target__isnull=False, deleted_at__isnull=True),
                name="wf_principal_uniq_dynamic",
            ),
        ]

    def __str__(self):
        target = self.member_id or self.role_id or self.dynamic_target
        return f"[{self.dimension}/{self.kind}] {target} → {self.transition}"

    def clean(self):
        super().clean()
        from .project import ProjectMember

        # 1) kind 与三列一致性兜底（数据库 CheckConstraint 的应用层镜像）
        populated = {
            WorkflowPrincipalKind.MEMBER: self.member_id is not None,
            WorkflowPrincipalKind.ROLE: self.role_id is not None,
            WorkflowPrincipalKind.DYNAMIC: bool(self.dynamic_target),
        }
        if sum(1 for is_set in populated.values() if is_set) != 1:
            raise ValidationError(
                "成员 / 角色 / 动态对象三者必须且只能填写其中一项。"
            )
        if not populated.get(self.kind):
            raise ValidationError({"kind": "kind 与所填写的对象列不一致。"})

        # 2) member 必须是 transition.workflow.project 在职成员
        if (
            self.kind == WorkflowPrincipalKind.MEMBER
            and self.member_id
            and self.transition_id
        ):
            project = self.transition.workflow.project
            if not ProjectMember.objects.filter(
                project=project,
                member=self.member,
                is_active=True,
            ).exists():
                raise ValidationError(
                    {
                        "member": f"用户 '{self.member}' 不是当前项目的成员，无法设为流转对象。"
                    }
                )

        # 3) role 必须属于该流转边所在项目
        if (
            self.kind == WorkflowPrincipalKind.ROLE
            and self.role_id
            and self.transition_id
        ):
            if str(self.role.project_id) != str(self.transition.project_id):
                raise ValidationError({"role": "该角色不属于当前项目。"})

        # 4) dynamic_target 必须是受支持的动态对象类型
        if (
            self.kind == WorkflowPrincipalKind.DYNAMIC
            and self.dynamic_target not in WorkflowApproverTarget.values
        ):
            raise ValidationError(
                {"dynamic_target": f"不支持的动态对象类型：{self.dynamic_target}"}
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
    # 审批流中暂存本次流转目标负责人；None 表示本次流转不修改负责人。
    target_assignee_ids = models.JSONField(
        null=True,
        blank=True,
        verbose_name="目标负责人ID列表",
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


class WorkflowTransitionRequiredField(BaseModel):
    workflow = models.ForeignKey(
        WorkflowTransition,
        related_name="required_fields",
        on_delete=models.CASCADE,
        verbose_name="所属工作流",
    )
    extra_field = models.ForeignKey(
        "db.TypeExtraField",
        related_name="required_in_transitions",
        on_delete=models.CASCADE,
        verbose_name="所属字段",
    )

    class Meta:
        db_table = "workflow_transition_required_fields"
        constraints = [
            models.UniqueConstraint(
                fields=["workflow", "extra_field"],
                condition=Q(deleted_at__isnull=True),
                name="workflow_transition_required_field_unique_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.extra_field.name}"
