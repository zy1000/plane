from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    ApprovalAction,
    ApprovalType,
    Issue,
    IssueActivity,
    IssueAssignee,
    ProjectGroupRole,
    ProjectMember,
    ProjectMemberRole,
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    Notification,
    State,
    TransitionRecordStatus,
    Workflow,
    WorkflowApproverTarget,
    WorkflowPrincipalDimension,
    WorkflowPrincipalKind,
    WorkflowTransition,
    WorkflowTransitionPrincipal,
    TypeExtraFieldValue,
)
from plane.db.models.workflow import WorkflowTransitionRequiredField
from plane.utils.extra_field_value import (
    get_missing_required_extra_fields,
    is_extra_field_value_empty,
)


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


def get_transition_principals(transition: WorkflowTransition, dimension: str):
    """按维度读取流转边上的对象行，所有查询都必须显式带 dimension 过滤。"""
    return WorkflowTransitionPrincipal.objects.filter(
        transition=transition,
        dimension=dimension,
        deleted_at__isnull=True,
    )


def _normalize_user_ids(values):
    if values is None:
        return []
    return list(dict.fromkeys(str(value) for value in values if value))


def get_issue_assignee_ids(issue: Issue):
    return _normalize_user_ids(
        IssueAssignee.objects.filter(
            issue=issue,
            deleted_at__isnull=True,
        ).values_list("assignee_id", flat=True)
    )


def get_assignable_project_member_ids(project_id, member_ids):
    """按普通工作项负责人规则过滤：项目内活跃且权限足够的成员。"""
    normalized_member_ids = _normalize_user_ids(member_ids)
    if not normalized_member_ids:
        return []

    return _normalize_user_ids(
        ProjectMember.objects.filter(
            project_id=project_id,
            role__gte=15,
            is_active=True,
            deleted_at__isnull=True,
            member_id__in=normalized_member_ids,
        ).values_list("member_id", flat=True)
    )


def resolve_role_member_ids(project_id, role_ids):
    """将项目角色集合解析为当前项目内在职成员的用户 ID 列表。"""
    normalized_role_ids = _normalize_user_ids(role_ids)
    if not normalized_role_ids:
        return []

    direct_member_ids = ProjectMemberRole.objects.filter(
        role_id__in=normalized_role_ids,
        role__project_id=project_id,
        role__deleted_at__isnull=True,
        member__project_id=project_id,
        member__is_active=True,
        member__deleted_at__isnull=True,
        member__member_id__isnull=False,
        deleted_at__isnull=True,
    ).values_list("member__member_id", flat=True)
    group_member_ids = ProjectGroupRole.objects.filter(
        project_id=project_id,
        role_id__in=normalized_role_ids,
        role__deleted_at__isnull=True,
        deleted_at__isnull=True,
        group__deleted_at__isnull=True,
        group__group_members__deleted_at__isnull=True,
        group__group_members__member__deleted_at__isnull=True,
        group__group_members__member__is_active=True,
        group__group_members__member__member__member_project__project_id=project_id,
        group__group_members__member__member__member_project__is_active=True,
        group__group_members__member__member__member_project__deleted_at__isnull=True,
    ).values_list("group__group_members__member__member_id", flat=True)

    return _normalize_user_ids(list(direct_member_ids) + list(group_member_ids))


def resolve_dimension_user_ids(
    issue: Issue, transition: WorkflowTransition, dimension: str
) -> list:
    """解析指定维度中的 member/role/dynamic，返回去重后的真实用户 ID 列表。"""
    principals = list(get_transition_principals(transition, dimension))
    if not principals:
        return []

    user_ids = []
    role_ids = []
    want_assignees = False
    want_created_by = False

    for principal in principals:
        if principal.kind == WorkflowPrincipalKind.MEMBER and principal.member_id:
            user_ids.append(principal.member_id)
        elif principal.kind == WorkflowPrincipalKind.ROLE and principal.role_id:
            role_ids.append(principal.role_id)
        elif principal.kind == WorkflowPrincipalKind.DYNAMIC:
            if principal.dynamic_target == WorkflowApproverTarget.ASSIGNEES:
                want_assignees = True
            elif principal.dynamic_target == WorkflowApproverTarget.CREATED_BY:
                want_created_by = True

    if role_ids:
        user_ids.extend(resolve_role_member_ids(issue.project_id, role_ids))
    if want_assignees:
        user_ids.extend(get_issue_assignee_ids(issue))
    if want_created_by and issue.created_by_id:
        user_ids.append(issue.created_by_id)

    return _normalize_user_ids(user_ids)


def resolve_transition_approver_ids(issue: Issue, transition: WorkflowTransition) -> list:
    """解析审批人维度配置中的成员/角色/动态对象，返回去重后的真实用户 ID 列表。"""
    return resolve_dimension_user_ids(
        issue=issue,
        transition=transition,
        dimension=WorkflowPrincipalDimension.APPROVER,
    )


