from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    ApprovalAction,
    ApprovalType,
    Issue,
    IssueActivity,
    IssueAssignee,
    ProjectMember,
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
from plane.utils.notify import emit
from plane.utils.notify.entities import names_of
from plane.utils.extra_field_value import (
    get_missing_required_extra_fields,
    is_extra_field_value_empty,
)


def get_active_workflow(issue: Issue):
    """根据 issue.type 获取激活的工作流，不存在返回 None。"""
    return Workflow.objects.filter(
        issue_type=issue.type, is_active=True, scheme__projects=issue.project_id
    ).first()


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
            is_active=True,
            deleted_at__isnull=True,
            member_id__in=normalized_member_ids,
        ).values_list("member_id", flat=True)
    )


def resolve_dimension_user_ids(
    issue: Issue, transition: WorkflowTransition, dimension: str
) -> list:
    """解析指定维度中的 member/role/dynamic，返回去重后的真实用户 ID 列表。"""
    return _resolve_principal_user_ids(issue, list(get_transition_principals(transition, dimension)))


def _resolve_principal_user_ids(issue: Issue, principals, memo=None) -> list:
    """
    把一组对象行解析成真实用户 ID。
    memo：同一个工作项连着解析好几组时（详情页流转按钮：每条流转的发起人 + 目标负责人）传同一个 dict，
    关联产品、按角色找人、负责人、在职成员只查一次；不传就每次现查，结果一样。
    """
    if not principals:
        return []
    if memo is None:
        memo = {}

    user_ids = []
    job_role_ids = []
    want_assignees = False
    want_created_by = False

    for principal in principals:
        if principal.kind == WorkflowPrincipalKind.MEMBER and principal.member_id:
            user_ids.append(principal.member_id)
        elif principal.kind == WorkflowPrincipalKind.ROLE and principal.job_role_id:
            job_role_ids.append(principal.job_role_id)
        elif principal.kind == WorkflowPrincipalKind.DYNAMIC:
            if principal.dynamic_target == WorkflowApproverTarget.ASSIGNEES:
                want_assignees = True
            elif principal.dynamic_target == WorkflowApproverTarget.CREATED_BY:
                want_created_by = True

    if job_role_ids:
        # 按角色找人：研发矩阵里本项目 × 工作项所属产品填了人就用矩阵，否则项目里挂了这个角色的人
        from plane.utils.job_role import resolve_project_job_role_users

        # 缺陷可关联多个产品：每个关联产品的矩阵都算
        from plane.db.models import IssueProduct

        if "product_ids" not in memo:
            memo["product_ids"] = list(
                IssueProduct.objects.filter(issue_id=issue.id).values_list("product_id", flat=True)
            ) or ([issue.product_id] if getattr(issue, "product_id", None) else None)
        # 每个角色各自回退、几个角色取并集，逐个角色解析与一次传一组结果相同
        role_users = memo.setdefault("role_users", {})
        for job_role_id in job_role_ids:
            if job_role_id not in role_users:
                role_users[job_role_id] = resolve_project_job_role_users(
                    issue.project_id, [job_role_id], memo["product_ids"]
                )
            user_ids.extend(role_users[job_role_id])
    if want_assignees:
        if "assignee_ids" not in memo:
            memo["assignee_ids"] = get_issue_assignee_ids(issue)
        user_ids.extend(memo["assignee_ids"])
    if want_created_by and issue.created_by_id:
        user_ids.append(issue.created_by_id)

    normalized_ids = _normalize_user_ids(user_ids)
    if not normalized_ids:
        return []
    # 模式方案的指定成员只要求工作区成员（共用给多个项目），解析时按本工作项项目的在职成员收口；
    # 否则会给项目外的人建审批记录、发通知，而他们进不了项目也处理不了
    active_members = memo.setdefault("active_members", {})
    unchecked = [user_id for user_id in normalized_ids if user_id not in active_members]
    if unchecked:
        found = set(
            _normalize_user_ids(
                ProjectMember.objects.filter(
                    project_id=issue.project_id,
                    is_active=True,
                    deleted_at__isnull=True,
                    member_id__in=unchecked,
                ).values_list("member_id", flat=True)
            )
        )
        for user_id in unchecked:
            active_members[user_id] = user_id in found
    return [user_id for user_id in normalized_ids if active_members[user_id]]


