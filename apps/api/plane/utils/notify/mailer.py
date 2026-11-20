"""发信：把排队的即时事件合并成邮件、渲染、投递、失败重试。

一封邮件对应一行 ``NotifyMail``。渲染需要的内容都存在 ``payload`` 里，重发时不再回查业务表；
链接的站点地址在投递时才按收件人所属网段决定。
"""

import smtplib
import socket
import time
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import transaction
from django.db.models import Case, IntegerField, Min, When
from django.template.loader import render_to_string
from django.utils import timezone

from plane.db.models import NotifyCategory, NotifyEvent, NotifyMail, NotifyMode
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception
from plane.utils.network_zone import link_base_for_user

from .conf import (
    DAILY_INSTANT_CAP,
    DELIVER_BUDGET_SECONDS,
    MAX_MAILS_PER_RUN,
    MERGE_MINUTES,
    NOTIFY_TZ,
    RETRY_DELAYS,
    SMTP_TIMEOUT_SECONDS,
    local_day_start,
    local_today,
)

SETTINGS_PATH = "/settings/profile/notifications"
SUBSCRIPTIONS_PATH = "/settings/profile/notifications?view=subscriptions"

CATEGORY_LABELS = {
    NotifyCategory.APPROVAL: "待我处理",
    NotifyCategory.ASSIGN: "指派与提及",
    NotifyCategory.RESULT: "处理结果",
    NotifyCategory.INFORM: "动态",
}
# 类别药丸的底色 / 字色
CATEGORY_TONES = {
    NotifyCategory.APPROVAL: ("#fbf3df", "#835e0a"),
    NotifyCategory.ASSIGN: ("#e8f1fb", "#1c5590"),
    NotifyCategory.RESULT: ("#e3f4ea", "#17663a"),
    NotifyCategory.INFORM: ("#f1f3f5", "#3d434a"),
}
ACTION_LABELS = {"待审批": "前往审批", "待签批": "前往签批", "待审核": "前往审核", "待评审": "前往评审", "待复核": "前往复核"}


def display_name(user):
    if user is None:
        return ""
    return user.display_name or f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email or ""


def format_time(moment):
    return moment.astimezone(NOTIFY_TZ).strftime("%m-%d %H:%M")


# ──────────────────────────────── 组装即时邮件 ────────────────────────────────


def _instant_subject(category, items):
    if len(items) == 1:
        return f"【{items[0]['tag']}】{items[0]['title']}"
    tags = {item["tag"] for item in items}
    if len(tags) == 1:
        return f"【{items[0]['tag']}】{items[0]['title']} 等 {len(items)} 项"
    return f"【{CATEGORY_LABELS.get(category, '通知')}】{len(items)} 项更新"


def build_instant_mail(events, now):
    """同一个人、同一类的若干事件 → 一封待发邮件，并把事件挂到这封邮件上。"""
    first = events[0]
    items = [
        {
            "tag": event.tag,
            "title": event.title,
            "summary": event.summary,
            "details": event.details,
            "url_path": event.url_path,
            "origin": event.origin,
            "actor": display_name(event.actor),
            "time": format_time(event.created_at),
        }
        for event in events
    ]
    with transaction.atomic():
        mail = NotifyMail.objects.create(
            workspace_id=first.workspace_id,
            receiver_id=first.receiver_id,
            kind=NotifyMail.Kind.INSTANT,
            category=first.category,
            subject=_instant_subject(first.category, items)[:500],
            payload={"items": items},
        )
        NotifyEvent.objects.filter(pk__in=[event.pk for event in events]).update(mail=mail, handled_at=now)
    return mail


def collect_instant(now=None):
    """攒够合并间隔的即时事件，按「人 × 类别」合成邮件；超过每日上限的转进摘要。返回新建的邮件。"""
    now = now or timezone.now()
    queue = NotifyEvent.objects.filter(mode=NotifyMode.INSTANT, handled_at__isnull=True)
    groups = (
        queue.values("workspace_id", "receiver_id", "category")
        .annotate(first=Min("created_at"))
        .filter(first__lte=now - timedelta(minutes=MERGE_MINUTES))
        .order_by("first")[:MAX_MAILS_PER_RUN]
    )
    day_start = local_day_start(local_today(now))
    mails = []
    for group in list(groups):
        events = list(
            queue.filter(
                workspace_id=group["workspace_id"], receiver_id=group["receiver_id"], category=group["category"]
            )
            .select_related("actor")
            .order_by("created_at")
        )
        if not events:
            continue
        if group["category"] != NotifyCategory.APPROVAL:
            sent_today = (
                NotifyMail.objects.filter(
                    receiver_id=group["receiver_id"], kind=NotifyMail.Kind.INSTANT, created_at__gte=day_start
                )
                .exclude(category=NotifyCategory.APPROVAL)
                .count()
            )
            if sent_today >= DAILY_INSTANT_CAP:
                NotifyEvent.objects.filter(pk__in=[event.pk for event in events]).update(mode=NotifyMode.DIGEST)
                continue
        mails.append(build_instant_mail(events, now))
    return mails


