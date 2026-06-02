# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import json
from typing import Optional

from celery import shared_task

from plane.db.models import (
    Project,
    Cycle,
    CycleActivity,
    User,
)
from plane.utils.exception_logger import log_exception
from plane.utils.html_processor import strip_tags
from plane.utils.uuid import is_valid_uuid


_CYCLE_FIELD_LABELS = {
    "name": "名称",
    "description": "描述",
    "status": "状态",
    "start_date": "开始时间",
    "end_date": "结束时间",
    "suggested_test_scope": "建议测试范围",
    "owned_by": "负责人",
    "owned_by_id": "负责人",
    "attachment": "附件",
    "cycle_issue": "关联工作项",
    "comment": "评论",
    "overdue": "延期记录",
    "cycle": "迭代",
}

def _label_for_field(field: str) -> str:
    return _CYCLE_FIELD_LABELS.get(field, field)


def _label_for_status(value: Optional[str]) -> str:
    if not value:
        return ""
    return str(value)


def _user_display_name(user_id: Optional[str]) -> str:
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


def _append(activities, **kwargs):
    activities.append(CycleActivity(**kwargs))


def _track_simple_text(
    field: str,
    *,
    requested,
    current,
    cycle_id,
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
        cycle_id=cycle_id,
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
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "description" not in requested:
        return
    old_value = current.get("description")
    new_value = requested.get("description")
    if (old_value or None) == (new_value or None):
        return
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="description",
        old_value=_strip_html(old_value),
        new_value=_strip_html(new_value),
        comment="更新了描述",
        epoch=epoch,
    )


def _track_status(
    *,
    requested,
    current,
    cycle_id,
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
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="status",
        old_value=_label_for_status(old_value),
        new_value=_label_for_status(new_value),
        comment="更新了状态",
        epoch=epoch,
    )


def _track_owner(
    *,
    requested,
    current,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    if "owned_by_id" not in requested and "owned_by" not in requested:
        return
    new_owner = requested.get("owned_by_id") if "owned_by_id" in requested else requested.get("owned_by")
    old_owner = current.get("owned_by_id") or current.get("owned_by")
    if str(new_owner or "") == str(old_owner or ""):
        return
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="updated",
        field="owned_by",
        old_value=_user_display_name(old_owner),
        new_value=_user_display_name(new_owner),
        old_identifier=old_owner if is_valid_uuid(str(old_owner or "")) else None,
        new_identifier=new_owner if is_valid_uuid(str(new_owner or "")) else None,
        comment="更新了负责人",
        epoch=epoch,
    )


def _track_date(
    field: str,
    *,
    requested,
    current,
    cycle_id,
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
        cycle_id=cycle_id,
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


def create_cycle_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="cycle",
        comment="创建了迭代",
        new_identifier=cycle_id,
        epoch=epoch,
    )


def update_cycle_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    current = json.loads(current_instance) if current_instance else {}

    common = dict(
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        activities=activities,
        epoch=epoch,
    )

    _track_simple_text("name", requested=requested, current=current, **common)
    _track_description(requested=requested, current=current, **common)
    _track_status(requested=requested, current=current, **common)
    _track_date("start_date", requested=requested, current=current, **common)
    _track_date("end_date", requested=requested, current=current, **common)
    _track_simple_text("suggested_test_scope", requested=requested, current=current, **common)
    _track_owner(requested=requested, current=current, **common)


def delete_cycle_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    current = json.loads(current_instance) if current_instance else {}
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="cycle",
        old_value=current.get("name") or "",
        comment="删除了迭代",
        epoch=epoch,
    )


def create_cycle_comment_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
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
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="comment",
        new_value=_strip_html(requested.get("comment_html"))[:512],
        new_identifier=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        cycle_comment_id=comment_id if is_valid_uuid(str(comment_id or "")) else None,
        comment="新增了评论",
        epoch=epoch,
    )


def delete_cycle_comment_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
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
        cycle_id=cycle_id,
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


def create_cycle_attachment_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
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
        cycle_id=cycle_id,
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


def delete_cycle_attachment_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
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
        cycle_id=cycle_id,
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


def create_cycle_issues_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    names = requested.get("issue_names") or []
    count = len(names) or int(requested.get("count") or 0)
    summary = "、".join(names[:5])
    if len(names) > 5:
        summary += "等"
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="cycle_issue",
        new_value=summary or "",
        comment=f"新增了 {count or len(names)} 个关联工作项" if (count or names) else "新增了关联工作项",
        epoch=epoch,
    )


def delete_cycle_issues_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
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
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="deleted",
        field="cycle_issue",
        old_value=summary or "",
        comment=f"移除了 {count or len(names)} 个关联工作项" if (count or names) else "移除了关联工作项",
        epoch=epoch,
    )


def create_cycle_overdue_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    record_id = requested.get("record_id")
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="created",
        field="overdue",
        new_value="延期记录",
        new_identifier=record_id if is_valid_uuid(str(record_id or "")) else None,
        comment="开启了延期记录",
        epoch=epoch,
    )


def close_cycle_overdue_activity(
    *,
    requested_data,
    current_instance,
    cycle_id,
    project_id,
    workspace_id,
    actor_id,
    activities,
    epoch,
):
    requested = json.loads(requested_data) if requested_data else {}
    record_id = requested.get("record_id")
    _append(
        activities,
        cycle_id=cycle_id,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        verb="closed",
        field="overdue",
        old_value="延期记录",
        old_identifier=record_id if is_valid_uuid(str(record_id or "")) else None,
        comment="关闭了延期记录",
        epoch=epoch,
    )


ACTIVITY_MAPPER = {
    "cycle.activity.created": create_cycle_activity,
    "cycle.activity.updated": update_cycle_activity,
    "cycle.activity.deleted": delete_cycle_activity,
    "cycle_comment.activity.created": create_cycle_comment_activity,
    "cycle_comment.activity.deleted": delete_cycle_comment_activity,
    "cycle_attachment.activity.created": create_cycle_attachment_activity,
    "cycle_attachment.activity.deleted": delete_cycle_attachment_activity,
    "cycle_issue.activity.created": create_cycle_issues_activity,
    "cycle_issue.activity.deleted": delete_cycle_issues_activity,
    "cycle_overdue.activity.opened": create_cycle_overdue_activity,
    "cycle_overdue.activity.closed": close_cycle_overdue_activity,
}


@shared_task
def cycle_activity(
    type,
    requested_data,
    current_instance,
    cycle_id,
    actor_id,
    project_id,
    epoch,
):
    try:
        if not project_id or not is_valid_uuid(str(project_id)):
            return
        if not cycle_id or not is_valid_uuid(str(cycle_id)):
            return

        project = Project.objects.filter(pk=project_id).only("id", "workspace_id").first()
        if not project:
            return
        workspace_id = project.workspace_id

        if not Cycle.all_objects.filter(pk=cycle_id, project_id=project_id).exists():
            return

        func = ACTIVITY_MAPPER.get(type)
        if func is None:
            return

        activities: list[CycleActivity] = []
        func(
            requested_data=requested_data,
            current_instance=current_instance,
            cycle_id=cycle_id,
            project_id=project_id,
            workspace_id=workspace_id,
            actor_id=actor_id,
            activities=activities,
            epoch=epoch,
        )

        if activities:
            CycleActivity.objects.bulk_create(activities, batch_size=100)
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
