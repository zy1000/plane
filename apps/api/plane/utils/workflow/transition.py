from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    ApprovalAction,
    ApprovalType,
    Issue,
    IssueActivity,
    IssueAssignee,
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    Notification,
    State,
    TransitionRecordStatus,
    Workflow,
    WorkflowApproverTarget,
    WorkflowTransition,
    WorkflowTransitionApproval, TypeExtraFieldValue,
)
from plane.db.models.workflow import WorkflowTransitionRequiredField


def get_active_workflow(issue: Issue):
    """根据 issue.type 获取激活的工作流，不存在返回 None。"""
    return Workflow.objects.filter(issue_type=issue.type, is_active=True, project_id=issue.project_id).first()


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


def resolve_transition_approver_ids(issue: Issue, transition: WorkflowTransition) -> list:
    """解析流转配置中的静态/动态审批人，返回去重后的真实用户 ID 列表。"""
    approver_ids = list(
        WorkflowTransitionApproval.objects.filter(
            transition=transition,
            deleted_at__isnull=True,
        ).values_list("approver_id", flat=True)
    )

    dynamic_approver_types = transition.dynamic_approver_types or []
    if WorkflowApproverTarget.ASSIGNEES in dynamic_approver_types:
        approver_ids.extend(
            IssueAssignee.objects.filter(
                issue=issue,
                deleted_at__isnull=True,
            ).values_list("assignee_id", flat=True)
        )
    if WorkflowApproverTarget.CREATED_BY in dynamic_approver_types and issue.created_by_id:
        approver_ids.append(issue.created_by_id)

    return list(dict.fromkeys(approver_ids))


# 工作项内容变更时，会触发 PENDING 审批投票重置的核心字段集合
CONTENT_RESET_CORE_FIELDS = frozenset({"name", "description_html", "priority", "assignee_ids"})


def _evaluate_required_fields(transition, issue: Issue):
    """
    校验该 transition 配置的必填字段在 issue 上是否都已有值。
    返回: (ok: bool, error_message: str | None)。transition 为 None 时直接通过。
    """
    if transition is None:
        return True, None

    queryset = WorkflowTransitionRequiredField.objects.filter(workflow=transition).select_related("extra_field")
    for obj in queryset:
        value = (
            TypeExtraFieldValue.objects.filter(issue=issue, extra_field=obj.extra_field)
            .values_list("value", flat=True)
            .first()
        )
        if value is None:
            return False, f"按照工作流规则[{obj.extra_field.name}]是必填项"
    return True, None


def check_update_state_permission(issue: Issue, to_state: State, user, **kwargs):
    """
    检查是否可以直接变更工作项状态。
    返回: (allowed: bool, error_message: str | None, transition_record: IssueTransitionRecord | None)

    - allowed=True, error=None, record=None  -> 直接放行
    - allowed=False, error=str, record=None  -> 拒绝，给出错误原因
    - allowed=False, error=str, record=ITR   -> 创建了审批申请，通知前端
    """
    workflow, wft, exist_wft = get_active_transition(issue, to_state)

    # 流转需要的必填字段是否都存在值
    ok, error = _evaluate_required_fields(wft, issue)
    if not ok:
        return False, error, None

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
        approver_ids = resolve_transition_approver_ids(issue, wft)
        if not approver_ids:
            return False, "当前工作项未找到可用审批人", None
        if user.id in approver_ids:
            return True, None, None
        return False, "你不是该状态的审批人", None

    # N_OF_M：发起/复用审批申请
    if wft.approval_type == ApprovalType.N_OF_M:
        approver_ids = resolve_transition_approver_ids(issue, wft)
        required_count = wft.required_count or 1
        if not approver_ids:
            return False, "当前工作项未找到可用审批人，无法发起审批", None
        if len(approver_ids) < required_count:
            return False, "当前工作项可用审批人数不足，无法发起审批", None
        record, created = ensure_transition_record(
            issue=issue,
            transition=wft,
            from_state=issue.state,
            to_state=to_state,
            project_id=kwargs['project_id'],
            initiated_by=user,
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
        initiated_by=None,
) -> tuple:
    """
    取消同一流转边中、目标状态不同的 PENDING 申请（已过期的旧申请），
    然后 get_or_create 目标状态的 PENDING 申请，若新建则初始化审批人记录。
    返回: (record, created)
    """
    # 取消同一 issue+transition 下目标状态不同的 PENDING 申请
    IssueTransitionRecord.objects.filter(
        issue=issue,
        from_state=from_state,
        status=TransitionRecordStatus.PENDING,
    ).exclude(to_state=to_state, transition=transition, ).update(status=TransitionRecordStatus.CANCELLED)

    record, created = IssueTransitionRecord.objects.get_or_create(
        issue=issue,
        transition=transition,
        from_state=from_state,
        to_state=to_state,
        status=TransitionRecordStatus.PENDING,
        project_id=project_id
    )

    if created:
        all_approver_ids = resolve_transition_approver_ids(issue, transition)
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
        _send_approval_notifications(record=record, issue=issue, approver_ids=all_approver_ids)

        from_name = from_state.name if from_state else "（初始）"
        to_name = to_state.name if to_state else ""
        IssueActivity.objects.create(
            issue=issue,
            actor=initiated_by,
            verb="created",
            field="workflow_approval_request",
            old_value=from_name,
            new_value=to_name,
            old_identifier=from_state.id if from_state else None,
            new_identifier=to_state.id if to_state else None,
            comment=f"发起了状态变更审批申请（{from_name} → {to_name}）",
            project_id=project_id,
            workspace_id=issue.workspace_id,
            epoch=int(timezone.now().timestamp()),
        )

    return record, created


