# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Celery tasks that fan out status-change notifications for Cycle/Release.

These tasks enqueue rows into :class:`EmailNotificationLog` (one eligible
recipient) so the existing Beat aggregator (``stack_email_notification``)
picks them up and dispatches the actual emails.

Recipients are scoped to the people most directly tied to the entity rather
than every project member:

* Cycle: the cycle owner (``owned_by``) plus every assignee of issues that
  currently live under the cycle.
* Release: the release lead (``lead``) plus its explicit ``members``.

We still require recipients to be active project members and honour their
``UserNotificationPreference.state_change`` opt-out.
"""

# Python imports
from datetime import datetime, timezone as datetime_timezone

# Third party imports
from celery import shared_task
from django.utils import timezone

# Module imports
from plane.db.models import (
    Cycle,
    EmailNotificationLog,
    IssueAssignee,
    ProjectMember,
    Release,
    ReleaseMember,
    UserNotificationPreference,
)
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception


# Only terminal/abnormal states trigger broadcasts. Keep in sync with
# ``plane.utils.cycle_status.CYCLE_STATUS_EMAIL_WHITELIST``.
CYCLE_STATUS_EMAIL_WHITELIST = {
    Cycle.Status.RETURNED,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}

RELEASE_STATUS_EMAIL_WHITELIST = {
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


def _cycle_candidate_receiver_ids(cycle):
    """Owner of the cycle plus every assignee of issues currently in it."""
    ids = set()
    if cycle.owned_by_id:
        ids.add(str(cycle.owned_by_id))
    ids.update(
        str(uid)
        for uid in IssueAssignee.objects.filter(
            issue__issue_cycle__cycle_id=cycle.id,
            issue__issue_cycle__deleted_at__isnull=True,
            deleted_at__isnull=True,
        )
        .values_list("assignee_id", flat=True)
        .distinct()
        if uid is not None
    )
    return ids


def _release_candidate_receiver_ids(release):
    """Lead of the release plus its explicit members."""
    ids = set()
    if release.lead_id:
        ids.add(str(release.lead_id))
    ids.update(
        str(uid)
        for uid in ReleaseMember.objects.filter(
            release_id=release.id, deleted_at__isnull=True
        ).values_list("member_id", flat=True)
        if uid is not None
    )
    return ids


def _now_iso():
    return datetime.now(tz=datetime_timezone.utc).isoformat()


@shared_task
def dispatch_cycle_status_email(cycle_id, actor_id, old_status, new_status, origin):
    """Fan out a cycle status change into ``EmailNotificationLog`` rows."""
    try:
        if new_status not in CYCLE_STATUS_EMAIL_WHITELIST:
            return

        cycle = (
            Cycle.objects.filter(pk=cycle_id)
            .select_related("project", "project__workspace", "owned_by")
            .first()
        )
        if not cycle:
            return

        # Stash the origin so the Beat-scheduled sender can build links.
        if origin:
            redis_instance().set(
                f"{CYCLE_ORIGIN_REDIS_PREFIX}:{cycle_id}",
                origin,
                ex=7200,
            )

        # Fall back to the cycle owner when the change was triggered by the
        # system (auto-delay) so the NOT NULL ``triggered_by`` FK stays valid.
        effective_actor_id = actor_id or str(cycle.owned_by_id)

        receiver_ids = _filter_eligible_receivers(
            cycle.project_id,
            _cycle_candidate_receiver_ids(cycle),
            actor_id=actor_id,
        )
        if not receiver_ids:
            return

        payload = {
            "entity_kind": "cycle",
            "name": cycle.name,
            "project_id": str(cycle.project_id),
            "project_identifier": cycle.project.identifier,
            "project_name": cycle.project.name,
            "workspace_slug": cycle.project.workspace.slug,
            "workspace_name": cycle.project.workspace.name,
            "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
            "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
            "old_status": old_status,
            "new_status": new_status,
            "old_status_label": CYCLE_STATUS_LABELS.get(old_status, old_status),
            "new_status_label": CYCLE_STATUS_LABELS.get(new_status, new_status),
            "actor_id": actor_id,
            "is_system": actor_id is None,
            "activity_time": _now_iso(),
            "origin": origin,
        }

        bulk = [
            EmailNotificationLog(
                triggered_by_id=effective_actor_id,
                receiver_id=receiver_id,
                entity_identifier=cycle_id,
                entity_name="cycle",
                entity=new_status,
                old_value=old_status,
                new_value=new_status,
                data={"cycle_activity": payload},
            )
            for receiver_id in receiver_ids
        ]
        if bulk:
            EmailNotificationLog.objects.bulk_create(bulk)
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

        if origin:
            redis_instance().set(
                f"{RELEASE_ORIGIN_REDIS_PREFIX}:{release_id}",
                origin,
                ex=7200,
            )

        # Prefer an explicit actor, then the release lead, then the creator,
        # so the NOT NULL ``triggered_by`` FK always resolves to a real user.
        fallback_actor_id = release.lead_id or release.created_by_id
        effective_actor_id = actor_id or (
            str(fallback_actor_id) if fallback_actor_id else None
        )
        if not effective_actor_id:
            # No user we can attribute to - nothing we can safely persist.
            return

        receiver_ids = _filter_eligible_receivers(
            release.project_id,
            _release_candidate_receiver_ids(release),
            actor_id=actor_id,
        )
        if not receiver_ids:
            return

        payload = {
            "entity_kind": "release",
            "name": release.name,
            "project_id": str(release.project_id),
            "project_identifier": release.project.identifier,
            "project_name": release.project.name,
            "workspace_slug": release.project.workspace.slug,
            "workspace_name": release.project.workspace.name,
            "start_date": (
                release.start_date.isoformat() if release.start_date else None
            ),
            "target_date": (
                release.target_date.isoformat() if release.target_date else None
            ),
            "old_status": old_status,
            "new_status": new_status,
            "old_status_label": RELEASE_STATUS_LABELS.get(old_status, old_status),
            "new_status_label": RELEASE_STATUS_LABELS.get(new_status, new_status),
            "actor_id": actor_id,
            "is_system": actor_id is None,
            "activity_time": _now_iso(),
            "origin": origin,
        }

        bulk = [
            EmailNotificationLog(
                triggered_by_id=effective_actor_id,
                receiver_id=receiver_id,
                entity_identifier=release_id,
                entity_name="release",
                entity=new_status,
                old_value=old_status,
                new_value=new_status,
                data={"release_activity": payload},
            )
            for receiver_id in receiver_ids
        ]
        if bulk:
            EmailNotificationLog.objects.bulk_create(bulk)
    except Exception as e:
        log_exception(e)
