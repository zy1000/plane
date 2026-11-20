"""每日摘要：工作日早上给每个人汇总一封。

三部分内容：
- 待我处理：发信时现算（复用「我的工作」的待处理口径），别人已经处理掉的不会再出现
- 到期与延期：我负责的工作项、迭代、发布
- 更新：前一天攒下的「每日摘要」事件，按对象合并

没有内容的人不发。待处理和延期的事项不天天催：只在出现后的第 1、3、7 天把人叫回来，
但只要当天这封摘要要发，就把当前全部待处理列出来。
"""

from datetime import date, datetime, timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from plane.db.models import (
    Cycle,
    Issue,
    NotifyEvent,
    NotifyMail,
    NotifyMode,
    PlanCaseRecord,
    Release,
    StageReviewActivity,
    StageReviewStatus,
    Workspace,
    WorkspaceMember,
)
from plane.utils.exception_logger import log_exception
from plane.utils.profile_metrics import _accessible_project_ids
from plane.utils.user_work import build_pending_rows

from .conf import (
    DIGEST_PER_PROJECT_LIMIT,
    DIGEST_PROJECT_LIMIT,
    DIGEST_SECTION_LIMIT,
    NOTIFY_TZ,
    REMIND_ON_DAYS,
    local_day_start,
    local_today,
)
from .mailer import display_name, format_time

# 「待我处理」只取等我签字的事；我自己名下的工作项靠「到期与延期」提醒
PENDING_TYPES = (
    "review",
    "review_activity",
    "tailoring_approval",
    "issue_approval",
    "requirement_change",
    "case_review",
    "plan_review",
)
WEEKDAYS = ("周一", "周二", "周三", "周四", "周五", "周六", "周日")
ENTITY_LABELS = {
    "release": "发布",
    "cycle": "迭代",
    "issue": "工作项",
    "requirement": "需求",
    "requirement_change": "需求变更",
    "risk": "风险",
    "stage_review": "阶段评审",
    "review_tailoring": "评审裁剪",
    "project_stage": "项目阶段",
    "case_review": "用例评审",
    "test_plan": "测试计划",
}
TONE_AMBER = ("#fbf3df", "#835e0a")
TONE_RED = ("#fbe9e5", "#a32d15")
TONE_GRAY = ("#f1f3f5", "#3d434a")


def _tagged(tag, tone, **row):
    return {"tag": tag, "tag_bg": tone[0], "tag_fg": tone[1], **row}