def resolve_transition_approver_ids(issue: Issue, transition: WorkflowTransition) -> list:
    """解析审批人维度配置中的成员/角色/动态对象，返回去重后的真实用户 ID 列表。"""
    return resolve_dimension_user_ids(
        issue=issue,
        transition=transition,
        dimension=WorkflowPrincipalDimension.APPROVER,
    )


# 工作项内容变更时，会触发 PENDING 审批投票重置的核心字段集合
CONTENT_RESET_CORE_FIELDS = frozenset({"name", "description_html", "priority", "assignee_ids"})


def _evaluate_issue_type_required_fields(issue: Issue, pending_values=None):
    missing_type_fields = get_missing_required_extra_fields(issue, pending_values)
    if missing_type_fields:
        names = "、".join(field.name for field in missing_type_fields)
        return False, f"工作项类型必填字段缺失：{names}"
    return True, None


def _evaluate_required_fields(transition, issue: Issue, pending_values=None):
    """
    校验 issue 类型必填字段和该 transition 配置的必填字段是否都已有值。
    返回: (ok: bool, error_message: str | None)。transition 为 None 时仅检查类型级必填字段。
    pending_values: 本次请求里和状态一起提交、还没落库的扩展字段值 {extra_field_id: value}，优先于库里的值。
    """
    ok, error = _evaluate_issue_type_required_fields(issue, pending_values)
    if not ok:
        return ok, error

    if transition is None:
        return True, None

    queryset = WorkflowTransitionRequiredField.objects.filter(
        workflow=transition, deleted_at__isnull=True
    ).select_related("extra_field")
    from plane.db.models import TypeExtraField
    from plane.utils.field_linkage import evaluate_linkage
    fields = list(TypeExtraField.objects.filter(issue_type_id=issue.type_id, scheme__projects=issue.project_id, is_active=True))
    values = {str(v.extra_field_id): v.value for v in TypeExtraFieldValue.objects.filter(issue=issue)}
    values.update(pending_values or {})
    normalized, visible, _ = evaluate_linkage(fields, values)
    for obj in queryset:
        field_id = str(obj.extra_field_id)
        if field_id in visible and is_extra_field_value_empty(normalized.get(field_id)):
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
    issue: Issue,
    to_state: State,
    user,
    target_assignee_ids=None,
    approval_reason=None,
    pending_extra_values=None,
    **kwargs,
):
    """
    检查是否可以直接变更工作项状态。
    pending_extra_values: 和状态一起提交、还没落库的扩展字段值 {extra_field_id: value}，必填校验优先用它。
    返回: (allowed: bool, error_message: str | None, transition_record: IssueTransitionRecord | None)

    - allowed=True, error=None, record=None  -> 直接放行
    - allowed=False, error=str, record=None  -> 拒绝，给出错误原因
    - allowed=False, error=str, record=ITR   -> 创建了审批申请，通知前端
    """
    workflow, wft, exist_wft = get_active_transition(issue, to_state)

    if not workflow:
        ok, error = _evaluate_issue_type_required_fields(issue, pending_extra_values)
        if not ok:
            return False, error, None
        return True, None, None

    # 有工作流但当前状态没有指定可流转方向
    if exist_wft and not wft:
        return False, "需要按照工作流规则更改状态", None

    # 没有配置流转规则则放行
    if not wft:
        ok, error = _evaluate_issue_type_required_fields(issue, pending_extra_values)
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
    ok, error = _evaluate_required_fields(wft, issue, pending_extra_values)
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


def _flow_text(record: IssueTransitionRecord) -> str:
    from_name = record.from_state.name if record.from_state_id else "（初始）"
    to_name = record.to_state.name if record.to_state_id else ""
    return f"{from_name} → {to_name}"


def _emit_approval_request(event: str, record: IssueTransitionRecord, issue: Issue, approver_ids: list) -> None:
    """邮件：待审批 / 重新审批。发给谁、怎么合并由统一通知入口决定。"""
    initiator = record.created_by
    initiator_name = (initiator.display_name or initiator.email) if initiator else ""
    details = [("状态流转", _flow_text(record))]
    if initiator_name:
        details.append(("申请人", initiator_name))
    names = names_of(approver_ids)
    if names:
        transition = record.transition
        if transition is not None and transition.approval_type == ApprovalType.N_OF_M:
            rule = f"，至少 {transition.required_count} 人通过"
        else:
            rule = "，任一人通过即可" if len(names) > 1 else ""
        details.append(("审批人", "、".join(names) + rule))
    if record.approval_reason:
        details.append(("变更原因", record.approval_reason[:300]))
    if event == "workflow.requested":
        summary = f"{initiator_name} 申请状态流转，待你审批" if initiator_name else "状态流转申请，待你审批"
        actor_id = record.created_by_id
    else:
        summary, actor_id = "申请内容有变更，请重新审批", None
    emit(
        event,
        "issue",
        issue.id,
        actor_id=actor_id,
        summary=summary,
        details=details,
        extra_roles={"approver": list(approver_ids or [])},
    )


