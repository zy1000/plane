"""迭代延期判定与持久化逻辑（对齐发布的双阶段延期模型）。

延期不修改 Cycle.status，仅维护独立的 CycleOverdueRecord：
- 同一 cycle + phase 在 ended_at IS NULL 时只允许一条记录（DB 唯一约束保证）
- 系统每日扫描非终止态（未开始/进行中/测试中/已退回）迭代，自动开/关延期记录
- 状态/日期变化时 view 层主动调用 sync

阶段划分：
- 研发延期(dev)：未开始/进行中/已退回，且当前时间已超过 test_handoff_date
- 测试延期(test)：测试中，且当前时间已超过 end_date
"""

from __future__ import annotations

import json
import logging
from typing import Iterable, Optional

from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleOverduePhase,
    CycleOverdueRecord,
    CycleOverdueTrigger,
)

logger = logging.getLogger("plane")

# 研发阶段（超过转测日期记研发延期）
_DEV_PHASE_STATUSES = {
    Cycle.Status.NOT_STARTED,
    Cycle.Status.IN_PROGRESS,
    Cycle.Status.RETURNED,
}
# 测试阶段（超过结束日期记测试延期）
_TEST_PHASE_STATUSES = {
    Cycle.Status.TESTING,
}
_TERMINAL_STATUSES = {
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}

# 进入这些状态意味着对应阶段彻底结束，应当关闭未结束的延期记录
_DEV_PHASE_CLOSE_STATUSES = {
    Cycle.Status.TESTING,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}
_TEST_PHASE_CLOSE_STATUSES = {
    Cycle.Status.RETURNED,
    Cycle.Status.COMPLETED,
    Cycle.Status.CANCELLED,
}


def _emit_overdue_activity(
        activity_type: str,
        *,
        record: CycleOverdueRecord,
) -> None:
    try:
        from plane.bgtasks.cycle_activities_task import cycle_activity as cycle_activity_task

        actor_id = None
        if record.triggered_by == CycleOverdueTrigger.USER:
            updater = getattr(record, "updated_by_id", None) or getattr(record, "created_by_id", None)
            if updater:
                actor_id = str(updater)

        cycle_activity_task.delay(
            type=activity_type,
            requested_data=json.dumps({"phase": record.phase, "record_id": str(record.id)}),
            current_instance=None,
            cycle_id=str(record.cycle_id),
            actor_id=actor_id,
            project_id=str(record.project_id),
            epoch=int(timezone.now().timestamp()),
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "emit cycle overdue activity failed",
            extra={"cycle_id": str(record.cycle_id), "phase": record.phase, "type": activity_type},
        )


def _to_datetime(value):
    """统一把 date / datetime 转成带时区的 datetime（date 取当天 23:59:59）。"""
    if value is None:
        return None
    if hasattr(value, "hour"):
        return value
    return timezone.make_aware(
        timezone.datetime.combine(value, timezone.datetime.max.time())
    )


def _active_overdue(
        cycle_id,
        phase: str,
        *,
        cache: Optional[dict] = None,
) -> Optional[CycleOverdueRecord]:
    if cache is not None:
        return cache.get((cycle_id, phase))
    return CycleOverdueRecord.objects.filter(
        cycle_id=cycle_id,
        phase=phase,
        ended_at__isnull=True,
        deleted_at__isnull=True,
    ).first()


def open_overdue(
        cycle: Cycle,
        phase: str,
        *,
        triggered_by: str = CycleOverdueTrigger.SYSTEM,
        started_at=None,
        cache: Optional[dict] = None,
) -> CycleOverdueRecord:
    """幂等开启延期记录。已有未结束记录则原样返回。"""
    existing = _active_overdue(cycle.id, phase, cache=cache)
    if existing is not None:
        return existing

    record = CycleOverdueRecord.objects.create(
        cycle=cycle,
        project_id=cycle.project_id,
        workspace_id=cycle.workspace_id,
        phase=phase,
        triggered_by=triggered_by,
        snapshot_owner_id=cycle.owned_by_id,
        snapshot_status=cycle.status or "",
        started_at=started_at or timezone.now(),
    )
    if cache is not None:
        cache[(cycle.id, phase)] = record
    logger.info(
        "cycle overdue opened",
        extra={"cycle_id": str(cycle.id), "phase": phase, "triggered_by": triggered_by},
    )
    _emit_overdue_activity("cycle_overdue.activity.opened", record=record)
    try:
        from plane.bgtasks.entity_status_email_task import dispatch_cycle_overdue_email

        actor_id = None
        if record.triggered_by == CycleOverdueTrigger.USER:
            updater = getattr(record, "updated_by_id", None) or getattr(record, "created_by_id", None)
            if updater:
                actor_id = str(updater)

        dispatch_cycle_overdue_email.delay(
            cycle_id=str(cycle.id),
            phase=record.phase,
            actor_id=actor_id,
            origin=None,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "emit cycle overdue email failed",
            extra={"cycle_id": str(cycle.id), "phase": record.phase, "record_id": str(record.id)},
        )
    return record