# ──────────────────────────────── 渲染 ────────────────────────────────


def _link_base(receiver, origin=""):
    fallback = origin or settings.APP_BASE_URL or settings.WEB_URL or ""
    return (link_base_for_user(receiver, fallback) or "").rstrip("/")


def _absolute(base, path):
    return f"{base}{path}" if base and path else ""


def _render_instant(mail, receiver):
    items = []
    for item in mail.payload.get("items", []):
        base = _link_base(receiver, item.get("origin") or "")
        rows = [("对象", item["title"])]
        rows.extend((label, value) for label, value in item.get("details") or [])
        if item.get("actor"):
            rows.append(("操作人", item["actor"]))
        rows.append(("时间", item["time"]))
        items.append({**item, "url": _absolute(base, item.get("url_path") or ""), "rows": rows})
    first = items[0]
    single = len(items) == 1
    if single:
        headline = f"{first['tag']}：{first['summary']}" if first["summary"] else first["tag"]
    else:
        headline = f"{len(items)} 项{CATEGORY_LABELS.get(mail.category, '更新')}"
    pill_bg, pill_fg = CATEGORY_TONES.get(mail.category, CATEGORY_TONES[NotifyCategory.INFORM])
    return render_to_string(
        "emails/notifications/notify-instant.html",
        {
            "subject": mail.subject,
            "category_label": CATEGORY_LABELS.get(mail.category, "通知"),
            "pill_bg": pill_bg,
            "pill_fg": pill_fg,
            "headline": headline,
            "single": single,
            "first": first,
            "items": items,
            "action_label": ACTION_LABELS.get(first["tag"], "查看详情"),
            "settings_url": _absolute(_link_base(receiver), SETTINGS_PATH),
        },
    )


def _with_urls(base, node):
    """摘要 payload 里的站内路径换成带站点地址的链接：``url_path`` → ``url``，``more_path`` → ``more_url``。"""
    if isinstance(node, list):
        return [_with_urls(base, child) for child in node]
    if isinstance(node, dict):
        result = {}
        for key, value in node.items():
            if key.endswith("_path") and isinstance(value, str):
                result["url" if key == "url_path" else key[:-5] + "_url"] = _absolute(base, value)
            else:
                result[key] = _with_urls(base, value)
        return result
    return node


def _render_digest(mail, receiver):
    base = _link_base(receiver, mail.payload.get("origin") or "")
    context = _with_urls(base, mail.payload)
    context.update(
        subject=mail.subject,
        settings_url=_absolute(base, SETTINGS_PATH),
        subscriptions_url=_absolute(base, SUBSCRIPTIONS_PATH),
    )
    return render_to_string("emails/notifications/notify-digest.html", context)


def render_mail(mail, receiver):
    return _render_digest(mail, receiver) if mail.kind == NotifyMail.Kind.DIGEST else _render_instant(mail, receiver)


# ──────────────────────────────── 投递 ────────────────────────────────


class MailNotConfigured(Exception):
    pass


def _open_connection():
    host, username, password, port, use_tls, use_ssl, from_email = get_email_configuration()
    if not host:
        raise MailNotConfigured()
    connection = get_connection(
        host=host,
        port=int(port or 25),
        username=username,
        password=password,
        use_tls=use_tls == "1",
        use_ssl=use_ssl == "1",
        timeout=SMTP_TIMEOUT_SECONDS,
    )
    connection.open()
    return connection, from_email


def describe_error(error):
    """给管理员看的一句话失败原因。"""
    if isinstance(error, MailNotConfigured):
        return "未配置邮件服务器"
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "收件地址被邮件服务器拒绝"
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "邮件服务器认证失败"
    if isinstance(error, smtplib.SMTPSenderRefused):
        return "发件地址被邮件服务器拒绝"
    if isinstance(error, (socket.timeout, TimeoutError)):
        return "连接邮件服务器超时"
    if isinstance(error, ConnectionRefusedError):
        return "邮件服务器拒绝连接"
    if isinstance(error, smtplib.SMTPServerDisconnected):
        return "邮件服务器断开了连接"
    if isinstance(error, OSError):
        return f"无法连接邮件服务器：{error}"[:500]
    return f"{type(error).__name__}：{error}"[:500]