def _to_date(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if isinstance(value, datetime):
        return value.astimezone(NOTIFY_TZ).date() if timezone.is_aware(value) else value.date()
    return value if isinstance(value, date) else None


def _remind_due(start, today, prev_day):
    """start 之后的第 1、3、7 天里，有没有落在「上一封摘要之后、今天及之前」的。"""
    return bool(start) and any(prev_day < start + timedelta(days=days) <= today for days in REMIND_ON_DAYS)


def _waiting(start, today):
    days = (today - start).days if start else 0
    return f"已等待 {days} 天" if days >= 1 else "今天"


# ──────────────────────────────── 待我处理 ────────────────────────────────


def _pending_entry(slug, row):
    """一条待处理 → (合并用的 key, 标签, 标题, 链接)；不进摘要的返回 None。"""
    kind, meta = row["type"], row.get("meta") or {}
    project_id, product_id = row.get("project_id"), row.get("product_id")
    label = f"{row.get('code') or ''} {row.get('title') or ''}".strip()
    if kind in ("review", "review_activity"):
        # 负责人自己名下还没开始 / 还在评审的不算「等我签字」
        if (row.get("action") or {}).get("key") != "audit":
            return None
        return row["key"], "待审核", label, f"/{slug}/projects/{project_id}/reviews/stage-reviews/{row['id']}"
    if kind == "tailoring_approval":
        return row["key"], "待签批", label, f"/{slug}/projects/{project_id}/reviews/tailorings/{row['id']}"
    if kind == "issue_approval":
        path = f"/{slug}/projects/{project_id}/issues/{meta.get('issue_id')}" if meta.get("issue_id") else ""
        return row["key"], "待审批", label, path
    if kind == "requirement_change":
        if product_id:
            path = f"/{slug}/products/{product_id}/requirements?tab=changes&cr={row['id']}"
        else:
            path = f"/{slug}/projects/{project_id}/requirements?tab=changes&cr={row['id']}"
        return row["key"], "待审批", label, path
    if kind == "case_review":
        # 一个评审下的用例合成一行
        path = f"/{slug}/products/{product_id}/testhub/caseManagementReviewDetail?review_id={meta.get('review_id')}"
        return f"case_review:{meta.get('review_id')}", "待评审", meta.get("review_name") or "用例评审", path
    if kind == "plan_review":
        path = f"/{slug}/projects/{project_id}/testhub/plan-cases?planId={meta.get('plan_id')}" if project_id else ""
        return f"plan_review:{meta.get('plan_id')}", "待复核", meta.get("plan_name") or "测试计划", path
    return None


def _pending_since(rows):
    """这两类事项「从什么时候开始等我」不是对象的创建时间，要另外取：

    - 阶段评审：最近一次提交审核（状态变成审核中）的时间
    - 计划复核：这条用例最近一次执行的时间

    用创建时间的话，一条早就建好的评审今天才提交审核，会显示成已等待几十天，
    第 1、3、7 天的提醒日期也早就过了。返回 {待处理行的 key: 时间}，查不到的不在里面。
    """
    since = {}
    reviews = {row["id"]: row["key"] for row in rows if row["type"] in ("review", "review_activity")}
    if reviews:
        submitted = (
            StageReviewActivity.objects.filter(
                stage_review_id__in=list(reviews), field="status", new_value=StageReviewStatus.IN_APPROVAL
            )
            .values("stage_review_id")
            .annotate(at=Max("created_at"))
        )
        for item in submitted:
            since[reviews[str(item["stage_review_id"])]] = item["at"]
    plan_cases = {row["id"]: row["key"] for row in rows if row["type"] == "plan_review"}
    if plan_cases:
        executed = (
            PlanCaseRecord.objects.filter(plan_case_id__in=list(plan_cases))
            .values("plan_case_id")
            .annotate(at=Max("created_at"))
        )
        for item in executed:
            since[plan_cases[str(item["plan_case_id"])]] = item["at"]
    return since


def _pending(workspace, user, today, prev_day):
    """返回 (行列表, 是否有到了提醒日的)。"""
    merged = {}
    pending_rows = build_pending_rows(workspace.slug, user.id, user, PENDING_TYPES)
    since = _pending_since(pending_rows)
    for row in pending_rows:
        entry = _pending_entry(workspace.slug, row)
        if entry is None:
            continue
        key, tag, title, path = entry
        started = _to_date(since.get(row["key"]) or row.get("created_at"))
        item = merged.setdefault(key, {"tag": tag, "title": title, "path": path, "count": 0, "started": started})
        item["count"] += 1
        if started and (item["started"] is None or started < item["started"]):
            item["started"] = started
    rows, remind = [], False
    for item in merged.values():
        title = f"{item['title']}（{item['count']} 条用例）" if item["tag"] in ("待评审", "待复核") else item["title"]
        rows.append(
            _tagged(
                item["tag"], TONE_AMBER, title=title, meta=_waiting(item["started"], today), url_path=item["path"],
                action="处理", started=item["started"],
            )
        )
        remind = remind or _remind_due(item["started"], today, prev_day)
    rows.sort(key=lambda row: row.pop("started") or today)
    return rows, remind


# ──────────────────────────────── 到期与延期 ────────────────────────────────


def _due(workspace, user, today, prev_day):
    """返回 (行列表, 今日到期数, 已延期数)。延期的只在第 1、3、7 天列出。

    只看他现在还能进的项目：被移出项目后负责人字段可能还指着他，标题不能再出现在他的邮件里。
    """
    slug = workspace.slug
    project_ids = _accessible_project_ids(slug, user)
    rows, due_today, overdue = [], 0, 0
    issues = (
        Issue.issue_objects.filter(
            workspace_id=workspace.id,
            project_id__in=project_ids,
            issue_assignee__assignee_id=user.id,
            issue_assignee__deleted_at__isnull=True,
            target_date__lte=today,
            target_date__gte=today - timedelta(days=max(REMIND_ON_DAYS) + 2),
        )
        .exclude(state__group__in=("completed", "cancelled"))
        .select_related("project")
        .distinct()
        .order_by("target_date")
    )
    for issue in issues:
        title = f"{issue.project.identifier}-{issue.sequence_id} {issue.name}"
        path = f"/{slug}/projects/{issue.project_id}/issues/{issue.id}"
        if issue.target_date == today:
            due_today += 1
            rows.append(_tagged("今日到期", TONE_GRAY, title=title, meta="工作项", url_path=path))
        elif _remind_due(issue.target_date, today, prev_day):
            overdue += 1
            late = (today - issue.target_date).days
            rows.append(_tagged(f"延期 {late} 天", TONE_RED, title=title, meta="工作项", url_path=path))

    day_start, day_end = local_day_start(today), local_day_start(today + timedelta(days=1))
    cycles = Cycle.objects.filter(
        workspace_id=workspace.id,
        project_id__in=project_ids,
        owned_by_id=user.id,
        archived_at__isnull=True,
        end_date__gte=day_start,
        end_date__lt=day_end,
    ).exclude(status__in=(Cycle.Status.COMPLETED, Cycle.Status.CANCELLED))
    for cycle in cycles:
        due_today += 1
        path = f"/{slug}/projects/{cycle.project_id}/cycles/{cycle.id}/overview"
        rows.append(_tagged("今日到期", TONE_GRAY, title=cycle.name, meta="迭代", url_path=path))
    releases = Release.objects.filter(
        workspace_id=workspace.id, project_id__in=project_ids, lead_id=user.id, archived_at__isnull=True, target_date=today
    ).exclude(status__in=("completed", "cancelled"))
    for release in releases:
        due_today += 1
        path = f"/{slug}/projects/{release.project_id}/releases/{release.id}/overview"
        rows.append(_tagged("今日到期", TONE_GRAY, title=release.name, meta="发布", url_path=path))
    return rows, due_today, overdue


# ──────────────────────────────── 更新 ────────────────────────────────


def _merge_events(events):
    """同一个对象的多条事件合成一行，保持最早出现的顺序。"""
    merged = {}
    for event in events:
        key = (event.entity_type, str(event.entity_id))
        item = merged.setdefault(key, {"event": event, "changes": []})
        item["event"] = event
        text = event.summary or event.tag
        if text and text not in item["changes"]:
            item["changes"].append(text)
    return list(merged.values())


def _update_row(item, tag=None):
    event, changes = item["event"], item["changes"]
    change = changes[-1] if changes else ""
    if len(changes) > 1:
        change = f"{change}（共 {len(changes)} 项变更）"
    actor = display_name(event.actor)
    row = {
        "title": event.title,
        "change": change,
        "meta": f"{actor} · {format_time(event.created_at)}" if actor else format_time(event.created_at),
        "url_path": event.url_path,
    }
    return _tagged(tag, TONE_GRAY, **row) if tag else row


def _capped(rows, limit):
    hidden = len(rows) - limit
    return rows[:limit], (f"另有 {hidden} 条未列出" if hidden > 0 else "")


def _updates(workspace, events):
    """返回 (分段列表, 更新行数)。"""
    slug = workspace.slug
    items = _merge_events(events)
    sections = []

    plans = [item for item in items if item["event"].entity_type in ("release", "cycle")]
    if plans:
        rows, more = _capped([_update_row(item) for item in plans], DIGEST_SECTION_LIMIT)
        sections.append({"title": "发布与迭代", "count": len(plans), "more_label": more, "groups": [{"rows": rows}]})

    issues = [item for item in items if item["event"].entity_type == "issue"]
    if issues:
        by_project = {}
        for item in issues:
            by_project.setdefault(item["event"].project_id, []).append(item)
        groups = []
        for project_id, project_items in list(by_project.items())[:DIGEST_PROJECT_LIMIT]:
            project = project_items[0]["event"].project
            hidden = len(project_items) > DIGEST_PER_PROJECT_LIMIT
            groups.append(
                {
                    "name": project.name if project else "",
                    "more_path": f"/{slug}/projects/{project_id}/issues" if hidden else "",
                    "more_label": f"查看全部 {len(project_items)} 条" if hidden else "",
                    "rows": [_update_row(item) for item in project_items[:DIGEST_PER_PROJECT_LIMIT]],
                }
            )
        hidden_projects = len(by_project) - DIGEST_PROJECT_LIMIT
        sections.append(
            {
                "title": "工作项",
                "count": len(issues),
                "more_label": f"另有 {hidden_projects} 个项目未列出" if hidden_projects > 0 else "",
                "groups": groups,
            }
        )

    others = [item for item in items if item["event"].entity_type not in ("release", "cycle", "issue")]
    if others:
        rows = [_update_row(item, ENTITY_LABELS.get(item["event"].entity_type, "更新")) for item in others]
        rows, more = _capped(rows, DIGEST_SECTION_LIMIT)
        sections.append({"title": "其他更新", "count": len(others), "more_label": more, "groups": [{"rows": rows}]})
    return sections, len(items)


# ──────────────────────────────── 组装与发送 ────────────────────────────────


def build_digest(workspace, user, today, prev_day):
    """组装一个人的摘要，返回 (主题, payload, 要标记的事件 id)；没有值得发的内容返回 None。"""
    events = list(
        NotifyEvent.objects.filter(
            workspace_id=workspace.id, receiver_id=user.id, mode=NotifyMode.DIGEST, handled_at__isnull=True
        )
        .select_related("actor", "project")
        .order_by("created_at")
    )
    pending_rows, remind = _pending(workspace, user, today, prev_day)
    due_rows, due_today, overdue = _due(workspace, user, today, prev_day)
    update_sections, update_count = _updates(workspace, events)
    if not (events or remind or due_rows):
        return None

    sections = []
    if pending_rows:
        rows, _more = _capped(pending_rows, DIGEST_SECTION_LIMIT)
        sections.append(
            {
                "title": "待我处理",
                "count": len(pending_rows),
                "more_path": f"/{workspace.slug}/profile/{user.id}/pending",
                "more_label": f"查看全部 {len(pending_rows)} 项",
                "groups": [{"rows": rows}],
            }
        )
    if due_rows:
        rows, more = _capped(due_rows, DIGEST_SECTION_LIMIT)
        sections.append({"title": "到期与延期", "count": len(due_rows), "more_label": more, "groups": [{"rows": rows}]})
    sections.extend(update_sections)

    parts = []
    if pending_rows:
        parts.append(f"待处理 {len(pending_rows)} 项")
    if update_count:
        parts.append(f"更新 {update_count} 条")
    if not parts:
        parts.append(f"到期与延期 {len(due_rows)} 项")
    subject = f"【每日摘要】{today.month} 月 {today.day} 日 · {'，'.join(parts)}"
    payload = {
        "date_label": f"每日摘要 · {today.isoformat()} {WEEKDAYS[today.weekday()]}",
        "tiles": [
            {"label": "待我处理", "value": len(pending_rows), "hot": True},
            {"label": "今日到期", "value": due_today, "hot": False},
            {"label": "已延期", "value": overdue, "hot": False},
            {"label": "更新", "value": update_count, "hot": False},
        ],
        "sections": sections,
        "origin": next((event.origin for event in reversed(events) if event.origin), ""),
    }
    return subject, payload, [event.pk for event in events]


def send_digests(now=None, user_ids=None, force=False):
    """给所有人组装当天的摘要并排进待发送，返回排了多少封。周末不排（``force`` 除外），同一天不会重复排。

    这里**不投递**：邮件由每分钟的发送任务统一发出（``mailer.flush``）。两处都发的话，
    这边组装几百人的工夫里发送任务已经把先建好的发走了，这边再发一遍就是重复送达。
    """
    now = now or timezone.now()
    today = local_today(now)
    if today.weekday() >= 5 and not force:
        return 0
    # 周一的「上一封」是上周五
    prev_day = today - timedelta(days=3 if today.weekday() == 0 else 1)
    day_start = local_day_start(today)
    queued = 0
    for workspace in Workspace.objects.all():
        done = set(
            NotifyMail.objects.filter(
                workspace_id=workspace.id, kind=NotifyMail.Kind.DIGEST, created_at__gte=day_start
            ).values_list("receiver_id", flat=True)
        )
        members = WorkspaceMember.objects.filter(
            workspace_id=workspace.id, is_active=True, member__is_active=True, member__is_bot=False
        ).select_related("member")
        if user_ids is not None:
            members = members.filter(member_id__in=user_ids)
        for membership in members:
            user = membership.member
            if user.id in done:
                continue
            try:
                built = build_digest(workspace, user, today, prev_day)
                if built is None:
                    continue
                subject, payload, event_ids = built
                with transaction.atomic():
                    mail = NotifyMail.objects.create(
                        workspace_id=workspace.id,
                        receiver_id=user.id,
                        kind=NotifyMail.Kind.DIGEST,
                        subject=subject[:500],
                        payload=payload,
                    )
                    NotifyEvent.objects.filter(pk__in=event_ids).update(mail=mail, handled_at=now)
                queued += 1
            except Exception as error:
                log_exception(error)
                continue
    return queued
