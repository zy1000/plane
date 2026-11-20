"""统一通知入口：业务只报「哪个对象发生了什么事」，这里负责找人、分档、入队。

入队的是 ``NotifyEvent``；真正发信在 ``mailer.py`` / ``digest.py``，由后台任务定时跑。
"""

from crum import get_current_request
from django.db import transaction

from plane.db.models import (
    NotifyCategory,
    NotifyEvent,
    NotifyMail,
    NotifyMode,
    Project,
    User,
    UserNotificationPreference,
    WorkspaceMember,
)
from plane.utils.exception_logger import log_exception

from .conf import local_day_start, local_today
from .entities import resolve_entity
from .rule_settings import effective_targets
from .rules import CATEGORY_ORDER, RULES, SUBSCRIBER

INSTANT = NotifyMode.INSTANT
DIGEST = NotifyMode.DIGEST
NONE = NotifyMode.NONE

# 「无收件人」记录里的说明用
REQUIRED_ROLE_LABELS = {"approver": "审批人", "auditor": "审核人"}

DEFAULT_PREFERENCE = {"assign_mode": INSTANT, "result_mode": INSTANT, "inform_mode": DIGEST}

# 项目上直接指定的两个角色只要求是工作区成员（研发产品经理不一定在项目成员表里），沿用原来的口径；
# 其余收件人都要现在还能进这个项目
PROJECT_LEVEL_ROLES = ("project_lead", "product_manager")


def resolve_mode(category, base_mode, preference):
    """规则给的方式 + 个人设置 → 最终方式。个人只能调低或关掉，不能把摘要调成即时。

    「待我审批」个人改不了，完全跟随规则（默认即时，管理员可以在通知规则页调整）。
    """
    if category == NotifyCategory.APPROVAL:
        return base_mode
    if category == NotifyCategory.ASSIGN:
        return DIGEST if preference["assign_mode"] == DIGEST else base_mode
    if category == NotifyCategory.RESULT:
        if preference["result_mode"] == NONE:
            return NONE
        return DIGEST if preference["result_mode"] == DIGEST else base_mode
    return NONE if preference["inform_mode"] == NONE else base_mode


def _better(current, candidate):
    """同一个人命中多个角色：即时优先于摘要；方式相同取类别靠前的。"""
    if current is None:
        return candidate
    if (candidate[1] == INSTANT) != (current[1] == INSTANT):
        return candidate if candidate[1] == INSTANT else current
    return candidate if CATEGORY_ORDER.index(candidate[0]) < CATEGORY_ORDER.index(current[0]) else current


def pick_targets(targets, roles, subscribers, blocked=()):
    """{用户 id(str): (类别, 规则给的方式)}，还没应用个人设置。

    ``targets`` 是这个工作区里生效的收件目标，``blocked`` 是被显式设成「不发送」的角色。
    """
    picked = {}

    def offer(user_id, category, mode):
        if user_id:
            key = str(user_id)
            picked[key] = _better(picked.get(key), (category, mode))

    informs = any(target.category == NotifyCategory.INFORM for target in targets)
    for target in targets:
        if target.role == SUBSCRIBER:
            for user_id, _mode in subscribers:
                offer(user_id, target.category, target.mode)
        else:
            for user_id in roles.get(target.role) or ():
                offer(user_id, target.category, target.mode)
    # 订阅人逐人设成「即时邮件」的：这个对象上所有知会类事件都即时发给他；
    # 规则里把订阅人设成「不发送」的事件除外
    if informs and SUBSCRIBER not in blocked:
        for user_id, mode in subscribers:
            if mode == INSTANT:
                offer(user_id, NotifyCategory.INFORM, INSTANT)
    return picked


def with_project_access(project_id, workspace_slug, user_ids, exempt=()):
    """从一批用户里留下现在还能进这个项目的人（``exempt`` 里的不查）。

    订阅记录、创建人 / 负责人身份在人被移出项目后都可能还在，工作区成员身份挡不住这种情况；
    不查的话，项目里的变更和评论摘录会继续发给已经没有权限的人。
    """
    # 放在函数里引入，避免与权限模块互相引用
    from plane.app.permissions import is_project_member

    exempt = {str(user_id) for user_id in exempt}
    kept = {str(user_id) for user_id in user_ids if str(user_id) in exempt}
    to_check = [user_id for user_id in user_ids if str(user_id) not in exempt]
    if not to_check:
        return kept
    project = Project.objects.filter(pk=project_id).select_related("workspace").first()
    if project is None:
        return kept
    for user in User.objects.filter(pk__in=to_check):
        if is_project_member(user, workspace_slug, project_id, project=project):
            kept.add(str(user.id))
    return kept


