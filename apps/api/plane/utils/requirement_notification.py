"""需求审批的站内通知。

改造之前一个产品同时只有一张待审单，审批人进产品页就能看见，所以这套流程一条通知都
没有。下沉到条目之后审批人面对的是 N 张小单 —— 不通知就只能靠人主动去「变更」页签
轮询，单子会烂在那里。

通知的实体是**变更单**而不是需求：一张单可能覆盖好几条需求，按需求发会让审批人为同
一件事收到三条。点击后跳到变更单详情。

同步写入，与审批动作在同一个事务里 —— 它们只是几行 INSERT，异步化换不来什么，却会带
来「审批成功但通知丢了」这种不一致。
"""

from plane.db.models import Notification, RequirementChangeStatus


ENTITY_NAME = "requirement_change_request"

SENDER_REQUESTED = "in_app:requirement_approval:requested"
SENDER_APPROVED = "in_app:requirement_approval:approved"
SENDER_REJECTED = "in_app:requirement_approval:rejected"
SENDER_WITHDRAWN = "in_app:requirement_approval:withdrawn"

FIELD_REQUESTED = "requirement_approval_request"
FIELD_APPROVED = "requirement_approval_approved"
FIELD_REJECTED = "requirement_approval_rejected"
FIELD_WITHDRAWN = "requirement_approval_withdrawn"


def _requirement_titles(change_request, limit=3):
    """标题里点几条需求的名字，比只说「3 条需求」有用得多。"""
    titles = []
    for item in list(change_request.items.all())[:limit]:
        snapshot = item.proposed_snapshot or item.before_snapshot or {}
        title = (snapshot.get("title") or "").strip()
        if title:
            titles.append(title)
    return titles


def _payload(change_request, *, field, actor_id, summary):
    """通知载荷。

    issue_activity 那一层不是历史包袱就是包袱 —— 前端的通知卡片以
    `data.issue_activity.field` 作为渲染开关（见 notification-card/item.tsx），缺了它
    整张卡片会静默不渲染。这里按同样的形状填，字段名沿用它的约定。
    """
    titles = _requirement_titles(change_request)
    return {
        "requirement_change_request": {
            "id": str(change_request.id),
            "sequence_id": change_request.sequence_id,
            "product_id": str(change_request.product_id) if change_request.product_id else None,
            "project_id": str(change_request.project_id) if change_request.project_id else None,
            "reason": change_request.reason or "",
            "requirement_count": (
                change_request.created_count
                + change_request.updated_count
                + change_request.deleted_count
            ),
            "requirement_titles": titles,
        },
        "issue_activity": {
            "id": str(change_request.id),
            "verb": "created",
            "field": field,
            "actor": str(actor_id) if actor_id else "",
            "new_value": summary,
            "old_value": "",
            "issue_comment": "",
            "old_identifier": None,
            "new_identifier": None,
        },
    }


def _summary(change_request):
    titles = _requirement_titles(change_request, limit=1)
    total = (
        change_request.created_count
        + change_request.updated_count
        + change_request.deleted_count
    )
    if not titles:
        return f"CR-{change_request.sequence_id}"
    if total <= 1:
        return titles[0]
    return f"{titles[0]} 等 {total} 条"


def _create(change_request, *, receiver_ids, sender, field, actor, title):
    receiver_ids = [
        receiver_id
        for receiver_id in dict.fromkeys(receiver_ids)
        # 不给自己发 —— 自己刚做完这个动作
        if receiver_id and (actor is None or receiver_id != actor.id)
    ]
    if not receiver_ids:
        return

    payload = _payload(
        change_request,
        field=field,
        actor_id=getattr(actor, "id", None),
        summary=_summary(change_request),
    )
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=change_request.workspace_id,
                # 需求归产品，没有 project —— 通知卡片必须容忍 project 为空
                project=None,
                sender=sender,
                triggered_by=actor,
                receiver_id=receiver_id,
                entity_identifier=change_request.id,
                entity_name=ENTITY_NAME,
                title=title,
                data=payload,
            )
            for receiver_id in receiver_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def notify_review_requested(change_request, *, actor=None):
    """提交评审：通知这张单的全部审批人。"""
    _create(
        change_request,
        receiver_ids=[
            approval.approver_id for approval in change_request.approvals.all()
        ],
        sender=SENDER_REQUESTED,
        field=FIELD_REQUESTED,
        actor=actor,
        title=f"需要你审批变更单 CR-{change_request.sequence_id}：{_summary(change_request)}",
    )


def notify_review_settled(change_request, *, actor=None):
    """审批有结论：通知提交人。

    只在**最终**结论时调用 —— N_OF_M 规则下前几个人点通过并不代表这张单settled，
    那时给提交人发通知只会造成「以为过了结果没过」。
    """
    if change_request.status == RequirementChangeStatus.APPROVED:
        sender, field, verb = SENDER_APPROVED, FIELD_APPROVED, "已通过"
    elif change_request.status == RequirementChangeStatus.REJECTED:
        sender, field, verb = SENDER_REJECTED, FIELD_REJECTED, "被驳回"
    else:
        return
    _create(
        change_request,
        receiver_ids=[change_request.created_by_id],
        sender=sender,
        field=field,
        actor=actor,
        title=f"变更单 CR-{change_request.sequence_id} {verb}：{_summary(change_request)}",
    )


def notify_review_withdrawn(change_request, *, actor=None):
    """撤回：通知还没表态的审批人，免得他们对着一张已经作废的单发呆。"""
    _create(
        change_request,
        receiver_ids=[
            approval.approver_id
            for approval in change_request.approvals.all()
            if not approval.action
        ],
        sender=SENDER_WITHDRAWN,
        field=FIELD_WITHDRAWN,
        actor=actor,
        title=f"变更单 CR-{change_request.sequence_id} 已被撤回：{_summary(change_request)}",
    )


def notify_rejected_by_approver(change_request, *, actor=None):
    """任一拒绝即驳回，其余审批人也该知道这张单已经不用看了。"""
    _create(
        change_request,
        receiver_ids=[
            approval.approver_id
            for approval in change_request.approvals.all()
            if not approval.action
        ],
        sender=SENDER_REJECTED,
        field=FIELD_REJECTED,
        actor=actor,
        title=f"变更单 CR-{change_request.sequence_id} 已被驳回：{_summary(change_request)}",
    )
