"""工作区对内置规则的修改：读出生效的规则、保存，以及规则页的数据。

内置规则在 ``rules.py``；工作区改过的格子存在 ``NotifyRuleOverride``，没改过的跟随内置规则。
"""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from plane.db.models import NotifyCategory, NotifyEvent, NotifyMail, NotifyMode, NotifyRuleOverride

from .conf import DAILY_INSTANT_CAP, DIGEST_SCHEDULE_LABEL, MERGE_MINUTES, REMIND_ON_DAYS
from .rules import (
    EVENT_LABELS,
    RULE_GROUPS,
    RULES,
    SUBSCRIBER,
    Target,
    configurable_roles,
    event_group,
    role_label,
)

RULE_MODES = (NotifyMode.INSTANT, NotifyMode.DIGEST, NotifyMode.NONE)
# 日均即时邮件按最近多少天估算
ESTIMATE_DAYS = 30


def workspace_overrides(workspace_id, event=None):
    """{事件: {角色: 方式}}。传 ``event`` 只取这一个事件的。"""
    rows = NotifyRuleOverride.objects.filter(workspace_id=workspace_id)
    if event is not None:
        rows = rows.filter(event=event)
    overrides = {}
    for code, role, mode in rows.values_list("event", "role", "mode"):
        overrides.setdefault(code, {})[role] = mode
    return overrides


def default_modes(event):
    """内置规则下各可配角色的方式，没列出的角色是「不发送」。"""
    defaults = {target.role: target.mode for target in RULES[event].targets}
    return {role: defaults.get(role, NotifyMode.NONE) for role in configurable_roles(event)}


def effective_targets(event, workspace_id, overrides=None):
    """这个工作区里这个事件实际生效的收件目标，以及被显式关掉的角色。

    返回 ``(targets, blocked)``。内置规则里没有、是工作区加进来的角色，一律算「知会」。
    """
    rule = RULES[event]
    changed = (overrides if overrides is not None else workspace_overrides(workspace_id, event)).get(event)
    if not changed:
        return rule.targets, frozenset()
    defaults = {target.role: target for target in rule.targets}
    targets, blocked = [], set()
    for role in configurable_roles(event):
        default = defaults.get(role)
        mode = changed.get(role, default.mode if default else NotifyMode.NONE)
        if mode == NotifyMode.NONE:
            if role in changed:
                blocked.add(role)
            continue
        targets.append(Target(role, default.category if default else NotifyCategory.INFORM, mode))
    return tuple(targets), frozenset(blocked)


def scope_modes(entity_type, workspace_id):
    """某类对象上每个角色最高会以什么方式收到邮件 {角色: "instant" | "digest"}，以及订阅人是否还收得到。

    详情页的「通知对象」区块用，已经算上工作区改过的规则。
    """
    overrides = workspace_overrides(workspace_id)
    modes, subscribers_reachable = {}, False
    for event, rule in RULES.items():
        if rule.entity != entity_type:
            continue
        targets, blocked = effective_targets(event, workspace_id, overrides)
        if SUBSCRIBER not in blocked and any(target.category == NotifyCategory.INFORM for target in targets):
            subscribers_reachable = True
        for target in targets:
            # new_owner / new_assignee 这类「新任」角色，在对象上就是 owner / assignee 本人
            role = target.role.removeprefix("new_")
            if modes.get(role) != NotifyMode.INSTANT:
                modes[role] = target.mode
    return modes, subscribers_reachable


def _daily_instant(workspace_id):
    """{事件: 近 30 天日均即时条数}，按实际入队的即时事件算。"""
    since = timezone.now() - timedelta(days=ESTIMATE_DAYS)
    rows = (
        NotifyEvent.objects.filter(workspace_id=workspace_id, mode=NotifyMode.INSTANT, created_at__gte=since)
        .values("event")
        .annotate(total=Count("id"))
    )
    return {row["event"]: round(row["total"] / ESTIMATE_DAYS, 1) for row in rows}


def rule_row(event, changed, daily):
    """规则页的一行。``changed`` 是这个事件被改过的 {角色: 方式}。"""
    defaults = default_modes(event)
    group, object_label = event_group(event)
    roles = [
        {
            "role": role,
            "label": role_label(event, role),
            "mode": changed.get(role, default),
            "default_mode": default,
        }
        for role, default in defaults.items()
    ]
    return {
        "event": event,
        "group": group,
        "object": object_label,
        "label": EVENT_LABELS.get(event, event),
        "roles": roles,
        "modified": any(item["mode"] != item["default_mode"] for item in roles),
        "daily_instant": daily.get(event, 0),
    }


def rules_payload(workspace_id):
    """「通知规则」页的全部数据：参数（只读）、分组、每条规则、发送失败数（页签角标用）。"""
    overrides = workspace_overrides(workspace_id)
    daily = _daily_instant(workspace_id)
    rules = [rule_row(event, overrides.get(event, {}), daily) for event in RULES]
    counts = {}
    for rule in rules:
        counts[rule["group"]] = counts.get(rule["group"], 0) + 1
    return {
        "params": {
            "merge_minutes": MERGE_MINUTES,
            "daily_instant_cap": DAILY_INSTANT_CAP,
            "digest_schedule": DIGEST_SCHEDULE_LABEL,
            "remind_on_days": list(REMIND_ON_DAYS),
        },
        "groups": [{"key": key, "label": label, "count": counts.get(key, 0)} for key, label, _prefixes in RULE_GROUPS],
        "rules": rules,
        "failed_mail_count": NotifyMail.objects.filter(
            workspace_id=workspace_id, status=NotifyMail.Status.FAILED
        ).count(),
    }


def save_rule(workspace_id, event, modes):
    """保存一条规则。``modes`` 是 {角色: 方式}；只存和默认不一样的格子，其余删掉。

    全部等于默认值时一条记录都不留，这就是「恢复默认」。
    """
    defaults = default_modes(event)
    changed = {role: mode for role, mode in modes.items() if role in defaults and mode != defaults[role]}
    NotifyRuleOverride.all_objects.filter(workspace_id=workspace_id, event=event).exclude(role__in=changed).delete()
    existing = {
        row.role: row for row in NotifyRuleOverride.all_objects.filter(workspace_id=workspace_id, event=event)
    }
    for role, mode in changed.items():
        row = existing.get(role)
        if row is None:
            NotifyRuleOverride.objects.create(workspace_id=workspace_id, event=event, role=role, mode=mode)
        elif row.mode != mode or row.deleted_at is not None:
            row.mode, row.deleted_at = mode, None
            row.save(update_fields=["mode", "deleted_at", "updated_at"])
    return rule_row(event, changed, _daily_instant(workspace_id))

