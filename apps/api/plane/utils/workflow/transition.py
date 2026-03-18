from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    ApprovalAction,
    ApprovalType,
    Issue,
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    State,
    TransitionRecordStatus,
    Workflow,
    WorkflowTransition,
    WorkflowTransitionApproval,
)


def get_active_workflow(issue: Issue):
    """根据 issue.type 获取激活的工作流，不存在返回 None。"""
    return Workflow.objects.filter(issue_type=issue.type, is_active=True).first()


def get_active_transition(issue: Issue, to_state: State):
    """
    获取从当前状态到目标状态的流转边，同时返回当前状态下是否存在任意流转边。
    返回: (workflow, transition_or_None, has_any_outgoing_transition)
    """
    workflow = get_active_workflow(issue)
    if not workflow:
        return None, None, False

    from_state = issue.state
    transition = WorkflowTransition.objects.filter(
        workflow=workflow,
        from_state=from_state,
        to_state=to_state,
    ).first()
    has_any = WorkflowTransition.objects.filter(
        workflow=workflow,
        from_state=from_state,
    ).exists()
    return workflow, transition, has_any


def check_update_state_permission(issue: Issue, to_state: State, user,**kwargs):
    """
    检查是否可以直接变更工作项状态。
    返回: (allowed: bool, error_message: str | None, transition_record: IssueTransitionRecord | None)

    - allowed=True, error=None, record=None  -> 直接放行
    - allowed=False, error=str, record=None  -> 拒绝，给出错误原因
    - allowed=False, error=str, record=ITR   -> 创建了审批申请，通知前端
    """
    workflow, wft, exist_wft = get_active_transition(issue, to_state)

    if not workflow:
        return True, None, None

    # 有工作流但当前状态没有指定可流转方向
    if exist_wft and not wft:
        return False, "需要按照工作流规则更改状态", None

    # 没有配置流转规则或策略是 ALL（所有人直接通过）
    if not wft or wft.approval_type == ApprovalType.ALL:
        return True, None, None

    # ANY：审批人之一则放行
    if wft.approval_type == ApprovalType.ANY:
        if WorkflowTransitionApproval.objects.filter(transition=wft, approver=user).exists():
            return True, None, None
        return False, "你不是该状态的审批人", None

    # N_OF_M：发起/复用审批申请
    if wft.approval_type == ApprovalType.N_OF_M:
        record, created = ensure_transition_record(
            issue=issue,
            transition=wft,
            from_state=issue.state,
            to_state=to_state,
            project_id=kwargs['project_id']
        )
        if created:
            return False, "已创建审批流程,需要审批人审批通过后更改", record
        return False, "已有待审批的相同状态变更", record

    return False, "需要按照工作流规则更改状态", None


def ensure_transition_record(
    issue: Issue,
    transition: WorkflowTransition,
    from_state,
    to_state: State,
    project_id,
) -> tuple:
    """
    取消同一流转边中、目标状态不同的 PENDING 申请（已过期的旧申请），
    然后 get_or_create 目标状态的 PENDING 申请，若新建则初始化审批人记录。
    返回: (record, created)
    """
    # 取消同一 issue+transition 下目标状态不同的 PENDING 申请
    IssueTransitionRecord.objects.filter(
        issue=issue,
        transition=transition,
        from_state=from_state,
        status=TransitionRecordStatus.PENDING,
    ).exclude(to_state=to_state).update(status=TransitionRecordStatus.CANCELLED)

    record, created = IssueTransitionRecord.objects.get_or_create(
        issue=issue,
        transition=transition,
        from_state=from_state,
        to_state=to_state,
        status=TransitionRecordStatus.PENDING,
        project_id=project_id
    )

    if created:
        all_approver_ids = list(
            WorkflowTransitionApproval.objects.filter(transition=transition).values_list(
                "approver_id", flat=True
            )
        )
        IssueTransitionApprovalRecord.objects.bulk_create(
            [
                IssueTransitionApprovalRecord(
                    transition_record=record,
                    approver_id=approver_id,
                )
                for approver_id in all_approver_ids
            ],
            batch_size=100,
            ignore_conflicts=True,
        )

    return record, created


@transaction.atomic
def approve_transition_record(record_id, approver, action: str, comment: str = ""):
    """
    提交个人审批动作（approved / rejected），并在事务内重算主申请状态。
    - 只有主申请仍为 PENDING 才允许操作。
    - 操作完成后调用 recompute_transition_record_status。
    返回: (success: bool, error: str | None, record: IssueTransitionRecord)
    """
    try:
        record = IssueTransitionRecord.objects.select_for_update().get(pk=record_id)
    except IssueTransitionRecord.DoesNotExist:
        return False, "审批申请不存在", None

    if record.status != TransitionRecordStatus.PENDING:
        return False, "该审批申请已结束，无法继续操作", record

    # 校验当前用户确实是该申请的审批人
    try:
        approval_rec = IssueTransitionApprovalRecord.objects.select_for_update().get(
            transition_record=record,
            approver=approver,
            deleted_at__isnull=True,
        )
    except IssueTransitionApprovalRecord.DoesNotExist:
        return False, "你不是该审批申请的审批人", record

    approval_rec.action = action
    approval_rec.comment = comment or ""
    approval_rec.save(update_fields=["action", "comment", "updated_at"])

    recompute_transition_record_status(record)
    record.refresh_from_db()
    return True, None, record


def recompute_transition_record_status(record: IssueTransitionRecord):
    """
    重算主申请状态（调用前必须在事务+行锁保护下）。
    - 任一人拒绝 -> REJECTED
    - 无拒绝且通过人数达到 required_count -> APPROVED，并落 issue.state
    """
    if record.status != TransitionRecordStatus.PENDING:
        return

    approval_records = list(
        IssueTransitionApprovalRecord.objects.filter(
            transition_record=record,
            deleted_at__isnull=True,
        ).values("action")
    )

    actions = [r["action"] for r in approval_records]

    # 有任何拒绝则整体拒绝
    if ApprovalAction.REJECTED in actions:
        record.status = TransitionRecordStatus.REJECTED
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "completed_at", "updated_at"])
        return

    approved_count = actions.count(ApprovalAction.APPROVED)

    transition = record.transition
    if transition is None:
        return

    required = transition.required_count or 1

    if approved_count >= required:
        record.status = TransitionRecordStatus.APPROVED
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "completed_at", "updated_at"])

        # 落 issue 状态
        issue = record.issue
        if record.to_state_id:
            issue.state_id = record.to_state_id
            issue.save(update_fields=["state", "updated_at"])
