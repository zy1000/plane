"""每日扫描发布逾期记录的 Celery 任务。

详见 docs/release-requirements.md §8.3 / §12。
"""

import logging

from celery import shared_task

from plane.utils.exception_logger import log_exception
from plane.utils.release.overdue_strategy import scan_releases_for_overdue

logger = logging.getLogger("plane")


@shared_task
def scan_release_overdues():
    try:
        processed = scan_releases_for_overdue()
        logger.info("scan_release_overdues processed", extra={"processed": processed})
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
