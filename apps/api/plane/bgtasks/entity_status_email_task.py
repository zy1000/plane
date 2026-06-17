# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Celery tasks that fan out Cycle/Release email notifications.

All tasks here enqueue one row per receiver into :class:`EmailNotificationLog`.
The Beat aggregator (``stack_email_notification``) later merges and dispatches
the actual emails.
"""

# Python imports
from datetime import datetime, timezone as datetime_timezone

from celery import shared_task
from django.conf import settings

# Module imports
from plane.db.models import (
    Cycle,
    EmailNotificationLog,
    ProjectMember,
    Release,
    User,
    UserNotificationPreference,
)
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception


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


def _filter_eligible_receivers(project_id, candidate_ids, actor_id):
    """Narrow a set of candidate user ids down to people we should email.

    Rules:
    - Exclude the actor that triggered the change (if any).
    - Must be an active member of the project (``ProjectMember.is_active``) -
      protects against stale assignees who no longer belong to the project.
    - Honour ``UserNotificationPreference.state_change``. Missing preference
      rows default to ``True`` (opt-out, not opt-in).
    """
    candidates = {str(cid) for cid in candidate_ids if cid is not None}
    if actor_id:
        candidates.discard(str(actor_id))
    if not candidates:
        return []

    active_ids = set(
        str(mid)
        for mid in ProjectMember.objects.filter(
            project_id=project_id,
            is_active=True,
            member_id__in=candidates,
        ).values_list("member_id", flat=True)
        if mid is not None
    )
    if not active_ids:
        return []

    disabled = set(
        str(uid)
        for uid in UserNotificationPreference.objects.filter(
            user_id__in=active_ids, state_change=False
        ).values_list("user_id", flat=True)
    )
    return [mid for mid in active_ids if mid not in disabled]


def _all_project_member_ids(project_id):
    return {
        str(mid)
        for mid in ProjectMember.objects.filter(
            project_id=project_id,
            is_active=True,
        ).values_list("member_id", flat=True)
        if mid is not None
    }


def _normalize_user_id(user_id):
    return str(user_id) if user_id else None


def _user_display_name(user_id):
    if not user_id:
        return ""
    user = User.objects.filter(pk=user_id).only(
        "id",
        "display_name",
        "first_name",
        "last_name",
        "email",
    ).first()
    if not user:
        return ""
    return (
        user.display_name
        or f"{user.first_name or ''} {user.last_name or ''}".strip()
        or user.email
        or ""
    )


def _now_iso():
    return datetime.now(tz=datetime_timezone.utc).isoformat()


def _default_origin(origin):
    return origin or settings.APP_BASE_URL or settings.WEB_URL or None


def _set_origin(prefix, entity_id, origin):
    if not origin:
        return
    redis_instance().set(
        f"{prefix}:{entity_id}",
        origin,
        ex=7200,
    )


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


def _resolve_cycle_actor_id(cycle, actor_id):
    if actor_id:
        return str(actor_id)
    fallback_actor_id = cycle.owned_by_id or cycle.created_by_id
    return _normalize_user_id(fallback_actor_id)


def _resolve_release_actor_id(release, actor_id):
    if actor_id:
        return str(actor_id)
    fallback_actor_id = release.lead_id or release.created_by_id
    return _normalize_user_id(fallback_actor_id)


def _cycle_payload(cycle, actor_id, origin, event, **kwargs):
    payload = {
        "entity_kind": "cycle",
        "event": event,
        "name": cycle.name,
        "project_id": str(cycle.project_id),
        "project_identifier": cycle.project.identifier,
        "project_name": cycle.project.name,
        "workspace_slug": cycle.project.workspace.slug,
        "workspace_name": cycle.project.workspace.name,
        "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
        "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
        "test_handoff_date": (
            cycle.test_handoff_date.isoformat() if cycle.test_handoff_date else None
        ),
        "actor_id": _normalize_user_id(actor_id),
        "is_system": actor_id is None,
        "activity_time": _now_iso(),
        "origin": origin,
    }
    payload.update(kwargs)
    return payload


def _release_payload(release, actor_id, origin, event, **kwargs):
    payload = {
        "entity_kind": "release",
        "event": event,
        "name": release.name,
        "project_id": str(release.project_id),
        "project_identifier": release.project.identifier,
        "project_name": release.project.name,
        "workspace_slug": release.project.workspace.slug,
        "workspace_name": release.project.workspace.name,
        "start_date": release.start_date.isoformat() if release.start_date else None,
        "target_date": release.target_date.isoformat() if release.target_date else None,
        "test_handoff_date": (
            release.test_handoff_date.isoformat() if release.test_handoff_date else None
        ),
        "actor_id": _normalize_user_id(actor_id),
        "is_system": actor_id is None,
        "activity_time": _now_iso(),
        "origin": origin,
    }
    payload.update(kwargs)
    return payload


def _enqueue_email_logs(
    *,
    entity_name,
    entity_id,
    event,
    old_value,
    new_value,
    payload,
    receiver_ids,
    effective_actor_id,
):
    if not receiver_ids or not effective_actor_id:
        return
    bulk = [
        EmailNotificationLog(
            triggered_by_id=effective_actor_id,
            receiver_id=receiver_id,
            entity_identifier=entity_id,
            entity_name=entity_name,
            entity=event,
            old_value=old_value,
            new_value=new_value,
            data={f"{entity_name}_activity": payload},
        )
        for receiver_id in receiver_ids
    ]
    if bulk:
        EmailNotificationLog.objects.bulk_create(bulk)


@shared_task
def dispatch_cycle_status_email(cycle_id, actor_id, old_status, new_status, origin):
    """Fan out a cycle status change into ``EmailNotificationLog`` rows."""
    try:
        if new_status not in CYCLE_STATUS_EMAIL_WHITELIST:
            return

        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            _all_project_member_ids(cycle.project_id),
            actor_id=actor_id,
        )

        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="status_changed",
            old_status=old_status,
            new_status=new_status,
            old_status_label=CYCLE_STATUS_LABELS.get(old_status, old_status),
            new_status_label=CYCLE_STATUS_LABELS.get(new_status, new_status),
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="status_changed",
            old_value=old_status,
            new_value=new_status,
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_release_status_email(release_id, actor_id, old_status, new_status, origin):
    """Fan out a release status change into ``EmailNotificationLog`` rows."""
    try:
        if new_status not in RELEASE_STATUS_EMAIL_WHITELIST:
            return

        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            _all_project_member_ids(release.project_id),
            actor_id=actor_id,
        )

        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="status_changed",
            old_status=old_status,
            new_status=new_status,
            old_status_label=RELEASE_STATUS_LABELS.get(old_status, old_status),
            new_status_label=RELEASE_STATUS_LABELS.get(new_status, new_status),
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="status_changed",
            old_value=old_status,
            new_value=new_status,
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_cycle_created_email(cycle_id, actor_id, origin):
    try:
        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            _all_project_member_ids(cycle.project_id),
            actor_id=actor_id,
        )

        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="created",
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="created",
            old_value="",
            new_value="created",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_release_created_email(release_id, actor_id, origin):
    try:
        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            _all_project_member_ids(release.project_id),
            actor_id=actor_id,
        )

        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="created",
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="created",
            old_value="",
            new_value="created",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_cycle_schedule_email(cycle_id, actor_id, origin, old_start_date, old_end_date):
    try:
        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        date_changes = []
        for label, old_value, new_value in (
            ("开始时间", old_start_date, cycle.start_date),
            ("结束时间", old_end_date, cycle.end_date),
        ):
            old_date = _normalize_date_value(old_value)
            new_date = _normalize_date_value(new_value)
            if old_date != new_date:
                date_changes.append(
                    {
                        "label": label,
                        "old": old_date,
                        "new": new_date,
                    }
                )

        if not date_changes:
            return

        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            _all_project_member_ids(cycle.project_id),
            actor_id=actor_id,
        )

        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="schedule_changed",
            date_changes=date_changes,
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="schedule_changed",
            old_value="",
            new_value="schedule_changed",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_release_schedule_email(
    release_id, actor_id, origin, old_start_date, old_target_date, old_test_handoff_date
):
    try:
        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        date_changes = []
        for label, old_value, new_value in (
            ("开始时间", old_start_date, release.start_date),
            ("目标时间", old_target_date, release.target_date),
            ("转测日期", old_test_handoff_date, release.test_handoff_date),
        ):
            old_date = _normalize_date_value(old_value)
            new_date = _normalize_date_value(new_value)
            if old_date != new_date:
                date_changes.append(
                    {
                        "label": label,
                        "old": old_date,
                        "new": new_date,
                    }
                )

        if not date_changes:
            return

        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            _all_project_member_ids(release.project_id),
            actor_id=actor_id,
        )

        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="schedule_changed",
            date_changes=date_changes,
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="schedule_changed",
            old_value="",
            new_value="schedule_changed",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_cycle_overdue_email(cycle_id, phase=None, actor_id=None, origin=None):
    try:
        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        origin = _default_origin(origin)
        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            _all_project_member_ids(cycle.project_id),
            actor_id=actor_id,
        )

        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="overdue",
            owner_name=_user_display_name(cycle.owned_by_id),
            phase=phase,
            phase_label=CYCLE_OVERDUE_PHASE_LABELS.get(phase, phase),
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="overdue",
            old_value="",
            new_value="overdue",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_release_overdue_email(release_id, phase, actor_id=None, origin=None):
    try:
        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        origin = _default_origin(origin)
        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            _all_project_member_ids(release.project_id),
            actor_id=actor_id,
        )

        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="overdue",
            owner_name=_user_display_name(release.lead_id),
            phase=phase,
            phase_label=RELEASE_OVERDUE_PHASE_LABELS.get(phase, phase),
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="overdue",
            old_value="",
            new_value="overdue",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


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
    try:
        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        origin = _default_origin(origin)
        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            {_normalize_user_id(cycle.owned_by_id)},
            actor_id=actor_id,
        )

        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="upcoming_overdue",
            owner_name=_user_display_name(cycle.owned_by_id),
            phase=phase,
            phase_label=CYCLE_OVERDUE_PHASE_LABELS.get(phase, phase),
            deadline_label=deadline_label,
            deadline_date=deadline_date,
            remaining_days=remaining_days,
            reminder_key=reminder_key,
            reminder_slot=reminder_slot,
            current_status=cycle.status,
            current_status_label=CYCLE_STATUS_LABELS.get(cycle.status, cycle.status),
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="upcoming_overdue",
            old_value="",
            new_value="upcoming_overdue",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


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
    try:
        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        origin = _default_origin(origin)
        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            {_normalize_user_id(release.lead_id)},
            actor_id=actor_id,
        )

        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="upcoming_overdue",
            owner_name=_user_display_name(release.lead_id),
            phase=phase,
            phase_label=RELEASE_OVERDUE_PHASE_LABELS.get(phase, phase),
            deadline_label=deadline_label,
            deadline_date=deadline_date,
            remaining_days=remaining_days,
            reminder_key=reminder_key,
            reminder_slot=reminder_slot,
            current_status=release.status,
            current_status_label=RELEASE_STATUS_LABELS.get(release.status, release.status),
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="upcoming_overdue",
            old_value="",
            new_value="upcoming_overdue",
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_cycle_owner_email(cycle_id, actor_id, old_owner_id, new_owner_id, origin):
    try:
        if not new_owner_id:
            return

        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by", "created_by")
            .first()
        )
        if not cycle:
            return

        _set_origin(CYCLE_ORIGIN_REDIS_PREFIX, cycle_id, origin)
        effective_actor_id = _resolve_cycle_actor_id(cycle, actor_id)
        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            {_normalize_user_id(new_owner_id)},
            actor_id=actor_id,
        )

        old_owner_name = _user_display_name(old_owner_id)
        new_owner_name = _user_display_name(new_owner_id)
        payload = _cycle_payload(
            cycle,
            actor_id=actor_id,
            origin=origin,
            event="owner_changed",
            old_owner_id=_normalize_user_id(old_owner_id),
            new_owner_id=_normalize_user_id(new_owner_id),
            old_owner_name=old_owner_name,
            new_owner_name=new_owner_name,
        )
        _enqueue_email_logs(
            entity_name="cycle",
            entity_id=cycle_id,
            event="owner_changed",
            old_value=old_owner_name,
            new_value=new_owner_name,
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)


@shared_task
def dispatch_release_lead_email(release_id, actor_id, old_lead_id, new_lead_id, origin):
    try:
        if not new_lead_id:
            return

        release = (
            Release.objects.filter(pk=release_id)
            .select_related("project", "project__workspace", "created_by", "lead")
            .first()
        )
        if not release:
            return

        _set_origin(RELEASE_ORIGIN_REDIS_PREFIX, release_id, origin)
        effective_actor_id = _resolve_release_actor_id(release, actor_id)
        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            {_normalize_user_id(new_lead_id)},
            actor_id=actor_id,
        )

        old_lead_name = _user_display_name(old_lead_id)
        new_lead_name = _user_display_name(new_lead_id)
        payload = _release_payload(
            release,
            actor_id=actor_id,
            origin=origin,
            event="owner_changed",
            old_owner_id=_normalize_user_id(old_lead_id),
            new_owner_id=_normalize_user_id(new_lead_id),
            old_owner_name=old_lead_name,
            new_owner_name=new_lead_name,
        )
        _enqueue_email_logs(
            entity_name="release",
            entity_id=release_id,
            event="owner_changed",
            old_value=old_lead_name,
            new_value=new_lead_name,
            payload=payload,
            receiver_ids=receiver_ids,
            effective_actor_id=effective_actor_id,
        )
    except Exception as e:
        log_exception(e)
