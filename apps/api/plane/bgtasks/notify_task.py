"""统一通知入口的后台任务：即时邮件的合并与投递、每日摘要、过期记录清理。

真正发信的只有 ``flush_notify_mails`` 一个任务，带锁，同一时刻只有一个在跑 —— 邮件服务器再慢，
也最多占住一个工作进程，也不会有两处同时发同一封。每日摘要任务只负责组装并排进待发送。
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from plane.db.models import NotifyEvent, NotifyMail
from plane.settings.redis import redis_instance
from plane.utils.exception_logger import log_exception
from plane.utils.notify.digest import send_digests
from plane.utils.notify.mailer import flush

FLUSH_LOCK = "notify:flush:lock"
DIGEST_LOCK = "notify:digest:lock"
# 发送任务锁的有效期。一轮投递最多跑 conf.DELIVER_BUDGET_SECONDS（8 分钟），留足余量
FLUSH_LOCK_SECONDS = 15 * 60
# 发送记录和事件保留多久
KEEP_MAIL_DAYS = 90
KEEP_EVENT_DAYS = 30


def _locked(key, seconds, work):
    """拿不到锁（上一轮还没跑完）就跳过这一轮。"""
    redis = redis_instance()
    if not redis.set(key, "1", nx=True, ex=seconds):
        return None
    try:
        return work()
    except Exception as error:
        log_exception(error)
        return None
    finally:
        redis.delete(key)


@shared_task
def flush_notify_mails():
    """每分钟：把攒够时间的即时事件合成邮件发出，并重试到点的失败邮件。"""
    return _locked(FLUSH_LOCK, FLUSH_LOCK_SECONDS, flush)


@shared_task
def send_notify_digests():
    """工作日早上：组装每日摘要并排进待发送，由 ``flush_notify_mails`` 发出。"""
    return _locked(DIGEST_LOCK, 2 * 60 * 60, send_digests)


@shared_task
def purge_notify_records():
    """每天：清掉过期的事件和发送记录（失败的也清，不再只清发成功的）。"""
    now = timezone.now()
    NotifyEvent.all_objects.filter(created_at__lt=now - timedelta(days=KEEP_EVENT_DAYS)).delete()
    NotifyMail.all_objects.filter(created_at__lt=now - timedelta(days=KEEP_MAIL_DAYS)).delete()