# 工作项内容变更时，会触发 PENDING 审批投票重置的核心字段集合
CONTENT_RESET_CORE_FIELDS = frozenset({"name", "description_html", "priority", "assignee_ids"})


def _evaluate_issue_type_required_fields(issue: Issue):
    missing_type_fields = get_missing_required_extra_fields(issue)
    if missing_type_fields:
        names = "、".join(field.name for field in missing_type_fields)
        return False, f"工作项类型必填字段缺失：{names}"
    return True, None


def _evaluate_required_fields(transition, issue: Issue):
    """
    校验 issue 类型必填字段和该 transition 配置的必填字段是否都已有值。
    返回: (ok: bool, error_message: str | None)。transition 为 None 时仅检查类型级必填字段。
    """
    ok, error = _evaluate_issue_type_required_fields(issue)
    if not ok:
        return ok, error

    if transition is None:
        return True, None

    queryset = WorkflowTransitionRequiredField.objects.filter(
        workflow=transition, deleted_at__isnull=True
    ).select_related("extra_field")
    for obj in queryset:
        value = (
            TypeExtraFieldValue.objects.filter(
                issue=issue,
                extra_field=obj.extra_field,
                deleted_at__isnull=True,
            )
            .values_list("value", flat=True)
            .first()
        )
        if is_extra_field_value_empty(value):
            return False, f"按照工作流规则[{obj.extra_field.name}]是必填项"
    return True, None


def _check_transition_initiator(issue: Issue, transition: WorkflowTransition, user):
    """发起人维度为空时默认全员可发起；有配置时要求命中。"""
    if not get_transition_principals(
        transition, WorkflowPrincipalDimension.INITIATOR
    ).exists():
        return True, None

    initiator_ids = set(
        resolve_dimension_user_ids(
            issue=issue,
            transition=transition,
            dimension=WorkflowPrincipalDimension.INITIATOR,
        )
    )
    if str(user.id) in initiator_ids:
        return True, None
    return False, "你不是该状态流转的发起人"


def check_transition_assignee_rule(
    issue: Issue, transition: WorkflowTransition, target_assignee_ids=None
):
    """校验指定流转边的目标负责人约束。未配置规则时默认不约束。"""
    desired_ids = set(
        _normalize_user_ids(
            target_assignee_ids
            if target_assignee_ids is not None
            else get_issue_assignee_ids(issue)
        )
    )
    if not desired_ids and get_issue_assignee_ids(issue):
        return False, "工作项负责人不能为空"

    assignable_ids = set(get_assignable_project_member_ids(issue.project_id, desired_ids))
    if desired_ids != assignable_ids:
        return False, "目标负责人不是当前项目可分配成员"

    if not get_transition_principals(
        transition, WorkflowPrincipalDimension.ASSIGNEE
    ).exists():
        return True, None

    allowed_ids = set(
        resolve_dimension_user_ids(
            issue=issue,
            transition=transition,
            dimension=WorkflowPrincipalDimension.ASSIGNEE,
        )
    )
    if desired_ids.issubset(allowed_ids):
        return True, None
    return False, "目标状态负责人不符合工作流规则"


def check_state_assignee_constraint(issue: Issue, state: State, desired_assignee_ids=None):
    """
    校验当前状态的负责人持续约束：
    - 取指向该状态的所有入边；
    - 任一入边未配置 assignee 规则 => 该状态不约束；
    - 否则按所有入边规则并集校验 desired 是否命中。
    """
    workflow = get_active_workflow(issue)
    if not workflow:
        return True, None

    incoming_transitions = list(
        WorkflowTransition.objects.filter(
            workflow=workflow,
            to_state=state,
            deleted_at__isnull=True,
        )
    )
    if not incoming_transitions:
        return True, None

    allowed_ids = set()
    for transition in incoming_transitions:
        if not get_transition_principals(
            transition, WorkflowPrincipalDimension.ASSIGNEE
        ).exists():
            return True, None
        allowed_ids.update(
            resolve_dimension_user_ids(
                issue=issue,
                transition=transition,
                dimension=WorkflowPrincipalDimension.ASSIGNEE,
            )
        )

    desired_ids = set(
        _normalize_user_ids(
            desired_assignee_ids
            if desired_assignee_ids is not None
            else get_issue_assignee_ids(issue)
        )
    )
    if not desired_ids and get_issue_assignee_ids(issue):
        return False, "工作项负责人不能为空"

    assignable_ids = set(get_assignable_project_member_ids(issue.project_id, desired_ids))
    if desired_ids != assignable_ids:
        return False, "目标负责人不是当前项目可分配成员"

    if desired_ids.issubset(allowed_ids):
        return True, None
    return False, "当前状态负责人不符合工作流规则"


