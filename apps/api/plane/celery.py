# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
from logging.config import dictConfig

# Third party imports
from celery import Celery
from celery.signals import setup_logging
from celery.schedules import crontab

# Module imports
from plane.settings.redis import redis_instance

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "plane.settings.production")

ri = redis_instance()

app = Celery("plane")

# Using a string here means the worker will not have to
# pickle the object when using Windows.
app.config_from_object("django.conf:settings", namespace="CELERY")

app.conf.beat_schedule = {
    # Intra day recurring jobs
    "check-every-five-minutes-to-send-email-notifications": {
        "task": "plane.bgtasks.email_notification_task.stack_email_notification",
        "schedule": crontab(minute="*/5"),  # Every 5 minutes
    },
    # 统一通知入口：即时邮件的合并 / 投递 / 重试每分钟跑一次；每日摘要工作日北京时间 08:30
    "flush-notify-mails-every-minute": {
        "task": "plane.bgtasks.notify_task.flush_notify_mails",
        "schedule": crontab(),  # Every minute
    },
    "send-notify-digests-on-workdays": {
        "task": "plane.bgtasks.notify_task.send_notify_digests",
        "schedule": crontab(hour=0, minute=30, day_of_week="1-5"),  # UTC 00:30, Beijing 08:30, Mon-Fri
    },
    "purge-notify-records-daily": {
        "task": "plane.bgtasks.notify_task.purge_notify_records",
        "schedule": crontab(hour=2, minute=50),  # UTC 02:50
    },
    "run-every-6-hours-for-instance-trace": {
        "task": "plane.license.bgtasks.tracer.instance_traces",
        "schedule": crontab(hour="*/6", minute=0),  # Every 6 hours
    },
    "check-three-times-a-day-to-send-upcoming-overdue-reminders": {
        "task": "plane.bgtasks.upcoming_overdue_reminder_task.scan_upcoming_overdue_reminders_task",
        "schedule": crontab(
            hour="1,6,10", minute=0
        ),  # UTC 01:00/06:00/10:00, Beijing 09:00/14:00/18:00
    },
    # Occurs once every day
    "check-every-day-to-delete-hard-delete": {
        "task": "plane.bgtasks.deletion_task.hard_delete",
        "schedule": crontab(hour=0, minute=0),  # UTC 00:00
    },
    "check-every-day-to-archive-and-close": {
        "task": "plane.bgtasks.issue_automation_task.archive_and_close_old_issues",
        "schedule": crontab(hour=1, minute=0),  # UTC 01:00
    },
    "check-every-day-to-delete_exporter_history": {
        "task": "plane.bgtasks.exporter_expired_task.delete_old_s3_link",
        "schedule": crontab(hour=1, minute=30),  # UTC 01:30
    },
    "check-every-day-to-delete-file-asset": {
        "task": "plane.bgtasks.file_asset_task.delete_unuploaded_file_asset",
        "schedule": crontab(hour=2, minute=0),  # UTC 02:00
    },
    "check-every-day-to-delete-api-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_api_logs",
        "schedule": crontab(hour=2, minute=30),  # UTC 02:30
    },
    "check-every-day-to-delete-email-notification-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_email_notification_logs",
        "schedule": crontab(hour=2, minute=45),  # UTC 02:45
    },
    "check-every-day-to-delete-page-versions": {
        "task": "plane.bgtasks.cleanup_task.delete_page_versions",
        "schedule": crontab(hour=3, minute=0),  # UTC 03:00
    },
    "check-every-day-to-delete-issue-description-versions": {
        "task": "plane.bgtasks.cleanup_task.delete_issue_description_versions",
        "schedule": crontab(hour=3, minute=15),  # UTC 03:15
    },
    "check-every-day-to-delete-webhook-logs": {
        "task": "plane.bgtasks.cleanup_task.delete_webhook_logs",
        "schedule": crontab(hour=3, minute=30),  # UTC 03:30
    },
    "check-every-day-to-delete-exporter-history": {
        "task": "plane.bgtasks.exporter_expired_task.delete_old_s3_link",
        "schedule": crontab(hour=3, minute=45),  # UTC 03:45
    },
    "check-every-day-to-scan-release-overdues": {
        "task": "plane.bgtasks.release_overdue_task.scan_release_overdues",
        "schedule": crontab(hour=0, minute=0),  # UTC 04:00
    },
    "check-every-day-to-scan-cycle-overdues": {
        "task": "plane.bgtasks.cycle_overdue_task.scan_cycle_overdues",
        "schedule": crontab(hour=0, minute=10),  # UTC 04:10
    },
    "sync-external-integrations-daily": {
        "task": "plane.bgtasks.external_integration_sync_task.sync_external_integrations",
        "schedule": crontab(hour=21, minute=0),  # UTC 21:00，北京 05:00
    },
}


# 日志统一用 Django 的 LOGGING。接了这个信号，Celery 就不会再清空 root logger 换成自己的格式
@setup_logging.connect
def configure_logging(*args, **kwargs):
    from django.conf import settings

    dictConfig(settings.LOGGING)


# Load task modules from all registered Django app configs.
app.autodiscover_tasks()

app.conf.beat_scheduler = "django_celery_beat.schedulers.DatabaseScheduler"
