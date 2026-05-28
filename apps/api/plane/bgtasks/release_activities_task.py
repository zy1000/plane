# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""发布活动（动态）后台 task。

参照 plane.bgtasks.issue_activities_task 的设计，把发布生命周期里需要追踪的事件
统一收口到一个 celery shared_task `release_activity`，由视图层 / 工具层通过
`release_activity.delay(...)` 投递事件。

事件包括：
- 发布的创建 / 删除 / 属性变更（名称、描述、发布日志、状态、负责人、日期）
- 发布评论的新增 / 删除
- 发布附件的新增 / 删除
- 工作项关联的新增 / 删除
- 延期记录的开启 / 关闭
"""

from __future__ import annotations

import json
from typing import Optional

from celery import shared_task

from plane.db.models import (
    Project,
    Release,
    ReleaseActivity,
    ReleaseStatus,
    User,
)
from plane.utils.exception_logger import log_exception
from plane.utils.html_processor import strip_tags
from plane.utils.uuid import is_valid_uuid


_RELEASE_FIELD_LABELS = {
    "name": "名称",
    "description": "描述",
    "description_html": "描述",
    "note": "发布日志",
    "status": "状态",
    "lead_id": "负责人",
    "lead": "负责人",
    "start_date": "开始时间",
    "target_date": "结束时间",
    "test_handoff_date": "转测日期",
    "attachment": "附件",
    "release_issue": "关联工作项",
    "release_plan": "关联测试计划",
    "release_cycle": "关联迭代",
    "comment": "评论",
    "overdue": "延期记录",
    "release": "发布",
}

_RELEASE_STATUS_LABELS = {value: label for value, label in ReleaseStatus.choices}

_OVERDUE_PHASE_LABELS = {
    "dev": "研发延期",
    "test": "测试延期",
}


def _label_for_field(field: str) -> str:
    return _RELEASE_FIELD_LABELS.get(field, field)


def _label_for_status(value: Optional[str]) -> str:
    if not value:
        return ""
    return _RELEASE_STATUS_LABELS.get(value, str(value))


def _user_display_name(user_id: Optional[str]) -> str:
    """根据 user_id 返回 display_name；解析失败返回空字符串。"""
    if not user_id or not is_valid_uuid(str(user_id)):
        return ""
    user = User.objects.filter(pk=user_id).only(
        "id", "display_name", "first_name", "last_name", "email"
    ).first()
    if not user:
        return ""
    return user.display_name or (
        f"{user.first_name or ''} {user.last_name or ''}".strip()
    ) or user.email or ""


def _strip_html(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        return strip_tags(str(value)).strip()
    except Exception:
        return str(value)


# ---------------------------------------------------------------------------
# Field-level trackers (mirror IssueActivity track_*)
# ---------------------------------------------------------------------------


def _append(activities, **kwargs):
    activities.append(ReleaseActivity(**kwargs))


def _track_simple_text(
    field: str,
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
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
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field=field,
        old_value=old_value or "",
        new_value=new_value or "",
        comment=f"更新了{label}",
        epoch=epoch,
    )


def _track_description(
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "description_html" in requested:
        new_html = requested.get("description_html")
        old_html = current.get("description_html")
    elif "description" in requested:
        new_html = requested.get("description")
        old_html = current.get("description")
    else:
        return
    if (old_html or None) == (new_html or None):
        return
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="description",
        old_value=_strip_html(old_html),
        new_value=_strip_html(new_html),
        comment="更新了描述",
        epoch=epoch,
    )


def _track_note(
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "note" not in requested:
        return
    old_value = current.get("note")
    new_value = requested.get("note")
    if (old_value or None) == (new_value or None):
        return
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="note",
        old_value=_strip_html(old_value),
        new_value=_strip_html(new_value),
        comment="更新了发布日志",
        epoch=epoch,
    )


def _track_status(
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "status" not in requested:
        return
    old_value = current.get("status")
    new_value = requested.get("status")
    if old_value == new_value:
        return
    extra: dict = {}
    raw_reason = requested.get("status_change_reason")
    if raw_reason is not None:
        reason = str(raw_reason).strip()
        if reason:
            extra["reason"] = reason
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="status",
        old_value=_label_for_status(old_value),
        new_value=_label_for_status(new_value),
        comment="更新了状态",
        epoch=epoch,
        extra=extra,
    )


def _track_lead(
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "lead_id" not in requested and "lead" not in requested:
        return
    new_lead = requested.get("lead_id") if "lead_id" in requested else requested.get("lead")
    old_lead = current.get("lead_id") or current.get("lead")
    if str(new_lead or "") == str(old_lead or ""):
        return
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="lead",
        old_value=_user_display_name(old_lead),
        new_value=_user_display_name(new_lead),
        old_identifier=old_lead if is_valid_uuid(str(old_lead or "")) else None,
        new_identifier=new_lead if is_valid_uuid(str(new_lead or "")) else None,
        comment="更新了负责人",
        epoch=epoch,
    )


def _track_date(
    field: str,
    *,
    requested,
    current,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if field not in requested:
        return
    old_value = current.get(field)
    new_value = requested.get(field)
    if (old_value or None) == (new_value or None):
        return
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field=field,
        old_value=str(old_value or ""),
        new_value=str(new_value or ""),
        comment=f"更新了{_label_for_field(field)}",
        epoch=epoch,
    )


# ---------------------------------------------------------------------------
# Top-level event handlers
# ---------------------------------------------------------------------------


def create_release_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="release",
        comment="创建了发布",
        new_identifier=release_id,
        epoch=epoch,
    )


def update_release_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    current = json.loads(current_instance) if current_instance else {}

    common = dict(
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        activities=activities,
        epoch=epoch,
    )

    _track_simple_text("name", requested=requested, current=current, **common)
    _track_description(requested=requested, current=current, **common)
    _track_note(requested=requested, current=current, **common)
    _track_status(requested=requested, current=current, **common)
    _track_lead(requested=requested, current=current, **common)
    _track_date("start_date", requested=requested, current=current, **common)
    _track_date("target_date", requested=requested, current=current, **common)
    _track_date("test_handoff_date", requested=requested, current=current, **common)


def delete_release_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="release",
        old_value=current.get("name") or "",
        comment="删除了发布",
        epoch=epoch,
    )


def create_release_comment_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    comment_id = requested.get("id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="comment",
        new_value=_strip_html(requested.get("comment_html"))[:512],
        new_identifier=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        release_comment_id=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        comment="新增了评论",
        epoch=epoch,
    )


def delete_release_comment_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    comment_id = current.get("id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="comment",
        old_value=_strip_html(current.get("comment_html"))[:512],
        old_identifier=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        comment="删除了评论",
        epoch=epoch,
    )


def create_release_attachment_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    asset_id = current.get("id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="attachment",
        new_value=current.get("name") or "",
        new_identifier=asset_id if is_valid_uuid(str(asset_id or "")) else None,
        comment="新增了附件",
        epoch=epoch,
    )


def delete_release_attachment_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    asset_id = current.get("id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="attachment",
        old_value=current.get("name") or "",
        old_identifier=asset_id if is_valid_uuid(str(asset_id or "")) else None,
        comment="删除了附件",
        epoch=epoch,
    )


def create_release_issues_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    """关联工作项的批量记录（一条活动汇总）。"""
    requested = json.loads(requested_data) if requested_data else {}
    names = requested.get("issue_names") or []
    count = len(names) or int(requested.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="release_issue",
        new_value=summary or "",
        comment=f"新增了 {count or len(names)} 个关联工作项" if (count or names) else "新增了关联工作项",
        epoch=epoch,
    )


def delete_release_issues_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    names = current.get("issue_names") or []
    count = len(names) or int(current.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="release_issue",
        old_value=summary or "",
        comment=f"移除了 {count or len(names)} 个关联工作项" if (count or names) else "移除了关联工作项",
        epoch=epoch,
    )


def create_release_plans_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    """关联测试计划的批量记录（一条活动汇总）。"""
    requested = json.loads(requested_data) if requested_data else {}
    names = requested.get("plan_names") or []
    count = len(names) or int(requested.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="release_plan",
        new_value=summary or "",
        comment=f"新增了 {count or len(names)} 个关联测试计划" if (count or names) else "新增了关联测试计划",
        epoch=epoch,
    )


def delete_release_plans_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    names = current.get("plan_names") or []
    count = len(names) or int(current.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="release_plan",
        old_value=summary or "",
        comment=f"移除了 {count or len(names)} 个关联测试计划" if (count or names) else "移除了关联测试计划",
        epoch=epoch,
    )


def create_release_cycles_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    """关联迭代的批量记录（一条活动汇总）。"""
    requested = json.loads(requested_data) if requested_data else {}
    names = requested.get("cycle_names") or []
    count = len(names) or int(requested.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="release_cycle",
        new_value=summary or "",
        comment=f"新增了 {count or len(names)} 个关联迭代" if (count or names) else "新增了关联迭代",
        epoch=epoch,
    )


def delete_release_cycles_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    names = current.get("cycle_names") or []
    count = len(names) or int(current.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="release_cycle",
        old_value=summary or "",
        comment=f"移除了 {count or len(names)} 个关联迭代" if (count or names) else "移除了关联迭代",
        epoch=epoch,
    )


def create_release_overdue_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    phase = requested.get("phase") or ""
    phase_label = _OVERDUE_PHASE_LABELS.get(phase, phase)
    record_id = requested.get("record_id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="overdue",
        new_value=phase_label,
        new_identifier=record_id if is_valid_uuid(str(record_id or "")) else None,
        comment=f"开启了{phase_label}",
        epoch=epoch,
    )


def close_release_overdue_activity(
    *,
    requested_data,
    current_instance,
    release_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    phase = requested.get("phase") or ""
    phase_label = _OVERDUE_PHASE_LABELS.get(phase, phase)
    record_id = requested.get("record_id")
    _append(
        activities,
        release_id=release_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="closed",
        field="overdue",
        old_value=phase_label,
        old_identifier=record_id if is_valid_uuid(str(record_id or "")) else None,
        comment=f"关闭了{phase_label}",
        epoch=epoch,
    )


# ---------------------------------------------------------------------------
# Celery entry point
# ---------------------------------------------------------------------------


ACTIVITY_MAPPER = {
    "release.activity.created": create_release_activity,
    "release.activity.updated": update_release_activity,
    "release.activity.deleted": delete_release_activity,
    "release_comment.activity.created": create_release_comment_activity,
    "release_comment.activity.deleted": delete_release_comment_activity,
    "release_attachment.activity.created": create_release_attachment_activity,
    "release_attachment.activity.deleted": delete_release_attachment_activity,
    "release_issue.activity.created": create_release_issues_activity,
    "release_issue.activity.deleted": delete_release_issues_activity,
    "release_plan.activity.created": create_release_plans_activity,
    "release_plan.activity.deleted": delete_release_plans_activity,
    "release_cycle.activity.created": create_release_cycles_activity,
    "release_cycle.activity.deleted": delete_release_cycles_activity,
    "release_overdue.activity.opened": create_release_overdue_activity,
    "release_overdue.activity.closed": close_release_overdue_activity,
}


@shared_task
def release_activity(
    type,
    requested_data,
    current_instance,
    release_id,
    actor_id,
    project_id,
    epoch,
):
    """统一入口：根据事件类型把活动条目落库。

    requested_data / current_instance 均为 JSON 字符串（或 None），由调用方自行 dumps。
    actor_id 为 None 时代表系统操作（例如延期扫描）。
    """
    try:
        if not project_id or not is_valid_uuid(str(project_id)):
            return
        if not release_id or not is_valid_uuid(str(release_id)):
            return

        project = Project.objects.filter(pk=project_id).only("id", "workspace_id").first()
        if not project:
            return
        workspace_id = project.workspace_id

        if not Release.all_objects.filter(pk=release_id, project_id=project_id).exists():
            return

        func = ACTIVITY_MAPPER.get(type)
        if func is None:
            return

        activities: list[ReleaseActivity] = []
        func(
            requested_data=requested_data,
            current_instance=current_instance,
            release_id=release_id,
            project_id=project_id,
            workspace_id=workspace_id,
            actor_id=actor_id,
            activities=activities,
            epoch=epoch,
        )

        if activities:
            ReleaseActivity.objects.bulk_create(activities, batch_size=100)
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
