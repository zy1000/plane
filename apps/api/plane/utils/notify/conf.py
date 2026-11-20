"""统一通知入口的固定参数。不开放界面配置，要调就改这里。"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

# 「今天」「每天早上」都按这个时区算（服务器的 TIME_ZONE 是 UTC）
NOTIFY_TZ = ZoneInfo("Asia/Shanghai")

# 即时邮件：同一个人、同一类，攒够这么多分钟合成一封
MERGE_MINUTES = 5
# 每人每天最多这么多封即时邮件，超出的转进第二天的摘要（待我审批不受限）
DAILY_INSTANT_CAP = 20
# 规则页上展示的摘要发送时间。真正的定时在 plane/celery.py（send-notify-digests-on-workdays），改时间两处一起改
DIGEST_SCHEDULE_LABEL = "工作日 08:30"
# 待处理事项在出现后的第几天再进摘要提醒
REMIND_ON_DAYS = (1, 3, 7)
# 摘要里每一段最多列几条
DIGEST_SECTION_LIMIT = 5
DIGEST_PROJECT_LIMIT = 5
DIGEST_PER_PROJECT_LIMIT = 3

# 发信：连接和每次读写的超时秒数；失败后隔多久重试（共 3 次）
SMTP_TIMEOUT_SECONDS = 10
RETRY_DELAYS = (timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=2))
# 一轮最多处理多少封，避免一次占住工作进程太久
MAX_MAILS_PER_RUN = 200
# 一轮投递最多跑多久，到点就停，剩下的留给下一轮。必须明显小于发送任务锁的有效期
# （bgtasks/notify_task.FLUSH_LOCK_SECONDS）：锁过期后下一轮会进来，两轮同时发就会重复投递
DELIVER_BUDGET_SECONDS = 8 * 60


def local_today(now=None):
    return (now or timezone.now()).astimezone(NOTIFY_TZ).date()


def local_day_start(day):
    """本地某一天 0 点对应的时刻。"""
    return datetime.combine(day, time.min, tzinfo=NOTIFY_TZ)
