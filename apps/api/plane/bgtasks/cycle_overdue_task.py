"""每日扫描迭代延期记录的 Celery 任务。"""

import logging

from celery import shared_task

from plane.utils.cycle.overdue_strategy import scan_cycles_for_overdue
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane")


@shared_task
def scan_cycle_overdues():
    try:
        processed = scan_cycles_for_overdue()
        logger.info("scan_cycle_overdues processed", extra={"processed": processed})
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