def check_added_assignee_constraint(
    issue: Issue, state: State, desired_assignee_ids=None, current_assignee_ids=None
):
    """
    只校验本次「新增」的负责人是否符合当前状态的工作流约束。

    存量负责人可能是工作流规则变更前遗留的，若按全量校验，加人、减人、
    离职交接都会被历史数据整体判死，且无法从界面上修复。这里改为增量校验：
    - 有新增负责人 => 只校验新增的这些人；
    - 纯减人或负责人未变化 => 放行（没有引入新的不合规负责人）；
    - 清空负责人 => 交由 check_state_assignee_constraint 走原有的非空校验。
    """
    current_ids = set(
        _normalize_user_ids(
            current_assignee_ids
            if current_assignee_ids is not None
            else get_issue_assignee_ids(issue)
        )
    )
    desired_ids = set(_normalize_user_ids(desired_assignee_ids))
    added_ids = desired_ids - current_ids

    if not added_ids and desired_ids:
        return True, None

    return check_state_assignee_constraint(
        issue=issue,
        state=state,
        desired_assignee_ids=sorted(added_ids),
    )


def _normalize_approval_reason(approval_reason=None) -> str:
    return str(approval_reason or "").strip()


def check_update_state_permission(
    issue: Issue, to_state: State, user, target_assignee_ids=None, approval_reason=None, **kwargs
):
    """
    检查是否可以直接变更工作项状态。
    返回: (allowed: bool, error_message: str | None, transition_record: IssueTransitionRecord | None)

    - allowed=True, error=None, record=None  -> 直接放行
    - allowed=False, error=str, record=None  -> 拒绝，给出错误原因
    - allowed=False, error=str, record=ITR   -> 创建了审批申请，通知前端
    """
    workflow, wft, exist_wft = get_active_transition(issue, to_state)

    if not workflow:
        ok, error = _evaluate_issue_type_required_fields(issue)
        if not ok:
            return False, error, None
        return True, None, None

    # 有工作流但当前状态没有指定可流转方向
    if exist_wft and not wft:
        return False, "需要按照工作流规则更改状态", None

    # 没有配置流转规则则放行
    if not wft:
        ok, error = _evaluate_issue_type_required_fields(issue)
        if not ok:
            return False, error, None
        return True, None, None

    desired_assignee_ids = _normalize_user_ids(
        target_assignee_ids
        if target_assignee_ids is not None
        else get_issue_assignee_ids(issue)
    )

    # 1) 发起人校验
    ok, error = _check_transition_initiator(issue=issue, transition=wft, user=user)
    if not ok:
        return False, error, None

    # 2) 流转必填字段校验
    ok, error = _evaluate_required_fields(wft, issue)
    if not ok:
        return False, error, None

    # 3) 目标负责人约束校验
    ok, error = check_transition_assignee_rule(
        issue=issue,
        transition=wft,
        target_assignee_ids=desired_assignee_ids,
    )
    if not ok:
        return False, error, None

    # 4) 审批判定
    if wft.approval_type == ApprovalType.ALL:
        return True, None, None

    # ANY / N_OF_M：发起/复用审批申请；发起人即便也是审批人也不直接豁免审批。
    if wft.approval_type in (ApprovalType.ANY, ApprovalType.N_OF_M):
        approver_ids = resolve_transition_approver_ids(issue, wft)
        required_count = 1 if wft.approval_type == ApprovalType.ANY else (wft.required_count or 1)
        if not approver_ids:
            return False, "当前工作项未找到可用审批人，无法发起审批", None
        if len(approver_ids) < required_count:
            return False, "当前工作项可用审批人数不足，无法发起审批", None
        record, created = ensure_transition_record(
            issue=issue,
            transition=wft,
            from_state=issue.state,
            to_state=to_state,
            project_id=kwargs["project_id"],
            initiated_by=user,
            target_assignee_ids=desired_assignee_ids,
            approval_reason=approval_reason,
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
    target_assignee_ids=None,
    approval_reason=None,
) -> tuple:
    """
    取消同一流转边中、目标状态不同的 PENDING 申请（已过期的旧申请），
    然后 get_or_create 目标状态的 PENDING 申请，若新建则初始化审批人记录。
    返回: (record, created)
    """
    normalized_target_assignee_ids = (
        _normalize_user_ids(target_assignee_ids)
        if target_assignee_ids is not None
        else None
    )
    normalized_approval_reason = _normalize_approval_reason(approval_reason)

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
        project_id=project_id,
        defaults={
            "target_assignee_ids": normalized_target_assignee_ids,
            "approval_reason": normalized_approval_reason,
        },
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

    else:
        target_assignee_changed = record.target_assignee_ids != normalized_target_assignee_ids
        approval_reason_changed = record.approval_reason != normalized_approval_reason

        if not target_assignee_changed and not approval_reason_changed:
            return record, created

        record.target_assignee_ids = normalized_target_assignee_ids
        record.approval_reason = normalized_approval_reason
        record.save(update_fields=["target_assignee_ids", "approval_reason", "updated_at"])

        reset_count = IssueTransitionApprovalRecord.objects.filter(
            transition_record=record,
            action__isnull=False,
            deleted_at__isnull=True,
        ).update(action=None, comment="")

        if reset_count:
            approver_ids = list(
                IssueTransitionApprovalRecord.objects.filter(
                    transition_record=record,
                    deleted_at__isnull=True,
                ).values_list("approver_id", flat=True)
            )
            from_name = from_state.name if from_state else "（初始）"
            to_name = to_state.name if to_state else ""
            reset_reason = "审批申请内容变更"
            if target_assignee_changed and approval_reason_changed:
                reset_reason = "目标负责人和变更原因变更"
            elif target_assignee_changed:
                reset_reason = "目标负责人变更"
            elif approval_reason_changed:
                reset_reason = "变更原因变更"
            IssueActivity.objects.create(
                issue=issue,
                actor=initiated_by,
                verb="updated",
                field="workflow_approval_request",
                old_value=from_name,
                new_value="reset",
                old_identifier=from_state.id if from_state else None,
                new_identifier=to_state.id if to_state else None,
                comment=f"{reset_reason}，已重置审批投票（{from_name} → {to_name}）",
                project_id=project_id,
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
            _send_approval_reset_notifications(
                record=record,
                issue=issue,
                approver_ids=approver_ids,
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


def _replace_issue_assignees(issue: Issue, assignee_ids):
    """全量替换 issue 负责人，返回 (old_ids, new_ids, changed)。"""
    old_assignee_ids = get_issue_assignee_ids(issue)
    new_assignee_ids = _normalize_user_ids(assignee_ids)
    if set(old_assignee_ids) == set(new_assignee_ids):
        return old_assignee_ids, new_assignee_ids, False

    IssueAssignee.objects.filter(issue=issue, deleted_at__isnull=True).delete()
    if new_assignee_ids:
        IssueAssignee.objects.bulk_create(
            [
                IssueAssignee(
                    issue=issue,
                    assignee_id=assignee_id,
                    project_id=issue.project_id,
                    workspace_id=issue.workspace_id,
                    created_by_id=issue.created_by_id,
                    updated_by_id=issue.updated_by_id,
                )
                for assignee_id in new_assignee_ids
            ],
            batch_size=100,
            ignore_conflicts=True,
        )

    return old_assignee_ids, new_assignee_ids, True


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
        issue = record.issue

        # 落 state 之前再校验一次必填字段，防止申请发起后被绕过
        ok, error = _evaluate_required_fields(transition, issue)
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
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
            return

        # 审批最终落库前再校验一次目标负责人约束，避免审批期被改坏
        ok, error = check_transition_assignee_rule(
            issue=issue,
            transition=transition,
            target_assignee_ids=record.target_assignee_ids,
        )
        if not ok:
            record.status = TransitionRecordStatus.CANCELLED
            record.completed_at = timezone.now()
            record.save(update_fields=["status", "completed_at", "updated_at"])
            from_name = record.from_state.name if record.from_state_id else "（初始）"
            to_name = record.to_state.name if record.to_state_id else ""
            IssueActivity.objects.create(
                issue=issue,
                actor=acted_by,
                verb="updated",
                field="workflow_approval_request",
                old_value=from_name,
                new_value="cancelled",
                old_identifier=record.from_state_id,
                new_identifier=record.to_state_id,
                comment=f"目标负责人不符合规则，审批已取消（{from_name} → {to_name}）：{error}",
                project_id=record.project_id,
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
            return

        record.status = TransitionRecordStatus.APPROVED
        record.completed_at = timezone.now()
        record.save(update_fields=["status", "completed_at", "updated_at"])

        # 同事务落 issue 状态
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

        # 同事务落目标负责人（仅当审批申请中携带了目标负责人）
        if record.target_assignee_ids is not None:
            old_assignee_ids, new_assignee_ids, changed = _replace_issue_assignees(
                issue=issue,
                assignee_ids=record.target_assignee_ids,
            )
            if changed:
                IssueActivity.objects.create(
                    issue=issue,
                    actor=acted_by,
                    verb="updated",
                    field="assignees",
                    old_value=",".join(old_assignee_ids),
                    new_value=",".join(new_assignee_ids),
                    comment="工作流审批通过，负责人已按规则更新",
                    project_id=record.project_id,
                    workspace_id=issue.workspace_id,
                    epoch=int(timezone.now().timestamp()),
                )