def close_active_overdue(
        cycle_id,
        phase: str,
        *,
        now=None,
        cache: Optional[dict] = None,
) -> Optional[CycleOverdueRecord]:
    """关闭某 cycle / phase 的未结束记录。返回被关闭记录或 None。"""
    record = _active_overdue(cycle_id, phase, cache=cache)
    if record is None:
        return None

    record.ended_at = now or timezone.now()
    record.save(update_fields=["ended_at", "updated_at"])
    if cache is not None:
        cache.pop((cycle_id, phase), None)
    logger.info("cycle overdue closed", extra={"cycle_id": str(cycle_id), "phase": phase})
    _emit_overdue_activity("cycle_overdue.activity.closed", record=record)
    return record


def evaluate_cycle_overdue(
        cycle: Cycle,
        *,
        now=None,
        cache: Optional[dict] = None,
) -> None:
    """根据当前 cycle 字段判定是否开/关哪个 phase 的延期记录。

    - 研发延期：status in {未开始,进行中,已退回} 且当前时间已超过 test_handoff_date
    - 测试延期：status == 测试中 且当前时间已超过 end_date
    """
    now = now or timezone.now()
    status = cycle.status

    # 终止状态不再产生新记录；同时把仍未关闭的延期记录关掉
    if status in _TERMINAL_STATUSES:
        close_active_overdue(cycle.id, CycleOverduePhase.DEV, now=now, cache=cache)
        close_active_overdue(cycle.id, CycleOverduePhase.TEST, now=now, cache=cache)
        return

    # 研发延期判定
    if status in _DEV_PHASE_STATUSES:
        handoff = _to_datetime(cycle.test_handoff_date)
        if handoff is not None and now > handoff:
            open_overdue(cycle, CycleOverduePhase.DEV, cache=cache)
        # 研发阶段不会产生测试延期，清理可能残留的 test 记录
        close_active_overdue(cycle.id, CycleOverduePhase.TEST, now=now, cache=cache)
        return

    # 测试延期判定
    if status in _TEST_PHASE_STATUSES:
        # 进入测试阶段后研发阶段已结束
        close_active_overdue(cycle.id, CycleOverduePhase.DEV, now=now, cache=cache)
        end_date = _to_datetime(cycle.end_date)
        if end_date is not None and now > end_date:
            open_overdue(cycle, CycleOverduePhase.TEST, cache=cache)
        return

    return


@transaction.atomic
def sync_overdue_on_status_change(
        cycle: Cycle,
        old_status: Optional[str],
        new_status: Optional[str],
        *,
        now=None,
) -> None:
    """状态变化时关闭对应阶段未结束的延期记录。

    特殊规则：从 测试中 转入 已退回 时，若当前时间已晚于转测日期
    （test_handoff_date），意味着此次退回使研发阶段实际已逾期，需要补登
    一条研发延期记录。下一次扫描或后续状态推进会按需关闭它，最终沉淀为
    历史延期记录。
    """
    if not new_status or old_status == new_status:
        return

    now = now or timezone.now()

    if new_status in _DEV_PHASE_CLOSE_STATUSES:
        close_active_overdue(cycle.id, CycleOverduePhase.DEV, now=now)
    if new_status in _TEST_PHASE_CLOSE_STATUSES:
        close_active_overdue(cycle.id, CycleOverduePhase.TEST, now=now)

    if (
        new_status == Cycle.Status.RETURNED
        and old_status == Cycle.Status.TESTING
    ):
        handoff = _to_datetime(cycle.test_handoff_date)
        if handoff is not None and now > handoff:
            open_overdue(cycle, CycleOverduePhase.DEV, started_at=now)


@transaction.atomic
def sync_overdue_on_date_change(
        cycle: Cycle,
        *,
        prev_handoff,
        prev_end,
        now=None,
) -> None:
    """转测/结束日期变更时，关闭当前进行中的对应阶段延期记录，实现多次延期。

    仅在「新日期不再过期」时关闭：
    - 新值为空，或当前时间尚未超过新日期 → 关闭未结束记录，等下次扫描再开
    - 新日期仍已过期 → 保持原记录继续累计，避免无意义的记录分裂
    """
    now = now or timezone.now()

    if cycle.test_handoff_date != prev_handoff:
        handoff = _to_datetime(cycle.test_handoff_date)
        if handoff is None or now <= handoff:
            close_active_overdue(cycle.id, CycleOverduePhase.DEV, now=now)

    if cycle.end_date != prev_end:
        end_date = _to_datetime(cycle.end_date)
        if end_date is None or now <= end_date:
            close_active_overdue(cycle.id, CycleOverduePhase.TEST, now=now)


def scan_cycles_for_overdue(cycles: Optional[Iterable[Cycle]] = None) -> int:
    """扫描非终止态迭代，按需开/关延期记录。返回处理数。"""
    if cycles is None:
        cycles = Cycle.objects.filter(
            archived_at__isnull=True,
        ).exclude(
            status__in=_TERMINAL_STATUSES,
        )

    cycle_list = list(cycles)
    if not cycle_list:
        return 0

    # 一次取出本批所有未结束延期记录，避免 evaluate 时逐条查询
    active_cache = {
        (record.cycle_id, record.phase): record
        for record in CycleOverdueRecord.objects.filter(
            cycle_id__in=[cycle.id for cycle in cycle_list],
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
    }

    now = timezone.now()
    count = 0
    for cycle in cycle_list:
        try:
            evaluate_cycle_overdue(cycle, now=now, cache=active_cache)
        except Exception:  # noqa: BLE001
            logger.exception(
                "evaluate_cycle_overdue failed",
                extra={"cycle_id": str(cycle.id)},
            )
        count += 1
    return count
