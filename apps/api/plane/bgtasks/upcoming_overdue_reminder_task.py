"""Scan cycles and releases for upcoming overdue reminder emails."""

import logging

from celery import shared_task

from plane.utils.exception_logger import log_exception
from plane.utils.overdue_reminder import scan_upcoming_overdue_reminders

logger = logging.getLogger("plane")


@shared_task
def scan_upcoming_overdue_reminders_task():
    try:
        processed = scan_upcoming_overdue_reminders()
        logger.info(
            "scan_upcoming_overdue_reminders processed",
            extra={"processed": processed},
        )
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