def _send_approval_notifications(record: IssueTransitionRecord, issue: Issue, approver_ids: list) -> None:
    """向所有审批人发送站内通知，提示其前往审批。"""
    if not approver_ids:
        return

    project = issue.project
    from_name = record.from_state.name if record.from_state_id else "（初始）"
    to_name = record.to_state.name if record.to_state_id else ""

    notifications = [
        Notification(
            workspace=project.workspace,
            project=project,
            sender="in_app:workflow_approval:requested",
            triggered_by=issue.updated_by or issue.created_by,
            receiver_id=approver_id,
            entity_identifier=issue.id,
            entity_name="issue",
            title=f"需要你审批工作项「{issue.name}」的状态变更",
            data={
                "issue": {
                    "id": str(issue.id),
                    "name": str(issue.name),
                    "identifier": str(project.identifier),
                    "sequence_id": issue.sequence_id,
                    "state_name": issue.state.name,
                    "state_group": issue.state.group,
                },
                "issue_activity": {
                    "id": str(record.id),
                    "verb": "created",
                    "field": "workflow_approval_request",
                    "actor": str(issue.updated_by_id or issue.created_by_id or ""),
                    "new_value": to_name,
                    "old_value": from_name,
                    "issue_comment": "",
                    "old_identifier": str(record.from_state_id) if record.from_state_id else None,
                    "new_identifier": str(record.to_state_id) if record.to_state_id else None,
                },
                "transition_record_id": str(record.id),
            },
        )
        for approver_id in approver_ids
    ]
    Notification.objects.bulk_create(notifications, batch_size=100, ignore_conflicts=True)


def _send_approval_reset_notifications(record: IssueTransitionRecord, issue: Issue, approver_ids: list) -> None:
    """工作项关键内容变更后，通知所有审批人重新审批。"""
    if not approver_ids:
        return

    project = issue.project
    from_name = record.from_state.name if record.from_state_id else "（初始）"
    to_name = record.to_state.name if record.to_state_id else ""

    notifications = [
        Notification(
            workspace=project.workspace,
            project=project,
            sender="in_app:workflow_approval:reset",
            triggered_by=issue.updated_by or issue.created_by,
            receiver_id=approver_id,
            entity_identifier=issue.id,
            entity_name="issue",
            title=f"工作项「{issue.name}」内容已变更，请重新审批",
            data={
                "issue": {
                    "id": str(issue.id),
                    "name": str(issue.name),
                    "identifier": str(project.identifier),
                    "sequence_id": issue.sequence_id,
                    "state_name": issue.state.name,
                    "state_group": issue.state.group,
                },
                "issue_activity": {
                    "id": str(record.id),
                    "verb": "updated",
                    "field": "workflow_approval_request",
                    "actor": str(issue.updated_by_id or issue.created_by_id or ""),
                    "new_value": "reset",
                    "old_value": from_name,
                    "issue_comment": "",
                    "old_identifier": str(record.from_state_id) if record.from_state_id else None,
                    "new_identifier": str(record.to_state_id) if record.to_state_id else None,
                },
                "transition_record_id": str(record.id),
            },
        )
        for approver_id in approver_ids
    ]
    Notification.objects.bulk_create(notifications, batch_size=100, ignore_conflicts=True)