def _preferences(user_ids):
    preferences = {}
    rows = UserNotificationPreference.objects.filter(user_id__in=user_ids).values(
        "user_id", "assign_mode", "result_mode", "inform_mode"
    )
    for row in rows:
        preferences.setdefault(str(row.pop("user_id")), row)
    return preferences


def _request_origin():
    request = get_current_request()
    return (request.META.get("HTTP_ORIGIN") or "") if request is not None else ""


def _already_instant_today(receiver_ids, dedupe_key):
    start = local_day_start(local_today())
    return {
        str(user_id)
        for user_id in NotifyEvent.objects.filter(
            receiver_id__in=receiver_ids, dedupe_key=dedupe_key, mode=INSTANT, created_at__gte=start
        ).values_list("receiver_id", flat=True)
    }


def _emit(event, entity_type, entity_id, actor_id, summary, details, extra_roles, title, origin, dedupe_key, context):
    rule = RULES[event]
    ctx = context or resolve_entity(entity_type, entity_id)
    if ctx is None:
        return 0
    roles = {**ctx.roles, **(extra_roles or {})}
    title = (title or ctx.title)[:500]
    details = [list(pair) for pair in (details or ())]
    if ctx.project_name:
        details.insert(0, ["所属项目", ctx.project_name])

    missing = [role for role in rule.required if not roles.get(role)]
    if rule.required and len(missing) == len(rule.required):
        NotifyMail.objects.create(
            workspace_id=ctx.workspace_id,
            kind=NotifyMail.Kind.INSTANT,
            category=rule.targets[0].category,
            subject=f"【{rule.tag}】{title}"[:500],
            status=NotifyMail.Status.NO_RECIPIENT,
            reason="未找到" + "、".join(REQUIRED_ROLE_LABELS.get(role, role) for role in missing),
        )
        return 0

    targets, blocked = effective_targets(event, ctx.workspace_id)
    picked = pick_targets(targets, roles, ctx.subscribers, blocked)
    if actor_id:
        picked.pop(str(actor_id), None)
    if not picked:
        return 0

    active = {
        str(user_id)
        for user_id in WorkspaceMember.objects.filter(
            workspace_id=ctx.workspace_id,
            member_id__in=list(picked),
            is_active=True,
            member__is_active=True,
            member__is_bot=False,
        ).values_list("member_id", flat=True)
    }
    if ctx.project_id:
        exempt = [user_id for role in PROJECT_LEVEL_ROLES for user_id in roles.get(role) or ()]
        active = with_project_access(ctx.project_id, ctx.workspace_slug, active, exempt)
    preferences = _preferences(active)
    final = {}
    for user_id in active:
        category, base_mode = picked[user_id]
        mode = resolve_mode(category, base_mode, preferences.get(user_id, DEFAULT_PREFERENCE))
        if mode != NONE:
            final[user_id] = (category, mode)
    if not final:
        return 0

    if dedupe_key:
        instant_ids = [user_id for user_id, (_category, mode) in final.items() if mode == INSTANT]
        for user_id in _already_instant_today(instant_ids, dedupe_key) if instant_ids else ():
            final[user_id] = (final[user_id][0], DIGEST)

    origin = (origin or _request_origin())[:300]
    NotifyEvent.objects.bulk_create(
        [
            NotifyEvent(
                workspace_id=ctx.workspace_id,
                project_id=ctx.project_id,
                receiver_id=user_id,
                actor_id=actor_id,
                event=event,
                category=category,
                mode=mode,
                entity_type=ctx.entity_type,
                entity_id=ctx.entity_id,
                dedupe_key=dedupe_key[:200],
                tag=rule.tag,
                title=title,
                summary=(summary or "")[:1000],
                details=details,
                url_path=ctx.url_path[:500],
                origin=origin,
            )
            for user_id, (category, mode) in final.items()
        ],
        batch_size=200,
    )
    return len(final)


def emit(
    event,
    entity_type,
    entity_id,
    *,
    actor_id=None,
    summary="",
    details=None,
    extra_roles=None,
    title=None,
    origin=None,
    dedupe_key="",
    context=None,
):
    """发一条通知事件，返回入队的收件人数。

    - ``event``：``rules.RULES`` 里的事件代码
    - ``summary``：一句话说明发生了什么（如「状态 进行中 → 待测试」）
    - ``details``：邮件里的明细行 ``[(标签, 值), ...]``
    - ``extra_roles``：只在这次事件里才有的角色（审批人、新负责人等）``{角色: [用户 id]}``
    - ``dedupe_key``：同一个 key 当天已经即时发过的，这次改进摘要

    通知不能影响业务：这里出任何错都只记日志，不往外抛；在业务事务里调用时用保存点隔开。
    """
    try:
        with transaction.atomic():
            return _emit(
                event, entity_type, entity_id, actor_id, summary, details, extra_roles, title, origin, dedupe_key, context
            )
    except Exception as e:
        log_exception(e)
        return 0
