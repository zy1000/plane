# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""迭代 / 发布的状态、排期、负责人、延期通知。

任务名和参数保持原样（视图和延期扫描都在调），发给谁、即时还是进摘要由统一通知入口的规则决定
（``plane/utils/notify/rules.py``），这里只负责把事件说清楚。
"""

# Python imports
from datetime import datetime

from celery import shared_task

# Module imports
from plane.db.models import Cycle, Release, User
from plane.utils.notify import emit


# Keep in sync with ``plane.utils.cycle_status.CYCLE_STATUS_EMAIL_WHITELIST``.
CYCLE_STATUS_EMAIL_WHITELIST = {
    Cycle.Status.IN_PROGRESS,
    Cycle.Status.TESTING,
    Cycle.Status.RETURNED,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}

RELEASE_STATUS_EMAIL_WHITELIST = {
    "in-progress",
    "pending-test",
    "rejected",
    "completed",
    "cancelled",
}

# Maps raw stored statuses to human-friendly Chinese labels used in emails.
CYCLE_STATUS_LABELS = {
    Cycle.Status.NOT_STARTED: "未开始",
    Cycle.Status.IN_PROGRESS: "进行中",
    Cycle.Status.TESTING: "测试中",
    Cycle.Status.RETURNED: "已退回",
    Cycle.Status.COMPLETED: "已完成",
    Cycle.Status.CANCELLED: "已取消",
}

RELEASE_STATUS_LABELS = {
    "not-started": "未开始",
    "in-progress": "进行中",
    "pending-test": "待测试",
    "testing": "测试中",
    "rejected": "已驳回",
    "completed": "已完成",
    "cancelled": "已取消",
}

RELEASE_OVERDUE_PHASE_LABELS = {
    "dev": "研发延期",
    "test": "测试延期",
}

CYCLE_OVERDUE_PHASE_LABELS = {
    "dev": "研发延期",
    "test": "测试延期",
}

# Redis key prefix for stashing the origin URL used to render links.
CYCLE_ORIGIN_REDIS_PREFIX = "cycle_status_email_origin"
RELEASE_ORIGIN_REDIS_PREFIX = "release_status_email_origin"


def _user_display_name(user_id):
    if not user_id:
        return ""
    user = User.objects.filter(pk=user_id).only("id", "display_name", "first_name", "last_name", "email").first()
    if not user:
        return ""
    return user.display_name or f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email or ""


def _normalize_date_value(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if hasattr(value, "isoformat"):
        value = value.isoformat()
    raw_value = str(value).strip()
    if not raw_value:
        return None
    return raw_value[:10]


def _date_changes(pairs):
    """[(标签, 旧值, 新值)] → 「开始时间 11-03 → 11-05；结束时间 …」；没有变化返回空串。"""
    parts = []
    for label, old_value, new_value in pairs:
        old_date, new_date = _normalize_date_value(old_value), _normalize_date_value(new_value)
        if old_date != new_date:
            parts.append(f"{label} {old_date or '未设置'} → {new_date or '未设置'}")
    return "；".join(parts)


def _plan_range(start, end):
    start, end = _normalize_date_value(start), _normalize_date_value(end)
    return f"{start or '未设置'} 至 {end or '未设置'}"


def _upcoming_summary(deadline_label, deadline_date, remaining_days):
    return f"{deadline_label} {_normalize_date_value(deadline_date) or ''}，还剩 {remaining_days} 天"


@shared_task
def dispatch_cycle_status_email(cycle_id, actor_id, old_status, new_status, origin):
    if new_status not in CYCLE_STATUS_EMAIL_WHITELIST:
        return
    # 转测、完成是节点事件，规则里单列；其余状态变化只进摘要
    event = {Cycle.Status.TESTING: "cycle.testing", Cycle.Status.COMPLETED: "cycle.completed"}.get(
        new_status, "cycle.status_changed"
    )
    old_label = CYCLE_STATUS_LABELS.get(old_status, old_status)
    new_label = CYCLE_STATUS_LABELS.get(new_status, new_status)
    emit(event, "cycle", cycle_id, actor_id=actor_id, summary=f"状态 {old_label} → {new_label}", origin=origin)


@shared_task
def dispatch_release_status_email(release_id, actor_id, old_status, new_status, origin):
    if new_status not in RELEASE_STATUS_EMAIL_WHITELIST:
        return
    event = {"pending-test": "release.testing", "completed": "release.completed"}.get(
        new_status, "release.status_changed"
    )
    old_label = RELEASE_STATUS_LABELS.get(old_status, old_status)
    new_label = RELEASE_STATUS_LABELS.get(new_status, new_status)
    emit(event, "release", release_id, actor_id=actor_id, summary=f"状态 {old_label} → {new_label}", origin=origin)


@shared_task
def dispatch_cycle_created_email(cycle_id, actor_id, origin):
    cycle = Cycle.objects.filter(pk=cycle_id).first()
    if not cycle:
        return
    emit(
        "cycle.created",
        "cycle",
        cycle_id,
        actor_id=actor_id,
        summary="新建了迭代",
        details=[("计划时间", _plan_range(cycle.start_date, cycle.end_date))],
        origin=origin,
    )


@shared_task
def dispatch_release_created_email(release_id, actor_id, origin):
    release = Release.objects.filter(pk=release_id).first()
    if not release:
        return
    emit(
        "release.created",
        "release",
        release_id,
        actor_id=actor_id,
        summary="新建了发布",
        details=[("计划时间", _plan_range(release.start_date, release.target_date))],
        origin=origin,
    )


@shared_task
def dispatch_cycle_schedule_email(cycle_id, actor_id, origin, old_start_date, old_end_date):
    cycle = Cycle.objects.filter(pk=cycle_id).first()
    if not cycle:
        return
    summary = _date_changes((("开始时间", old_start_date, cycle.start_date), ("结束时间", old_end_date, cycle.end_date)))
    if summary:
        emit("cycle.schedule_changed", "cycle", cycle_id, actor_id=actor_id, summary=summary, origin=origin)


@shared_task
def dispatch_release_schedule_email(
    release_id, actor_id, origin, old_start_date, old_target_date, old_test_handoff_date
):
    release = Release.objects.filter(pk=release_id).first()
    if not release:
        return
    summary = _date_changes(
        (
            ("开始时间", old_start_date, release.start_date),
            ("目标时间", old_target_date, release.target_date),
            ("转测日期", old_test_handoff_date, release.test_handoff_date),
        )
    )
    if summary:
        emit("release.schedule_changed", "release", release_id, actor_id=actor_id, summary=summary, origin=origin)


@shared_task
def dispatch_cycle_overdue_email(cycle_id, phase=None, actor_id=None, origin=None):
    emit(
        "cycle.overdue",
        "cycle",
        cycle_id,
        actor_id=actor_id,
        summary=CYCLE_OVERDUE_PHASE_LABELS.get(phase, phase) or "已延期",
        origin=origin,
    )


@shared_task
def dispatch_release_overdue_email(release_id, phase, actor_id=None, origin=None):
    emit(
        "release.overdue",
        "release",
        release_id,
        actor_id=actor_id,
        summary=RELEASE_OVERDUE_PHASE_LABELS.get(phase, phase) or "已延期",
        origin=origin,
    )


@shared_task
def dispatch_cycle_upcoming_overdue_email(
    cycle_id,
    phase,
    deadline_label,
    deadline_date,
    remaining_days,
    reminder_key,
    reminder_slot,
    actor_id=None,
    origin=None,
):
    emit(
        "cycle.upcoming_overdue",
        "cycle",
        cycle_id,
        actor_id=actor_id,
        summary=_upcoming_summary(deadline_label, deadline_date, remaining_days),
        origin=origin,
    )


@shared_task
def dispatch_release_upcoming_overdue_email(
    release_id,
    phase,
    deadline_label,
    deadline_date,
    remaining_days,
    reminder_key,
    reminder_slot,
    actor_id=None,
    origin=None,
):
    emit(
        "release.upcoming_overdue",
        "release",
        release_id,
        actor_id=actor_id,
        summary=_upcoming_summary(deadline_label, deadline_date, remaining_days),
        origin=origin,
    )


@shared_task
def dispatch_cycle_owner_email(cycle_id, actor_id, old_owner_id, new_owner_id, origin):
    if not new_owner_id:
        return
    emit(
        "cycle.owner_changed",
        "cycle",
        cycle_id,
        actor_id=actor_id,
        summary=f"负责人 {_user_display_name(old_owner_id) or '未设置'} → {_user_display_name(new_owner_id)}",
        extra_roles={"new_owner": [new_owner_id]},
        origin=origin,
    )


@shared_task
def dispatch_release_lead_email(release_id, actor_id, old_lead_id, new_lead_id, origin):
    if not new_lead_id:
        return
    emit(
        "release.owner_changed",
        "release",
        release_id,
        actor_id=actor_id,
        summary=f"负责人 {_user_display_name(old_lead_id) or '未设置'} → {_user_display_name(new_lead_id)}",
        extra_roles={"new_owner": [new_lead_id]},
        origin=origin,
    )