def capture_issue_content_snapshot(issue: Issue, assignee_ids=None) -> dict:
    """
    捕获 issue 的关键内容快照，用于评审期间内容变更比对。
    - assignee_ids 可由调用方传入（例如已 annotate 的列表）以避免重复查询；为 None 时直接查 DB。
    返回结构：{"core": {...}, "extra": {extra_field_id: value, ...}}。
    """
    if assignee_ids is None:
        # 与视图 annotate 口径对齐：仅计入仍活跃在项目中的成员
        assignee_ids = list(
            IssueAssignee.objects.filter(
                issue=issue,
                deleted_at__isnull=True,
                assignee__member_project__is_active=True,
            )
            .values_list("assignee_id", flat=True)
            .distinct()
        )
    return {
        "core": {
            "name": issue.name,
            "description_html": issue.description_html,
            "priority": issue.priority,
            "assignee_ids": tuple(sorted(str(x) for x in (assignee_ids or []))),
        },
        "extra": dict(
            TypeExtraFieldValue.objects.filter(issue=issue).values_list("extra_field_id", "value")
        ),
    }


def reset_pending_transition_votes_if_content_changed(
    issue: Issue,
    before_snapshot: dict,
    actor,
    project_id: str,
    after_assignee_ids=None,
) -> int:
    """
    与 capture_issue_content_snapshot 配合：在 serializer.save() 之后比对快照差异，
    若关键字段发生实际变更，调用 reset_pending_transition_votes_on_content_change 重置已投票。
    返回被重置的 record 数量。
    """
    after_snapshot = capture_issue_content_snapshot(issue, assignee_ids=after_assignee_ids)
    before_core = before_snapshot.get("core", {})
    after_core = after_snapshot.get("core", {})
    changed_field_keys = {k for k in before_core if before_core.get(k) != after_core.get(k)}

    before_extra = before_snapshot.get("extra", {})
    after_extra = after_snapshot.get("extra", {})
    extra_keys = set(before_extra) | set(after_extra)
    changed_extra_field_ids = {
        eid for eid in extra_keys if before_extra.get(eid) != after_extra.get(eid)
    }
    if not changed_field_keys and not changed_extra_field_ids:
        return 0
    return reset_pending_transition_votes_on_content_change(
        issue=issue,
        changed_field_keys=changed_field_keys,
        changed_extra_field_ids=changed_extra_field_ids,
        actor=actor,
        project_id=project_id,
    )


def reset_pending_transition_votes_on_content_change(
    issue: Issue,
    changed_field_keys,
    changed_extra_field_ids,
    actor,
    project_id: str,
) -> int:
    """
    工作项关键字段变更时，重置该 issue 下命中的 PENDING IssueTransitionRecord 已投票记录。
    命中规则（任一满足即重置该 record）：
    - 变更字段集合 与 CONTENT_RESET_CORE_FIELDS 有交集；或
    - 变更的 extra_field_id 集合 与 该 transition 配置的 required_fields 有交集。
    返回被重置的 record 数量。
    """
    changed_core = set(changed_field_keys or []) & CONTENT_RESET_CORE_FIELDS
    changed_extra = set(changed_extra_field_ids or [])
    if not changed_core and not changed_extra:
        return 0

    pending_records = list(
        IssueTransitionRecord.objects.filter(
            issue=issue,
            status=TransitionRecordStatus.PENDING,
        ).select_related("transition", "from_state", "to_state")
    )
    if not pending_records:
        return 0

    reset_count = 0
    for record in pending_records:
        required_extra_ids = set()
        if record.transition_id is not None:
            required_extra_ids = set(
                WorkflowTransitionRequiredField.objects.filter(
                    workflow_id=record.transition_id
                ).values_list("extra_field_id", flat=True)
            )

        if not (changed_core or (required_extra_ids & changed_extra)):
            continue

        updated_count = IssueTransitionApprovalRecord.objects.filter(
            transition_record=record,
            action__isnull=False,
            deleted_at__isnull=True,
        ).update(action=None, comment="")

        # 没人投过票则不算"重置投票"事件，跳过 activity / 通知 / 计数
        if updated_count == 0:
            continue

        from_name = record.from_state.name if record.from_state_id else "（初始）"
        to_name = record.to_state.name if record.to_state_id else ""
        IssueActivity.objects.create(
            issue=issue,
            actor=actor,
            verb="updated",
            field="workflow_approval_request",
            old_value=from_name,
            new_value="reset",
            old_identifier=record.from_state_id,
            new_identifier=record.to_state_id,
            comment=f"工作项内容变更，已重置审批投票（{from_name} → {to_name}）",
            project_id=project_id,
            workspace_id=issue.workspace_id,
            epoch=int(timezone.now().timestamp()),
        )

        approver_ids = list(
            IssueTransitionApprovalRecord.objects.filter(
                transition_record=record,
                deleted_at__isnull=True,
            ).values_list("approver_id", flat=True)
        )
        _send_approval_reset_notifications(record=record, issue=issue, approver_ids=approver_ids)

        reset_count += 1

    return reset_count


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

    action_label = "通过" if action == ApprovalAction.APPROVED else "拒绝"
    IssueActivity.objects.create(
        issue=record.issue,
        actor=approver,
        verb="updated",
        field="workflow_approval_action",
        old_value=None,
        new_value=action,
        comment=f"{action_label}了状态变更审批申请",
        project_id=record.project_id,
        workspace_id=record.issue.workspace_id,
        epoch=int(timezone.now().timestamp()),
    )

    recompute_transition_record_status(record, acted_by=approver)
    record.refresh_from_db()
    return True, None, record


