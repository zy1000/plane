"""迭代延期判定与持久化逻辑（详见 docs/cycle-requirements.md §7）。

延期不修改 Cycle.status，仅维护独立的 CycleOverdueRecord：
- 同一 cycle 在 ended_at IS NULL 时只允许一条记录（DB 唯一约束保证）
- 系统每日扫描非终止态（未开始/进行中/测试中）迭代，自动开/关延期记录
- 状态/日期变化时 view 层主动调用 sync
"""

from __future__ import annotations

import json
import logging
from typing import Iterable, Optional

from django.db import transaction
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleOverdueRecord,
    CycleOverdueTrigger,
)

logger = logging.getLogger("plane")

_TERMINAL_STATUSES = {
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
            requested_data=json.dumps({"record_id": str(record.id)}),
            current_instance=None,
            cycle_id=str(record.cycle_id),
            actor_id=actor_id,
            project_id=str(record.project_id),
            epoch=int(timezone.now().timestamp()),
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "emit cycle overdue activity failed",
            extra={"cycle_id": str(record.cycle_id), "type": activity_type},
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


def _active_overdue(cycle_id) -> Optional[CycleOverdueRecord]:
    return CycleOverdueRecord.objects.filter(
        cycle_id=cycle_id,
        ended_at__isnull=True,
        deleted_at__isnull=True,
    ).first()


def open_overdue(
        cycle: Cycle,
        *,
        triggered_by: str = CycleOverdueTrigger.SYSTEM,
        started_at=None,
) -> CycleOverdueRecord:
    """幂等开启延期记录。已有未结束记录则原样返回。"""
    existing = _active_overdue(cycle.id)
    if existing is not None:
        return existing

    record = CycleOverdueRecord.objects.create(
        cycle=cycle,
        project_id=cycle.project_id,
        workspace_id=cycle.workspace_id,
        triggered_by=triggered_by,
        started_at=started_at or timezone.now(),
    )
    logger.info(
        "cycle overdue opened",
        extra={"cycle_id": str(cycle.id), "triggered_by": triggered_by},
    )
    _emit_overdue_activity("cycle_overdue.activity.opened", record=record)
    return record


def close_active_overdue(
        cycle_id,
        *,
        now=None,
) -> Optional[CycleOverdueRecord]:
    """关闭某 cycle 的未结束记录。返回被关闭记录或 None。"""
    record = _active_overdue(cycle_id)
    if record is None:
        return None

    record.ended_at = now or timezone.now()
    record.save(update_fields=["ended_at", "updated_at"])
    logger.info("cycle overdue closed", extra={"cycle_id": str(cycle_id)})
    _emit_overdue_activity("cycle_overdue.activity.closed", record=record)
    return record


def evaluate_cycle_overdue(cycle: Cycle, *, now=None) -> None:
    """根据 cycle 字段判定是否开/关延期记录。"""
    now = now or timezone.now()
    status = cycle.status

    if status in _TERMINAL_STATUSES:
        close_active_overdue(cycle.id, now=now)
        return

    end_date = _to_datetime(cycle.end_date)
    if end_date is not None and now > end_date:
        open_overdue(cycle)


@transaction.atomic
def sync_overdue_on_status_change(
        cycle: Cycle,
        old_status: Optional[str],
        new_status: Optional[str],
        *,
        now=None,
) -> None:
    """状态变化时关闭未结束延期记录。"""
    if not new_status or old_status == new_status:
        return

    if new_status in _TERMINAL_STATUSES:
        close_active_overdue(cycle.id, now=now or timezone.now())


@transaction.atomic
def sync_overdue_on_date_change(
        cycle: Cycle,
        *,
        prev_end,
        now=None,
) -> None:
    """结束时间变更时按需关闭当前延期记录，实现多次延期分段。"""
    if cycle.end_date == prev_end:
        return

    now = now or timezone.now()
    end_date = _to_datetime(cycle.end_date)
    if end_date is None or now <= end_date:
        close_active_overdue(cycle.id, now=now)


def scan_cycles_for_overdue(cycles: Optional[Iterable[Cycle]] = None) -> int:
    """扫描非终止态迭代，按需开/关延期记录。返回处理数。"""
    if cycles is None:
        cycles = Cycle.objects.filter(
            archived_at__isnull=True,
        ).exclude(
            status__in=_TERMINAL_STATUSES,
        )

    now = timezone.now()
    count = 0
    for cycle in cycles:
        try:
            evaluate_cycle_overdue(cycle, now=now)
        except Exception:  # noqa: BLE001
            logger.exception(
                "evaluate_cycle_overdue failed",
                extra={"cycle_id": str(cycle.id)},
            )
        count += 1
    return count
