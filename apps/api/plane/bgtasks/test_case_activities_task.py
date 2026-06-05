from __future__ import annotations

import json
from typing import Optional

from celery import shared_task

from plane.db.models import (
    TestCase,
    TestCaseActivity,
    User,
)
from plane.utils.exception_logger import log_exception
from plane.utils.html_processor import strip_tags
from plane.utils.uuid import is_valid_uuid


_CASE_FIELD_LABELS: dict[str, str] = {
    "name": "名称",
    "type": "用例类型",
    "test_type": "测试类型",
    "priority": "优先级",
    "assignee": "维护人",
    "assignee_id": "维护人",
    "module": "模块",
    "module_id": "模块",
    "labels": "标签",
    "issues": "关联工作项",
    "precondition": "前置条件",
    "steps": "步骤",
    "text_description": "文本描述",
    "text_result": "预期结果",
    "remark": "备注",
    "review": "评审状态",
    "execution": "执行情况",
    "comment": "评论",
    "attachment": "附件",
    "case": "用例",
}

_PRIORITY_LABELS: dict = {
    0: "低",
    1: "中",
    2: "高",
    "0": "低",
    "1": "中",
    "2": "高",
}

_TYPE_LABELS: dict = {
    0: "功能测试",
    1: "性能测试",
    2: "安全测试",
    4: "兼容测试",
    5: "回归测试",
    7: "集成测试",
    99: "其他",
    "0": "功能测试",
    "1": "性能测试",
    "2": "安全测试",
    "4": "兼容测试",
    "5": "回归测试",
    "7": "集成测试",
    "99": "其他",
}

_TEST_TYPE_LABELS: dict = {
    0: "手动",
    1: "自动",
    "0": "手动",
    "1": "自动",
}


def _label_for_field(field: str) -> str:
    return _CASE_FIELD_LABELS.get(field, field)


def _user_display_name(user_id: Optional[str]) -> str:
    if not user_id or not is_valid_uuid(str(user_id)):
        return ""
    user = (
        User.objects.filter(pk=user_id)
        .only("id", "display_name", "first_name", "last_name", "email")
        .first()
    )
    if not user:
        return ""
    return (
        user.display_name
        or (f"{user.first_name or ''} {user.last_name or ''}".strip())
        or user.email
        or ""
    )


def _strip_html(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        return strip_tags(str(value)).strip()
    except Exception:
        return str(value)


def _append(activities, **kwargs):
    activities.append(TestCaseActivity(**kwargs))


def _track_simple_text(
    field: str,
    *,
    requested,
    current,
    case_id,
    actor_id,
    activities,
    epoch,
    label: Optional[str] = None,
):
    if field not in requested:
        return
    old_value = current.get(field)
    new_value = requested.get(field)
    if (old_value or None) == (new_value or None):
        return
    label = label or _label_for_field(field)
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field=field,
        old_value=str(old_value or ""),
        new_value=str(new_value or ""),
        comment=f"更新了{label}",
        epoch=epoch,
    )


def _track_choice_field(
    field: str,
    labels: dict,
    *,
    requested,
    current,
    case_id,
    actor_id,
    activities,
    epoch,
):
    if field not in requested:
        return
    old_raw = current.get(field)
    new_raw = requested.get(field)
    if str(old_raw or "") == str(new_raw or ""):
        return
    label = _label_for_field(field)
    old_label = labels.get(old_raw, str(old_raw or ""))
    new_label = labels.get(new_raw, str(new_raw or ""))
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field=field,
        old_value=old_label,
        new_value=new_label,
        comment=f"更新了{label}",
        epoch=epoch,
    )


def _track_html_field(
    field: str,
    *,
    requested,
    current,
    case_id,
    actor_id,
    activities,
    epoch,
):
    if field not in requested:
        return
    old_value = current.get(field)
    new_value = requested.get(field)
    old_stripped = _strip_html(old_value)
    new_stripped = _strip_html(new_value)
    if (old_stripped or None) == (new_stripped or None):
        return
    label = _label_for_field(field)
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field=field,
        old_value=old_stripped[:512],
        new_value=new_stripped[:512],
        comment=f"更新了{label}",
        epoch=epoch,
    )


def _track_assignee(
    *,
    requested,
    current,
    case_id,
    actor_id,
    activities,
    epoch,
):
    if "assignee_id" not in requested and "assignee" not in requested:
        return
    new_val = requested.get("assignee_id") if "assignee_id" in requested else requested.get("assignee")
    old_val = current.get("assignee_id") or current.get("assignee")
    if str(new_val or "") == str(old_val or ""):
        return
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field="assignee",
        old_value=_user_display_name(old_val),
        new_value=_user_display_name(new_val),
        old_identifier=old_val if is_valid_uuid(str(old_val or "")) else None,
        new_identifier=new_val if is_valid_uuid(str(new_val or "")) else None,
        comment="更新了维护人",
        epoch=epoch,
    )


def create_case_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="created",
        field="case",
        comment="创建了用例",
        new_identifier=case_id,
        epoch=epoch,
    )