def _emit_approval_result(event: str, record: IssueTransitionRecord, acted_by=None, reason="") -> None:
    """邮件：审批有结果了，告诉发起人。"""
    summary = {
        "workflow.approved": "状态流转申请已通过",
        "workflow.rejected": "状态流转申请被驳回",
        "workflow.cancelled": "状态流转申请已取消",
    }[event]
    details = [("状态流转", _flow_text(record))]
    if reason:
        details.append(("原因", str(reason)[:300]))
    emit(
        event,
        "issue",
        record.issue_id,
        actor_id=getattr(acted_by, "id", None),
        summary=summary,
        details=details,
        extra_roles={"initiator": [record.created_by_id]},
    )


def _send_approval_notifications(record: IssueTransitionRecord, issue: Issue, approver_ids: list) -> None:
    """向所有审批人发送站内通知，提示其前往审批。"""
    _emit_approval_request("workflow.requested", record, issue, approver_ids)
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
    _emit_approval_request("workflow.reset", record, issue, approver_ids)
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


def _initiator_labels(principals) -> list:
    """发起人配置的展示名（角色名 / 成员名 / 动态对象），给「仅 X 可发起」的提示用。"""
    # 动态对象的中文名与流程图共用一份
    from plane.app.serializers.workflow import DYNAMIC_TARGET_LABELS

    labels = []
    for principal in principals:
        if principal.kind == WorkflowPrincipalKind.ROLE and principal.job_role_id:
            labels.append(principal.job_role.label)
        elif principal.kind == WorkflowPrincipalKind.MEMBER and principal.member_id:
            labels.append(principal.member.display_name or principal.member.email)
        elif principal.kind == WorkflowPrincipalKind.DYNAMIC and principal.dynamic_target:
            labels.append(DYNAMIC_TARGET_LABELS.get(principal.dynamic_target, principal.dynamic_target))
    return list(dict.fromkeys(label for label in labels if label))


