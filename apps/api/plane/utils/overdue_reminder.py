"""Upcoming overdue reminder scanning for cycles and releases."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone as datetime_timezone
from zoneinfo import ZoneInfo

from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleOverduePhase,
    Release,
    ReleaseOverduePhase,
    ReleaseStatus,
)
from plane.settings.redis import redis_instance

logger = logging.getLogger("plane")

BEIJING_TZ = ZoneInfo("Asia/Shanghai")
REMINDER_LOCK_TTL_SECONDS = 14 * 24 * 60 * 60
UPCOMING_WINDOW_DAYS = 3

_CYCLE_DEV_PHASE_STATUSES = {
    Cycle.Status.NOT_STARTED,
    Cycle.Status.IN_PROGRESS,
    Cycle.Status.RETURNED,
}
_CYCLE_TEST_PHASE_STATUSES = {
    Cycle.Status.TESTING,
}
_CYCLE_TERMINAL_STATUSES = {
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}

_RELEASE_DEV_PHASE_STATUSES = {
    ReleaseStatus.NOT_STARTED,
    ReleaseStatus.IN_PROGRESS,
}
_RELEASE_TEST_PHASE_STATUSES = {
    ReleaseStatus.PENDING_TEST,
    ReleaseStatus.TESTING,
}
_RELEASE_TERMINAL_STATUSES = {
    ReleaseStatus.REJECTED,
    ReleaseStatus.COMPLETED,
    ReleaseStatus.CANCELLED,
}


def _local_now(now=None):
    current = now or timezone.now()
    if timezone.is_naive(current):
        current = current.replace(tzinfo=datetime_timezone.utc)
    return current.astimezone(BEIJING_TZ)


def _to_beijing_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if timezone.is_naive(value):
            value = value.replace(tzinfo=datetime_timezone.utc)
        return value.astimezone(BEIJING_TZ).date()
    if isinstance(value, date):
        return value
    return None


def _remaining_days(deadline_date, reminder_date):
    if deadline_date is None:
        return None
    remaining = (deadline_date - reminder_date).days
    if 0 <= remaining < UPCOMING_WINDOW_DAYS:
        return remaining
    return None


def _reminder_key(entity_kind, entity_id, phase, deadline_date, reminder_date, slot):
    return (
        "upcoming_overdue_reminder:"
        f"{entity_kind}:{entity_id}:{phase}:{deadline_date}:{reminder_date}:{slot}"
    )


def _acquire_reminder_lock(key):
    return redis_instance().set(key, "true", nx=True, ex=REMINDER_LOCK_TTL_SECONDS)


def _queue_cycle_reminder(cycle, *, phase, deadline_label, deadline_value, local_now, slot):
    if not cycle.owned_by_id:
        return 0

    deadline_date = _to_beijing_date(deadline_value)
    reminder_date = local_now.date()
    remaining = _remaining_days(deadline_date, reminder_date)
    if remaining is None:
        return 0

    reminder_key = _reminder_key(
        "cycle",
        cycle.id,
        phase,
        deadline_date.isoformat(),
        reminder_date.isoformat(),
        slot,
    )
    if not _acquire_reminder_lock(reminder_key):
        return 0

    from plane.bgtasks.entity_status_email_task import dispatch_cycle_upcoming_overdue_email

    dispatch_cycle_upcoming_overdue_email.delay(
        cycle_id=str(cycle.id),
        phase=phase,
        deadline_label=deadline_label,
        deadline_date=deadline_date.isoformat(),
        remaining_days=remaining,
        reminder_key=reminder_key,
        reminder_slot=slot,
        origin=None,
    )
    return 1


def _queue_release_reminder(release, *, phase, deadline_label, deadline_value, local_now, slot):
    if not release.lead_id:
        return 0

    deadline_date = _to_beijing_date(deadline_value)
    reminder_date = local_now.date()
    remaining = _remaining_days(deadline_date, reminder_date)
    if remaining is None:
        return 0

    reminder_key = _reminder_key(
        "release",
        release.id,
        phase,
        deadline_date.isoformat(),
        reminder_date.isoformat(),
        slot,
    )
    if not _acquire_reminder_lock(reminder_key):
        return 0

    from plane.bgtasks.entity_status_email_task import dispatch_release_upcoming_overdue_email

    dispatch_release_upcoming_overdue_email.delay(
        release_id=str(release.id),
        phase=phase,
        deadline_label=deadline_label,
        deadline_date=deadline_date.isoformat(),
        remaining_days=remaining,
        reminder_key=reminder_key,
        reminder_slot=slot,
        origin=None,
    )
    return 1


def scan_cycles_for_upcoming_overdue(cycles=None, *, now=None, slot=None) -> int:
    """Queue owner reminders for cycles that are close to missing a phase deadline."""
    local_now = _local_now(now)
    slot = slot or f"{local_now.hour:02d}"

    if cycles is None:
        cycles = (
            Cycle.objects.filter(
                archived_at__isnull=True,
                deleted_at__isnull=True,
            )
            .exclude(status__in=_CYCLE_TERMINAL_STATUSES)
            .select_related("project", "project__workspace", "owned_by", "created_by")
        )

    count = 0
    for cycle in cycles:
        try:
            if cycle.status in _CYCLE_DEV_PHASE_STATUSES:
                count += _queue_cycle_reminder(
                    cycle,
                    phase=CycleOverduePhase.DEV,
                    deadline_label="转测日期",
                    deadline_value=cycle.test_handoff_date,
                    local_now=local_now,
                    slot=slot,
                )
            elif cycle.status in _CYCLE_TEST_PHASE_STATUSES:
                count += _queue_cycle_reminder(
                    cycle,
                    phase=CycleOverduePhase.TEST,
                    deadline_label="结束日期",
                    deadline_value=cycle.end_date,
                    local_now=local_now,
                    slot=slot,
                )
        except Exception:  # noqa: BLE001
            logger.exception(
                "queue cycle upcoming overdue reminder failed",
                extra={"cycle_id": str(cycle.id)},
            )
    return count


def scan_releases_for_upcoming_overdue(releases=None, *, now=None, slot=None) -> int:
    """Queue owner reminders for releases that are close to missing a phase deadline."""
    local_now = _local_now(now)
    slot = slot or f"{local_now.hour:02d}"

    if releases is None:
        releases = (
            Release.objects.filter(
                archived_at__isnull=True,
                deleted_at__isnull=True,
            )
            .exclude(status__in=_RELEASE_TERMINAL_STATUSES)
            .select_related("project", "project__workspace", "lead", "created_by")
        )

    count = 0
    for release in releases:
        try:
            if release.status in _RELEASE_DEV_PHASE_STATUSES:
                count += _queue_release_reminder(
                    release,
                    phase=ReleaseOverduePhase.DEV,
                    deadline_label="转测日期",
                    deadline_value=release.test_handoff_date,
                    local_now=local_now,
                    slot=slot,
                )
            elif release.status in _RELEASE_TEST_PHASE_STATUSES:
                count += _queue_release_reminder(
                    release,
                    phase=ReleaseOverduePhase.TEST,
                    deadline_label="结束日期",
                    deadline_value=release.target_date,
                    local_now=local_now,
                    slot=slot,
                )
        except Exception:  # noqa: BLE001
            logger.exception(
                "queue release upcoming overdue reminder failed",
                extra={"release_id": str(release.id)},
            )
    return count


def scan_upcoming_overdue_reminders(*, now=None, slot=None) -> int:
    """Queue all upcoming overdue reminder emails for cycles and releases."""
    return (
        scan_cycles_for_upcoming_overdue(now=now, slot=slot)
        + scan_releases_for_upcoming_overdue(now=now, slot=slot)
    )
