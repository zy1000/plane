"""评审裁剪的站内通知。

四个时刻发：提交签批（给签批人）、通过 / 驳回 / 撤回（给提交人与其余签批人）。

**同步写入**，与产生它的动作在同一个事务里 —— 它们只是几行 INSERT，异步化换不来
什么，却会带来「签批成功但通知丢了」这种不一致。口径同
``plane/utils/requirement_notification.py``。

载荷形状有一处是硬约束：前端的通知卡片以 ``data.issue_activity.field`` 作为渲染
开关（``notification-card/item.tsx``），缺了它整张卡片会静默不渲染。所以哪怕这里
跟工作项毫无关系，也要按那个形状填一份。
"""

from plane.db.models import Notification, ReviewTailoringApproval


ENTITY_NAME = "review_tailoring"

SENDER_REQUESTED = "in_app:review_tailoring:requested"
SENDER_APPROVED = "in_app:review_tailoring:approved"
SENDER_REJECTED = "in_app:review_tailoring:rejected"
SENDER_WITHDRAWN = "in_app:review_tailoring:withdrawn"

FIELD_REQUESTED = "review_tailoring_approval_request"
FIELD_APPROVED = "review_tailoring_approval_approved"
FIELD_REJECTED = "review_tailoring_approval_rejected"
FIELD_WITHDRAWN = "review_tailoring_approval_withdrawn"


def _payload(tailoring, *, field, actor_id, summary):
    stage_label = getattr(tailoring.stage, "label", "") or ""
    return {
        "review_tailoring": {
            "id": str(tailoring.id),
            "project_id": str(tailoring.project_id),
            "title": tailoring.title,
            "stage_label": stage_label,
            "status": tailoring.status,
            "revision": tailoring.revision,
        },
        "issue_activity": {
            "id": str(tailoring.id),
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


def _summary(tailoring):
    stage_label = getattr(tailoring.stage, "label", "") or ""
    return f"{stage_label} · {tailoring.title}".strip(" ·")


def _round_approver_ids(tailoring, *, only_pending=False):
    queryset = ReviewTailoringApproval.objects.filter(
        tailoring=tailoring, round=tailoring.round
    )
    if only_pending:
        queryset = queryset.filter(action__isnull=True)
    return list(queryset.values_list("approver_id", flat=True))


def _create(tailoring, *, receiver_ids, sender, field, actor, title):
    receiver_ids = [
        receiver_id
        for receiver_id in dict.fromkeys(receiver_ids)
        # 不给自己发 —— 自己刚做完这个动作
        if receiver_id and (actor is None or receiver_id != actor.id)
    ]
    if not receiver_ids:
        return

    payload = _payload(
        tailoring,
        field=field,
        actor_id=getattr(actor, "id", None),
        summary=_summary(tailoring),
    )
    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=tailoring.workspace_id,
                project_id=tailoring.project_id,
                sender=sender,
                triggered_by=actor,
                receiver_id=receiver_id,
                entity_identifier=tailoring.id,
                entity_name=ENTITY_NAME,
                title=title,
                data=payload,
            )
            for receiver_id in receiver_ids
        ],
        batch_size=100,
        ignore_conflicts=True,
    )


def notify_approval_requested(tailoring, *, actor=None):
    """提交签批：通知这一轮的全部签批人。"""
    _create(
        tailoring,
        receiver_ids=_round_approver_ids(tailoring),
        sender=SENDER_REQUESTED,
        field=FIELD_REQUESTED,
        actor=actor,
        title=f"需要你签批裁剪表：{_summary(tailoring)}",
    )


def notify_approval_approved(tailoring, *, actor=None):
    """签批通过（已生效）：通知提交人与其余签批人。"""
    _create(
        tailoring,
        receiver_ids=[tailoring.submitted_by_id, *_round_approver_ids(tailoring)],
        sender=SENDER_APPROVED,
        field=FIELD_APPROVED,
        actor=actor,
        title=f"裁剪表已生效：{_summary(tailoring)}",
    )


def notify_approval_rejected(tailoring, *, actor=None):
    """驳回：通知提交人与其余签批人 —— 任一驳回即退回，其他人不用再看了。"""
    _create(
        tailoring,
        receiver_ids=[tailoring.submitted_by_id, *_round_approver_ids(tailoring)],
        sender=SENDER_REJECTED,
        field=FIELD_REJECTED,
        actor=actor,
        title=f"裁剪表被驳回：{_summary(tailoring)}",
    )


def notify_approval_withdrawn(tailoring, *, actor=None):
    """撤回：通知本轮还没表态的签批人，让他们别再去点。"""
    _create(
        tailoring,
        receiver_ids=_round_approver_ids(tailoring, only_pending=True),
        sender=SENDER_WITHDRAWN,
        field=FIELD_WITHDRAWN,
        actor=actor,
        title=f"裁剪表签批已撤回：{_summary(tailoring)}",
    )
