"""订阅人、通知对象、我的订阅、发送记录的查询与维护（视图只做参数和权限）。"""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from plane.db.models import (
    Cycle,
    IssueSubscriber,
    NotifyMail,
    NotifyMode,
    NotifySubscriber,
    Project,
    ProjectMember,
    ProjectStage,
    Release,
    Requirement,
    TestPlan,
    User,
)

from plane.utils.profile_metrics import _accessible_project_ids, accessible_product_ids

from .entities import resolve_entity
from .rule_settings import scope_modes
from .rules import ROLE_LABELS, SUBSCRIBER, SUBSCRIBER_LABELS

SUBSCRIBABLE_TYPES = tuple(NotifySubscriber.EntityType.values)
SUBSCRIBER_MODES = (NotifyMode.INSTANT, NotifyMode.DIGEST)
# 「我的订阅」里的类型顺序；工作项用的是 IssueSubscriber
MY_SUBSCRIPTION_TYPES = ("issue", "requirement", "cycle", "release", "project_stage", "test_plan")


def _user_cards(user_ids):
    users = User.objects.filter(pk__in=user_ids).values("id", "display_name", "first_name", "last_name", "email")
    cards = {}
    for user in users:
        name = user["display_name"] or f"{user['first_name']} {user['last_name']}".strip() or user["email"]
        cards[str(user["id"])] = {"id": str(user["id"]), "display_name": name}
    return cards


# ──────────────────────────────── 对象上的订阅人 ────────────────────────────────