def cancel_issue_pending_transitions(issue: Issue, cancelled_by, project_id: str) -> int:
    """
    取消该工作项下所有 PENDING 状态的审批流程（直接更改状态时调用）。
    同时写入活动日志。返回取消的记录数量。
    """
    pending_records = list(
        IssueTransitionRecord.objects.filter(
            issue=issue,
            status=TransitionRecordStatus.PENDING,
        ).select_related("from_state", "to_state")
    )

    if not pending_records:
        return 0

    record_ids = [r.id for r in pending_records]
    IssueTransitionRecord.objects.filter(id__in=record_ids).update(
        status=TransitionRecordStatus.CANCELLED,
        completed_at=timezone.now(),
    )

    activities = []
    for record in pending_records:
        from_name = record.from_state.name if record.from_state_id else "（初始）"
        to_name = record.to_state.name if record.to_state_id else ""
        activities.append(
            IssueActivity(
                issue=issue,
                actor=cancelled_by,
                verb="updated",
                field="workflow_approval_request",
                old_value=from_name,
                new_value="cancelled",
                old_identifier=record.from_state_id,
                new_identifier=record.to_state_id,
                comment=f"直接更改状态，已取消待审批流程（{from_name} → {to_name}）",
                project_id=project_id,
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
        )
    IssueActivity.objects.bulk_create(activities, batch_size=100)

    return len(pending_records)


def recompute_transition_record_status(record: IssueTransitionRecord, acted_by=None):
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
        from_name = record.from_state.name if record.from_state_id else "（初始）"
        to_name = record.to_state.name if record.to_state_id else ""
        IssueActivity.objects.create(
            issue=record.issue,
            actor=acted_by,
            verb="updated",
            field="workflow_approval_request",
            old_value=from_name,
            new_value="rejected",
            comment=f"工作流审批被拒绝，状态变更取消（{from_name} → {to_name}）",
            project_id=record.project_id,
            workspace_id=record.issue.workspace_id,
            epoch=int(timezone.now().timestamp()),
        )
        return

    approved_count = actions.count(ApprovalAction.APPROVED)

    transition = record.transition
    if transition is None:
        return

    required = transition.required_count or 1

    if approved_count >= required:
        # 落 state 之前再校验一次必填字段，防止申请发起后被绕过
        ok, error = _evaluate_required_fields(transition, record.issue)
        if not ok:
            record.status = TransitionRecordStatus.CANCELLED
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "completed_at", "updated_at"])
            from_name = record.from_state.name if record.from_state_id else "（初始）"
            to_name = record.to_state.name if record.to_state_id else ""
            IssueActivity.objects.create(
                issue=record.issue,
                actor=acted_by,
                verb="updated",
                field="workflow_approval_request",
                old_value=from_name,
                new_value="cancelled",
                old_identifier=record.from_state_id,
                new_identifier=record.to_state_id,
                comment=f"必填字段缺失，审批已取消（{from_name} → {to_name}）：{error}",
                project_id=record.project_id,
                workspace_id=record.issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
            return

        record.status = TransitionRecordStatus.APPROVED
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "completed_at", "updated_at"])

        # 落 issue 状态
        issue = record.issue
        if record.to_state_id:
            old_state_name = issue.state.name if issue.state_id else "（初始）"
            old_state_id = issue.state_id
            issue.state_id = record.to_state_id
            issue.save(update_fields=["state", "updated_at"])
            IssueActivity.objects.create(
                issue=issue,
                actor=acted_by,
                verb="updated",
                field="state",
                old_value=old_state_name,
                new_value=record.to_state.name,
                old_identifier=old_state_id,
                new_identifier=record.to_state_id,
                comment=f"工作流审批通过，状态已更新为 {record.to_state.name}",
                project_id=record.project_id,
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