def _is_connection_error(error):
    return isinstance(error, (OSError, smtplib.SMTPServerDisconnected, MailNotConfigured))


def _mark_failed(mail, error, now):
    """记失败原因并排下一次重试；地址被拒这类重试也没用的不再排。"""
    mail.status = NotifyMail.Status.FAILED
    permanent = isinstance(error, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused))
    retries_left = mail.attempts <= len(RETRY_DELAYS)
    if permanent or not retries_left:
        mail.next_retry_at = None
        mail.reason = describe_error(error) if permanent else f"{describe_error(error)}，已重试 {len(RETRY_DELAYS)} 次"
    else:
        mail.next_retry_at = now + RETRY_DELAYS[mail.attempts - 1]
        mail.reason = describe_error(error)
    mail.reason = mail.reason[:500]
    mail.save(update_fields=["status", "reason", "next_retry_at", "attempts", "updated_at"])


def deliver(mails):
    """逐封投递，共用一条连接。返回发成功的封数。

    **只能由发送任务（``flush``）调用**：它带着锁，同一时刻只有一个在跑。别的地方（摘要、重发）
    只把邮件置成待发送，不要自己投递 —— 两处同时发同一封会重复送达。

    连接层面的失败（连不上、超时、断开）不逐封重试：剩下的直接记失败、等下一轮，
    避免邮件服务器不通时每封都等一次超时。跑满时间预算就停，没轮到的原样留给下一轮。
    """
    mails = [mail for mail in mails if mail.receiver_id]
    if not mails:
        return 0
    now = timezone.now()
    deadline = time.monotonic() + DELIVER_BUDGET_SECONDS
    try:
        connection, from_email = _open_connection()
    except Exception as error:
        if not _is_connection_error(error):
            log_exception(error)
        for mail in mails:
            mail.attempts += 1
            _mark_failed(mail, error, now)
        return 0

    sent = 0
    broken = None
    try:
        for mail in mails:
            if time.monotonic() > deadline:
                break
            mail.attempts += 1
            if broken is not None:
                _mark_failed(mail, broken, now)
                continue
            try:
                receiver = mail.receiver
                html = render_mail(mail, receiver)
                message = EmailMultiAlternatives(
                    subject=mail.subject,
                    body=generate_plain_text_from_html(html),
                    from_email=from_email,
                    to=[receiver.email],
                    connection=connection,
                )
                message.attach_alternative(html, "text/html")
                message.send()
            except Exception as error:
                if _is_connection_error(error):
                    broken = error
                else:
                    log_exception(error)
                _mark_failed(mail, error, now)
                continue
            mail.status = NotifyMail.Status.SENT
            mail.sent_at = timezone.now()
            mail.reason = ""
            mail.next_retry_at = None
            mail.save(update_fields=["status", "sent_at", "reason", "next_retry_at", "attempts", "updated_at"])
            sent += 1
    finally:
        try:
            connection.close()
        except Exception:
            pass
    return sent


def due_mails(now=None):
    """待发送的，加上到了重试时间的失败邮件。即时邮件排在摘要前面：早上几百封摘要不该把待审批堵在后面。"""
    now = now or timezone.now()
    pending = NotifyMail.objects.filter(status=NotifyMail.Status.PENDING)
    retry = NotifyMail.objects.filter(status=NotifyMail.Status.FAILED, next_retry_at__lte=now)
    instant_first = Case(When(kind=NotifyMail.Kind.INSTANT, then=0), default=1, output_field=IntegerField())
    return list(
        (pending | retry).select_related("receiver").order_by(instant_first, "created_at")[:MAX_MAILS_PER_RUN]
    )


def flush(now=None):
    """后台任务每分钟跑一次：合并新事件 → 投递待发和该重试的邮件。"""
    collect_instant(now)
    return deliver(due_mails(now))


def requeue(mail):
    """「重发」：回到待发送，重试次数清零，由下一轮投递。"""
    mail.status = NotifyMail.Status.PENDING
    mail.attempts = 0
    mail.reason = ""
    mail.next_retry_at = None
    mail.save(update_fields=["status", "attempts", "reason", "next_retry_at", "updated_at"])