def list_available_transitions(issue: Issue, user) -> list:
    """
    这个工作项从当前状态出发的全部流转（详情页的流转按钮），按目标状态顺序。
    当前用户不是发起人的也返回，can_initiate=False，前端置灰并提示谁可以发起。
    其余规则（必填字段 / 目标负责人 / 审批）只给前端提示，提交时仍由 check_update_state_permission 校验。
    """
    workflow = get_active_workflow(issue)
    if not workflow:
        return []

    transitions = list(
        WorkflowTransition.objects.filter(workflow=workflow, from_state_id=issue.state_id)
        .select_related("to_state")
        .order_by("to_state__sequence", "created_at")
    )
    if not transitions:
        return []

    # 详情页一打开就要用，尽量少查：各条流转的发起人 / 目标负责人、必填字段一次取完，
    # 同一个工作项反复用到的查询（关联产品、按角色找人、在职成员）经 memo 只查一次
    principals_by_key = {}
    for principal in WorkflowTransitionPrincipal.objects.filter(
        transition__in=transitions,
        dimension__in=[WorkflowPrincipalDimension.INITIATOR, WorkflowPrincipalDimension.ASSIGNEE],
        deleted_at__isnull=True,
    ).select_related("member", "job_role"):
        principals_by_key.setdefault((principal.transition_id, principal.dimension), []).append(principal)
    required_fields_by_transition = {}
    for item in WorkflowTransitionRequiredField.objects.filter(
        workflow__in=transitions, deleted_at__isnull=True, extra_field__deleted_at__isnull=True
    ).select_related("extra_field"):
        required_fields_by_transition.setdefault(item.workflow_id, []).append(
            {"id": str(item.extra_field_id), "name": item.extra_field.name}
        )
    assignee_ids = get_issue_assignee_ids(issue)
    memo = {"assignee_ids": assignee_ids}
    current_assignee_ids = set(assignee_ids)

    results = []
    for transition in transitions:
        # 发起人维度为空时全员可发起，口径同 _check_transition_initiator
        initiator_principals = principals_by_key.get((transition.id, WorkflowPrincipalDimension.INITIATOR), [])
        can_initiate = not initiator_principals or str(user.id) in set(
            _resolve_principal_user_ids(issue, initiator_principals, memo)
        )

        # 发起不了的只用来置灰展示，不必解析负责人和必填字段
        allowed_assignee_ids = []
        assignee_required = False
        required_fields = []
        if can_initiate:
            assignee_principals = principals_by_key.get((transition.id, WorkflowPrincipalDimension.ASSIGNEE), [])
            if assignee_principals:
                allowed_assignee_ids = _resolve_principal_user_ids(issue, assignee_principals, memo)
                # 配了目标负责人且现负责人不全在允许范围里，就得在流转时重新指定
                assignee_required = not current_assignee_ids.issubset(set(allowed_assignee_ids))
            required_fields = required_fields_by_transition.get(transition.id, [])

        to_state = transition.to_state
        results.append(
            {
                "id": str(transition.id),
                "action_name": transition.action_name or to_state.name,
                "from_state_id": str(issue.state_id) if issue.state_id else None,
                "to_state_id": str(to_state.id),
                "to_state_name": to_state.name,
                "to_state_color": to_state.color,
                "to_state_group": to_state.group,
                "can_initiate": can_initiate,
                "initiator_labels": [] if can_initiate else _initiator_labels(initiator_principals),
                # 「全部通过」在配置页表示没配审批人，后端同样直接放行
                "requires_approval": transition.approval_type in (ApprovalType.ANY, ApprovalType.N_OF_M),
                "required_fields": required_fields,
                "assignee_required": assignee_required,
                "allowed_assignee_ids": allowed_assignee_ids,
            }
        )
    return results


def _cancel_transition_records(records, issue: Issue, cancelled_by, project_id, comment, reason) -> int:
    """把给定的待审批记录置为已取消，写活动日志并发通知。"""
    if not records:
        return 0

    IssueTransitionRecord.objects.filter(id__in=[r.id for r in records]).update(
        status=TransitionRecordStatus.CANCELLED,
        completed_at=timezone.now(),
    )

    activities = []
    for record in records:
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
                comment=f"{comment}（{from_name} → {to_name}）",
                project_id=project_id,
                workspace_id=issue.workspace_id,
                epoch=int(timezone.now().timestamp()),
            )
        )
    IssueActivity.objects.bulk_create(activities, batch_size=100)
    for record in records:
        _emit_approval_result("workflow.cancelled", record, cancelled_by, reason=reason)
    return len(records)


def withdraw_transition_record(record_id, user, project_id):
    """
    发起人撤回自己的待审批流转。
    与 approve_transition_record 同样在事务里锁住记录再判状态，避免和最后一票「通过」同时提交时
    把已通过（状态已落库）的记录又改成已取消。
    返回: (ok: bool, error: str | None, status_code: int)
    """
    with transaction.atomic():
        locked = (
            IssueTransitionRecord.objects.select_for_update(of=("self",))
            .filter(pk=record_id, issue__project_id=project_id, issue__deleted_at__isnull=True)
            .first()
        )
        if not locked:
            return False, "审批记录不存在", 404
        if locked.status != TransitionRecordStatus.PENDING:
            return False, "该审批已处理，无法撤回", 400
        if str(locked.created_by_id) != str(user.id):
            return False, "只有发起人可以撤回审批", 403
        record = IssueTransitionRecord.objects.select_related("issue", "from_state", "to_state", "transition").get(
            pk=locked.pk
        )
        _cancel_transition_records(
            [record], record.issue, user, project_id, comment="发起人撤回了状态流转申请", reason="发起人撤回"
        )
    return True, None, 200


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

    return _cancel_transition_records(
        pending_records,
        issue,
        cancelled_by,
        project_id,
        comment="直接更改状态，已取消待审批流程",
        reason="工作项状态被直接更改",
    )


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
        _emit_approval_result("workflow.rejected", record, acted_by)
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
            _emit_approval_result("workflow.cancelled", record, acted_by, reason=error)
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
            _emit_approval_result("workflow.cancelled", record, acted_by, reason=error)
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
        _emit_approval_result("workflow.approved", record, acted_by)

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