def update_case_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    current = json.loads(current_instance) if current_instance else {}

    common = dict(
        case_id=case_id,
        actor_id=actor_id,
        activities=activities,
        epoch=epoch,
    )

    _track_simple_text("name", requested=requested, current=current, **common)
    _track_html_field("precondition", requested=requested, current=current, **common)
    _track_html_field("text_description", requested=requested, current=current, **common)
    _track_html_field("text_result", requested=requested, current=current, **common)
    _track_html_field("remark", requested=requested, current=current, **common)
    _track_choice_field("priority", _PRIORITY_LABELS, requested=requested, current=current, **common)
    _track_choice_field("type", _TYPE_LABELS, requested=requested, current=current, **common)
    _track_choice_field("test_type", _TEST_TYPE_LABELS, requested=requested, current=current, **common)
    _track_assignee(requested=requested, current=current, **common)

    # labels: 对比 label id 列表
    if "labels" in requested:
        old_labels = set(str(x) for x in (current.get("labels") or []))
        new_labels = set(str(x) for x in (requested.get("labels") or []))
        if old_labels != new_labels:
            _append(
                activities,
                case_id=case_id,
                actor_id=actor_id,
                verb="updated",
                field="labels",
                old_value=",".join(sorted(old_labels)),
                new_value=",".join(sorted(new_labels)),
                comment="更新了标签",
                epoch=epoch,
            )

    # module
    if "module" in requested or "module_id" in requested:
        old_val = current.get("module_id") or current.get("module")
        new_val = requested.get("module_id") if "module_id" in requested else requested.get("module")
        if str(old_val or "") != str(new_val or ""):
            _append(
                activities,
                case_id=case_id,
                actor_id=actor_id,
                verb="updated",
                field="module",
                old_value=str(old_val or ""),
                new_value=str(new_val or ""),
                old_identifier=old_val if is_valid_uuid(str(old_val or "")) else None,
                new_identifier=new_val if is_valid_uuid(str(new_val or "")) else None,
                comment="更新了模块",
                epoch=epoch,
            )


def delete_case_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="deleted",
        field="case",
        old_value=current.get("name") or "",
        comment="删除了用例",
        epoch=epoch,
    )


def create_case_comment_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    comment_id = requested.get("id")
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="created",
        field="comment",
        new_value=_strip_html(requested.get("comment_html"))[:512],
        new_identifier=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        test_case_comment_id=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        comment="新增了评论",
        epoch=epoch,
    )


def delete_case_comment_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    comment_id = current.get("id")
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="deleted",
        field="comment",
        old_value=_strip_html(current.get("comment_html"))[:512],
        old_identifier=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        comment="删除了评论",
        epoch=epoch,
    )


def case_review_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    """评审状态变更活动（由 CaseReviewView 和 re_approval_case 触发）。"""
    requested = json.loads(requested_data) if requested_data else {}
    old_value = requested.get("old_review") or ""
    new_value = requested.get("new_review") or ""
    if old_value == new_value:
        return
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field="review",
        old_value=old_value,
        new_value=new_value,
        comment=f"评审状态变更：{old_value or '未开始'} → {new_value}",
        epoch=epoch,
    )


def case_execution_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    """执行情况变更活动（由 PlanView.execute 触发）。"""
    requested = json.loads(requested_data) if requested_data else {}
    old_value = requested.get("old_result") or ""
    new_value = requested.get("new_result") or ""
    if old_value == new_value:
        return
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="updated",
        field="execution",
        old_value=old_value,
        new_value=new_value,
        comment=f"执行情况变更：{old_value or '未执行'} → {new_value}",
        epoch=epoch,
    )


def create_case_attachment_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    asset_id = current.get("id")
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="created",
        field="attachment",
        new_value=current.get("name") or current.get("filename") or "",
        new_identifier=asset_id if is_valid_uuid(str(asset_id or "")) else None,
        comment="新增了附件",
        epoch=epoch,
    )


def delete_case_attachment_activity(
    *,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    asset_id = current.get("id")
    _append(
        activities,
        case_id=case_id,
        actor_id=actor_id,
        verb="deleted",
        field="attachment",
        old_value=current.get("name") or current.get("filename") or "",
        old_identifier=asset_id if is_valid_uuid(str(asset_id or "")) else None,
        comment="删除了附件",
        epoch=epoch,
    )


ACTIVITY_MAPPER = {
    "case.activity.created": create_case_activity,
    "case.activity.updated": update_case_activity,
    "case.activity.deleted": delete_case_activity,
    "case_comment.activity.created": create_case_comment_activity,
    "case_comment.activity.deleted": delete_case_comment_activity,
    "case_review.activity.updated": case_review_activity,
    "case_execution.activity.updated": case_execution_activity,
    "case_attachment.activity.created": create_case_attachment_activity,
    "case_attachment.activity.deleted": delete_case_attachment_activity,
}


@shared_task
def test_case_activity(
    type,
    requested_data,
    current_instance,
    case_id,
    actor_id,
    epoch,
):
    try:
        if not case_id or not is_valid_uuid(str(case_id)):
            return

        if not TestCase.all_objects.filter(pk=case_id).exists():
            return

        func = ACTIVITY_MAPPER.get(type)
        if func is None:
            return

        activities: list[TestCaseActivity] = []
        func(
            requested_data=requested_data,
            current_instance=current_instance,
            case_id=case_id,
            actor_id=actor_id,
            activities=activities,
            epoch=epoch,
        )

        if activities:
            TestCaseActivity.objects.bulk_create(activities, batch_size=100)
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
