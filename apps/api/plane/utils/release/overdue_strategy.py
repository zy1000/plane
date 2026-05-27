"""发布逾期判定与持久化逻辑（详见 docs/release-requirements.md §8）。

逾期不修改 Release.status，仅维护一张独立的 ReleaseOverdueRecord 表：
- 同一 release + phase 在 ended_at IS NULL 时只允许一条（DB 唯一约束保证）
- 系统每日扫描非终止状态发布，自动开/关逾期记录
- 状态推进时 view 层主动调用 sync 关闭对应阶段未结束的记录
"""

from __future__ import annotations

import logging
from typing import Iterable, Optional

from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    Release,
    ReleaseOverduePhase,
    ReleaseOverdueRecord,
    ReleaseOverdueTrigger,
    ReleaseStatus,
)

logger = logging.getLogger("plane")

# 进入这些状态意味着对应阶段彻底结束，应当关闭未结束的逾期记录
_DEV_PHASE_CLOSE_STATUSES = {
    ReleaseStatus.PENDING_TEST,
    ReleaseStatus.TESTING,
    ReleaseStatus.REJECTED,
    ReleaseStatus.COMPLETED,
    ReleaseStatus.CANCELLED,
}
_TEST_PHASE_CLOSE_STATUSES = {
    ReleaseStatus.COMPLETED,
    ReleaseStatus.REJECTED,
    ReleaseStatus.CANCELLED,
}

_TERMINAL_STATUSES = {
    ReleaseStatus.COMPLETED,
    ReleaseStatus.CANCELLED,
    ReleaseStatus.REJECTED,
}


def _to_datetime(value):
    """统一把 date / datetime 转成带时区的 datetime（取当地结束时刻 23:59:59）。"""
    if value is None:
        return None
    if hasattr(value, "hour"):
        return value
    return timezone.make_aware(
        timezone.datetime.combine(value, timezone.datetime.max.time())
    )


def _active_overdue(release_id, phase: str) -> Optional[ReleaseOverdueRecord]:
    return ReleaseOverdueRecord.objects.filter(
        release_id=release_id,
        phase=phase,
        ended_at__isnull=True,
    ).first()


def open_overdue(
        release: Release,
        phase: str,
        *,
        triggered_by: str = ReleaseOverdueTrigger.SYSTEM,
        started_at=None,
) -> ReleaseOverdueRecord:
    """幂等开启逾期记录。已有未结束记录则原样返回。"""
    existing = _active_overdue(release.id, phase)
    if existing is not None:
        return existing

    record = ReleaseOverdueRecord.objects.create(
        release=release,
        project_id=release.project_id,
        workspace_id=release.workspace_id,
        phase=phase,
        triggered_by=triggered_by,
        started_at=started_at or timezone.now(),
    )
    logger.info(
        "release overdue opened",
        extra={"release_id": str(release.id), "phase": phase, "triggered_by": triggered_by},
    )
    return record


def close_active_overdue(
        release_id,
        phase: str,
        *,
        now=None,
) -> Optional[ReleaseOverdueRecord]:
    """关闭某 release / phase 的未结束记录。返回被关闭的记录或 None。"""
    record = _active_overdue(release_id, phase)
    if record is None:
        return None
    record.ended_at = now or timezone.now()
    record.save(update_fields=["ended_at", "updated_at"])
    logger.info(
        "release overdue closed",
        extra={"release_id": str(release_id), "phase": phase},
    )
    return record


def evaluate_release_overdue(release: Release, *, now=None) -> None:
    """根据当前 release 的字段判定是否该开/关哪个 phase 的逾期记录。

    - 研发逾期：status == in-progress 且当前时间已超过 test_handoff_date
    - 测试逾期：status in {pending-test, testing} 且当前时间已超过 target_date
    """
    now = now or timezone.now()
    status = release.status

    # 终止状态不再产生新记录；同时把仍未关闭的逾期记录关掉
    if status in _TERMINAL_STATUSES:
        close_active_overdue(release.id, ReleaseOverduePhase.DEV, now=now)
        close_active_overdue(release.id, ReleaseOverduePhase.TEST, now=now)
        return

    # 研发逾期判定
    if status in [ReleaseStatus.IN_PROGRESS, ReleaseStatus.NOT_STARTED]:
        handoff = _to_datetime(release.test_handoff_date)
        if handoff is not None and now > handoff:
            open_overdue(release, ReleaseOverduePhase.DEV)
        # 进入待测试之前不会产生测试逾期，但如果之前异常残留 test 记录这里也清理一下
        close_active_overdue(release.id, ReleaseOverduePhase.TEST, now=now)
        return

    # 测试逾期判定
    if status in {ReleaseStatus.PENDING_TEST, ReleaseStatus.TESTING}:
        # 进入测试阶段后研发阶段已结束
        close_active_overdue(release.id, ReleaseOverduePhase.DEV, now=now)
        target = _to_datetime(release.target_date)
        if target is not None and now > target:
            open_overdue(release, ReleaseOverduePhase.TEST)
        return

    # not-started 等其他状态：什么都不做（不会产生逾期）
    return


@transaction.atomic
def sync_overdue_on_status_change(
        release: Release,
        old_status: Optional[str],
        new_status: Optional[str],
        *,
        now=None,
) -> None:
    """状态变化时关闭对应阶段未结束的逾期记录（§8.4）。"""
    if not new_status or old_status == new_status:
        return

    now = now or timezone.now()

    if new_status in _DEV_PHASE_CLOSE_STATUSES:
        close_active_overdue(release.id, ReleaseOverduePhase.DEV, now=now)
    if new_status in _TEST_PHASE_CLOSE_STATUSES:
        close_active_overdue(release.id, ReleaseOverduePhase.TEST, now=now)


@transaction.atomic
def sync_overdue_on_date_change(
        release: Release,
        *,
        prev_handoff,
        prev_target,
        now=None,
) -> None:
    """转测/结束日期变更时，关闭当前进行中的对应阶段逾期记录，实现多次延期。

    仅在「新日期不再过期」时关闭：
    - 新值为空，或当前时间尚未超过新日期 → 关闭未结束记录，等下次扫描再开
    - 新日期仍已过期 → 保持原记录继续累计，避免无意义的记录分裂

    后续是否再次开启新记录由 scan_releases_for_overdue 决定，DB 唯一约束保证每个
    phase 同时只存在一条未结束记录。
    """
    now = now or timezone.now()

    if release.test_handoff_date != prev_handoff:
        handoff = _to_datetime(release.test_handoff_date)
        if handoff is None or now <= handoff:
            close_active_overdue(release.id, ReleaseOverduePhase.DEV, now=now)

    if release.target_date != prev_target:
        target = _to_datetime(release.target_date)
        if target is None or now <= target:
            close_active_overdue(release.id, ReleaseOverduePhase.TEST, now=now)


def scan_releases_for_overdue(releases: Optional[Iterable[Release]] = None) -> int:
    """扫描所有非终止状态的发布，按需开/关逾期记录。返回处理的发布数。"""
    if releases is None:
        releases = Release.objects.filter(
            archived_at__isnull=True,
        ).exclude(status__in=list(_TERMINAL_STATUSES))

    now = timezone.now()
    count = 0
    for release in releases:
        try:
            evaluate_release_overdue(release, now=now)
        except Exception:  # noqa: BLE001
            logger.exception(
                "evaluate_release_overdue failed",
                extra={"release_id": str(release.id)},
            )
        count += 1
    return count