def list_subscribers(entity_type, entity_id):
    rows = list(
        NotifySubscriber.objects.filter(entity_type=entity_type, entity_id=entity_id)
        .order_by("created_at")
        .values("id", "subscriber_id", "mode", "created_at")
    )
    cards = _user_cards([row["subscriber_id"] for row in rows])
    return [
        {
            "id": str(row["id"]),
            "subscriber_id": str(row["subscriber_id"]),
            "display_name": cards.get(str(row["subscriber_id"]), {}).get("display_name", ""),
            "mode": row["mode"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def add_subscribers(ctx, user_ids, mode, *, members_only=True):
    """加订阅人；已经是订阅人的只改接收方式，返回实际处理的人数。

    给别人加时只接受本项目的活跃成员；自己订阅（``members_only=False``）只要能进项目就行，
    调用方已经验过。
    """
    wanted = {str(user_id) for user_id in user_ids}
    if ctx.project_id and members_only:
        wanted &= {
            str(member_id)
            for member_id in ProjectMember.objects.filter(
                project_id=ctx.project_id, member_id__in=wanted, is_active=True
            ).values_list("member_id", flat=True)
        }
    existing = {
        str(row.subscriber_id): row
        for row in NotifySubscriber.objects.filter(
            entity_type=ctx.entity_type, entity_id=ctx.entity_id, subscriber_id__in=wanted
        )
    }
    for user_id in wanted:
        row = existing.get(user_id)
        if row is None:
            NotifySubscriber.objects.create(
                workspace_id=ctx.workspace_id,
                project_id=ctx.project_id,
                entity_type=ctx.entity_type,
                entity_id=ctx.entity_id,
                subscriber_id=user_id,
                mode=mode,
            )
        elif row.mode != mode:
            row.mode = mode
            row.save(update_fields=["mode", "updated_at"])
    return len(wanted)


def scope(ctx):
    """「通知对象」区块：这个对象的邮件会即时发给谁、进谁的每日摘要。"""
    modes, subscribers_reachable = scope_modes(ctx.entity_type, ctx.workspace_id)
    labels = ROLE_LABELS.get(ctx.entity_type, {})
    subscriber_label = SUBSCRIBER_LABELS.get(ctx.entity_type, "订阅人")
    instant_subscribers = [user_id for user_id, mode in ctx.subscribers if mode == NotifyMode.INSTANT]
    digest_subscribers = [user_id for user_id, mode in ctx.subscribers if mode != NotifyMode.INSTANT]

    all_ids = {user_id for ids in ctx.roles.values() for user_id in ids} | {user_id for user_id, _ in ctx.subscribers}
    cards = _user_cards(all_ids)

    def chip(role, label, user_ids):
        users = [cards[str(user_id)] for user_id in user_ids if str(user_id) in cards]
        return {"role": role, "label": label, "users": users}

    result = {NotifyMode.INSTANT: [], NotifyMode.DIGEST: []}
    for role, label in labels.items():
        user_ids = ctx.roles.get(role) or []
        if user_ids and modes.get(role) in result:
            result[modes[role]].append(chip(role, label, user_ids))
    if instant_subscribers and subscribers_reachable:
        result[NotifyMode.INSTANT].append(chip(SUBSCRIBER, subscriber_label, instant_subscribers))
    if digest_subscribers and SUBSCRIBER in modes:
        result[NotifyMode.DIGEST].append(chip(SUBSCRIBER, subscriber_label, digest_subscribers))
    return {"instant": result[NotifyMode.INSTANT], "digest": result[NotifyMode.DIGEST]}


# ──────────────────────────────── 我的订阅 ────────────────────────────────


def _object_names(rows):
    """NotifySubscriber 行 → {(类型, id): (名称, 站内路径后缀)}。"""
    ids = {}
    for row in rows:
        ids.setdefault(row["entity_type"], set()).add(row["entity_id"])
    names = {}
    for release in Release.objects.filter(pk__in=ids.get("release", ())).values("id", "name"):
        names[("release", release["id"])] = (release["name"], f"releases/{release['id']}/overview")
    for cycle in Cycle.objects.filter(pk__in=ids.get("cycle", ())).values("id", "name"):
        names[("cycle", cycle["id"])] = (cycle["name"], f"cycles/{cycle['id']}/overview")
    for stage in ProjectStage.objects.filter(pk__in=ids.get("project_stage", ())).values("id", "name"):
        names[("project_stage", stage["id"])] = (stage["name"], f"stages/{stage['id']}")
    for plan in TestPlan.objects.filter(pk__in=ids.get("test_plan", ())).values("id", "name"):
        names[("test_plan", plan["id"])] = (plan["name"], f"testhub/plan-cases?planId={plan['id']}")
    for requirement in Requirement.objects.filter(pk__in=ids.get("requirement", ())).values(
        "id", "code", "title", "product_id"
    ):
        label = f"{requirement['code']} {requirement['title']}".strip()
        names[("requirement", requirement["id"])] = (label, requirement["product_id"])
    return names


def my_subscriptions(workspace, user):
    """当前用户在这个工作区的全部订阅，新的在前。行数不大，筛选和分页在调用方做。

    只列他现在还能进的项目 / 产品里的对象：被移出之后订阅记录还在，但名称不能再给他看
    （这些订阅也已经不会再给他发邮件，见 ``emit.with_project_access``）。
    """
    slug = workspace.slug
    project_ids = _accessible_project_ids(slug, user)
    rows = []
    issue_rows = IssueSubscriber.objects.filter(
        workspace_id=workspace.id, subscriber_id=user.id, issue__deleted_at__isnull=True, project_id__in=project_ids
    ).values(
        "id", "mode", "created_at", "issue_id", "issue__name", "issue__sequence_id", "project_id",
        "project__name", "project__identifier",
    )
    for row in issue_rows:
        rows.append(
            {
                "id": str(row["id"]),
                "type": "issue",
                "entity_id": str(row["issue_id"]),
                "code": f"{row['project__identifier']}-{row['issue__sequence_id']}",
                "name": row["issue__name"],
                "project_id": str(row["project_id"]),
                "project_name": row["project__name"],
                "mode": row["mode"],
                "created_at": row["created_at"],
                "url_path": f"/{slug}/projects/{row['project_id']}/issues/{row['issue_id']}",
            }
        )
    object_rows = list(
        NotifySubscriber.objects.filter(workspace_id=workspace.id, subscriber_id=user.id).values(
            "id", "mode", "created_at", "entity_type", "entity_id", "project_id"
        )
    )
    names = _object_names(object_rows)
    project_names = dict(
        Project.objects.filter(pk__in={row["project_id"] for row in object_rows if row["project_id"]}).values_list(
            "id", "name"
        )
    )
    allowed_projects = set(project_ids.values_list("id", flat=True)) if object_rows else set()
    allowed_products = None
    for row in object_rows:
        found = names.get((row["entity_type"], row["entity_id"]))
        if found is None:
            continue
        name, suffix = found
        if row["entity_type"] == "requirement":
            # 需求归产品，suffix 是产品 id
            if suffix:
                if allowed_products is None:
                    allowed_products = set(accessible_product_ids(slug, user).values_list("id", flat=True))
                if suffix not in allowed_products:
                    continue
            url_path = f"/{slug}/products/{suffix}/requirements?peek={row['entity_id']}" if suffix else ""
        else:
            if row["project_id"] not in allowed_projects:
                continue
            url_path = f"/{slug}/projects/{row['project_id']}/{suffix}" if row["project_id"] else ""
        rows.append(
            {
                "id": str(row["id"]),
                "type": row["entity_type"],
                "entity_id": str(row["entity_id"]),
                "code": "",
                "name": name,
                "project_id": str(row["project_id"]) if row["project_id"] else None,
                "project_name": project_names.get(row["project_id"], ""),
                "mode": row["mode"],
                "created_at": row["created_at"],
                "url_path": url_path,
            }
        )
    rows.sort(key=lambda row: row["created_at"], reverse=True)
    return rows


def my_subscription_model(kind):
    return IssueSubscriber if kind == "issue" else NotifySubscriber


# ──────────────────────────────── 邮件发送记录 ────────────────────────────────

MAIL_RANGES = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}


def mail_stats(workspace_id):
    now = timezone.now()
    mails = NotifyMail.objects.filter(workspace_id=workspace_id)
    return {
        "sent_24h": mails.filter(status=NotifyMail.Status.SENT, sent_at__gte=now - timedelta(hours=24)).count(),
        "failed": mails.filter(status=NotifyMail.Status.FAILED).count(),
        "no_recipient_7d": mails.filter(
            status=NotifyMail.Status.NO_RECIPIENT, created_at__gte=now - timedelta(days=7)
        ).count(),
        "pending": mails.filter(status=NotifyMail.Status.PENDING).count(),
    }


def mail_queryset(workspace_id, *, status=None, kind=None, time_range=None, search=None):
    mails = NotifyMail.objects.filter(workspace_id=workspace_id).select_related("receiver")
    if status in NotifyMail.Status.values:
        mails = mails.filter(status=status)
    if kind in NotifyMail.Kind.values:
        mails = mails.filter(kind=kind)
    if time_range in MAIL_RANGES:
        mails = mails.filter(created_at__gte=timezone.now() - MAIL_RANGES[time_range])
    needle = (search or "").strip()
    if needle:
        mails = mails.filter(
            Q(subject__icontains=needle)
            | Q(receiver__display_name__icontains=needle)
            | Q(receiver__email__icontains=needle)
        )
    return mails.order_by("-created_at")


def subscribable_entity(entity_type, entity_id, project_id=None):
    """订阅人接口用：对象存在、类型可订阅、且属于这个项目，否则返回 None。"""
    if entity_type not in SUBSCRIBABLE_TYPES:
        return None
    ctx = resolve_entity(entity_type, entity_id)
    if ctx is None or (project_id and str(ctx.project_id) != str(project_id)):
        return None
    return ctx
