# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Shared helpers for refreshing ``Cycle`` status based on wall-clock time.

The Cycle view previously did this inline inside ``list`` / ``retrieve``.
Consolidating the logic here lets both read paths and the PATCH path emit
email notifications whenever a cycle transitions into a status on the
email white-list (已延期 / 已完成 / 已取消).
"""

# Python imports
import pytz

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import Cycle
from plane.settings.redis import redis_instance


# Only these terminal/abnormal states trigger email broadcasts.
CYCLE_STATUS_EMAIL_WHITELIST = {
    Cycle.Status.DELAYED,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}


def _build_base_queryset(slug, project_id, user_id=None, pk=None):
    base = Cycle.objects.filter(
        workspace__slug=slug,
        project_id=project_id,
        archived_at__isnull=True,
        deleted_at__isnull=True,
        start_date__isnull=False,
        end_date__isnull=False,
        project__archived_at__isnull=True,
    ).exclude(status__in=[Cycle.Status.COMPLETED, Cycle.Status.CANCELLED])

    if user_id is not None:
        base = base.filter(
            project__project_projectmember__member_id=user_id,
            project__project_projectmember__is_active=True,
        )

    if pk is not None:
        base = base.filter(pk=pk)

    return base


def _apply_status_updates(base_queryset, project_timezone):
    local_tz = pytz.timezone(project_timezone)
    now_in_project_tz = timezone.now().astimezone(local_tz)
    now_in_utc = now_in_project_tz.astimezone(pytz.utc)

    base_queryset.filter(start_date__gt=now_in_utc).update(status=Cycle.Status.NOT_STARTED)
    base_queryset.filter(
        start_date__lte=now_in_utc,
        end_date__gte=now_in_utc,
    ).update(status=Cycle.Status.IN_PROGRESS)
    base_queryset.filter(end_date__lt=now_in_utc).update(status=Cycle.Status.DELAYED)


def refresh_cycle_statuses(
    slug,
    project_id,
    project_timezone,
    user_id=None,
    pk=None,
    origin=None,
):
    """Refresh cycle statuses for a project (or a single cycle) and dispatch
    status-change email notifications for any transitions into the white-list.

    The actual ``.update(status=...)`` calls are always run so list/retrieve
    keep their historical behaviour. Email dispatch is protected by a Redis
    dedup lock per project so that a burst of reads cannot emit duplicate
    emails.

    Returns a list of ``(cycle_id, old_status, new_status)`` tuples for
    every cycle whose status actually changed.
    """
    # Local import to avoid Celery/Django app-loading circular imports.
    from plane.bgtasks.entity_status_email_task import dispatch_cycle_status_email

    base = _build_base_queryset(slug, project_id, user_id=user_id, pk=pk)

    # Snapshot only the cycles that could transition. Materialise the list
    # immediately because the subsequent ``.update`` calls would otherwise
    # make this queryset a moving target.
    before = {str(cid): st for cid, st in list(base.values_list("id", "status"))}

    if not before:
        return []

    _apply_status_updates(base, project_timezone)

    # Only one caller per project (or per cycle) is allowed to emit emails in
    # any 60-second window. Losers still get the idempotent status write above
    # and simply bail on email dispatch.
    lock_scope = f"{project_id}:{pk}" if pk is not None else str(project_id)
    lock_key = f"cycle_refresh_email_lock:{lock_scope}"
    ri = redis_instance()
    if not ri.set(lock_key, "1", nx=True, ex=60):
        return []

    after = {
        str(cid): st
        for cid, st in Cycle.objects.filter(id__in=list(before.keys())).values_list("id", "status")
    }

    transitions = []
    for cycle_id, old_status in before.items():
        new_status = after.get(cycle_id)
        if not new_status or new_status == old_status:
            continue
        transitions.append((cycle_id, old_status, new_status))
        if new_status in CYCLE_STATUS_EMAIL_WHITELIST:
            dispatch_cycle_status_email.delay(
                cycle_id=cycle_id,
                actor_id=str(user_id) if user_id else None,
                old_status=old_status,
                new_status=new_status,
                origin=origin,
            )

    return transitions
