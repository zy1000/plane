"""内置通知规则：什么事件、发给哪个角色、算哪一类、即时还是进每日摘要。

规则不在界面上配置，要调整就改这张表。个人设置在此基础上还能把某一类调低或关掉
（见 ``emit.resolve_mode``），对象上的订阅人可以逐人设成即时。

角色名是各业务自己的叫法：一部分由 ``entities.py`` 从对象上取（如 owner、member），
一部分只在某个事件里才有（如 approver、new_owner），由调用方通过 ``extra_roles`` 传入。
"""

from dataclasses import dataclass

from plane.db.models import NotifyCategory, NotifyMode

APPROVAL = NotifyCategory.APPROVAL
ASSIGN = NotifyCategory.ASSIGN
RESULT = NotifyCategory.RESULT
INFORM = NotifyCategory.INFORM
INSTANT = NotifyMode.INSTANT
DIGEST = NotifyMode.DIGEST

# 订阅人在规则里统一用这个角色名；实际方式以订阅人自己的 mode 为准，规则里写的是下限
SUBSCRIBER = "subscriber"


@dataclass(frozen=True)
class Target:
    role: str
    category: str
    mode: str


@dataclass(frozen=True)
class Rule:
    # 事件所属的对象类型，「通知对象」区块按它归集
    entity: str
    # 邮件里这一条前面的标签，同时是单条邮件主题的前缀
    tag: str
    targets: tuple
    # 这些角色一个人都没有时，在发送记录里记一条「无收件人」
    required: tuple = ()


def _t(role, category, mode):
    return Target(role, category, mode)


def _digest(*roles):
    return tuple(_t(role, INFORM, DIGEST) for role in roles)


def _instant(*roles):
    return tuple(_t(role, INFORM, INSTANT) for role in roles)


RULES = {
    # ── 工作项 ──────────────────────────────────────────────
    "issue.assigned": Rule("issue", "指派", (_t("new_assignee", ASSIGN, INSTANT),) + _digest("creator", SUBSCRIBER)),
    "issue.mentioned": Rule("issue", "提及", (_t("mentioned", ASSIGN, INSTANT),)),
    "issue.updated": Rule("issue", "更新", _digest("assignee", "creator", SUBSCRIBER)),
    "issue.commented": Rule("issue", "评论", _digest("assignee", "creator", SUBSCRIBER)),
    # ── 工作流审批（挂在工作项上）────────────────────────────
    "workflow.requested": Rule("issue", "待审批", (_t("approver", APPROVAL, INSTANT),), required=("approver",)),
    "workflow.reset": Rule("issue", "待审批", (_t("approver", APPROVAL, INSTANT),)),
    "workflow.approved": Rule("issue", "审批通过", (_t("initiator", RESULT, INSTANT),)),
    "workflow.rejected": Rule("issue", "审批驳回", (_t("initiator", RESULT, INSTANT),)),
    "workflow.cancelled": Rule("issue", "审批取消", (_t("initiator", RESULT, INSTANT),)),
    # ── 需求变更单 ──────────────────────────────────────────
    "reqchange.requested": Rule(
        "requirement_change", "待审批", (_t("approver", APPROVAL, INSTANT),), required=("approver",)
    ),
    "reqchange.approved": Rule("requirement_change", "审批通过", (_t("initiator", RESULT, INSTANT),)),
    "reqchange.rejected": Rule("requirement_change", "审批驳回", (_t("initiator", RESULT, INSTANT),)),
    # ── 评审裁剪表签批 ──────────────────────────────────────
    "tailoring.requested": Rule(
        "review_tailoring", "待签批", (_t("approver", APPROVAL, INSTANT),), required=("approver",)
    ),
    "tailoring.approved": Rule("review_tailoring", "签批通过", (_t("initiator", RESULT, INSTANT),)),
    "tailoring.rejected": Rule("review_tailoring", "签批退回", (_t("initiator", RESULT, INSTANT),)),
    # ── 阶段评审 ────────────────────────────────────────────
    "review.submitted": Rule("stage_review", "待审核", (_t("auditor", APPROVAL, INSTANT),), required=("auditor",)),
    "review.approved": Rule(
        "stage_review", "审核通过", (_t("leader", RESULT, INSTANT),) + _digest("stage_owner", SUBSCRIBER)
    ),
    "review.returned": Rule("stage_review", "退回", (_t("leader", ASSIGN, INSTANT),) + _digest("stage_owner")),
    "review.people_added": Rule(
        "stage_review", "指派", (_t("new_leader", ASSIGN, INSTANT), _t("new_auditor", ASSIGN, INSTANT))
    ),
    # ── 用例评审 ────────────────────────────────────────────
    "casereview.assigned": Rule("case_review", "待评审", (_t("reviewer", APPROVAL, INSTANT),)),
    "casereview.rejected": Rule("case_review", "评审不通过", (_t("case_owner", ASSIGN, INSTANT),)),
    "casereview.completed": Rule("case_review", "评审完成", (_t("initiator", RESULT, INSTANT),)),
    # ── 测试计划复核 ────────────────────────────────────────
    "planreview.requested": Rule("test_plan", "待复核", (_t("reviewer", APPROVAL, INSTANT),)),
    "planreview.rejected": Rule("test_plan", "复核不通过", (_t("executor", ASSIGN, INSTANT),)),
    # ── 迭代 ────────────────────────────────────────────────
    "cycle.created": Rule("cycle", "新建", _digest("owner", "project_lead", "product_manager", "member")),
    "cycle.owner_changed": Rule("cycle", "负责人变更", (_t("new_owner", ASSIGN, INSTANT),) + _digest("project_lead")),
    "cycle.schedule_changed": Rule(
        "cycle",
        "计划时间调整",
        _instant("owner") + _digest("project_lead", "product_manager", "member", SUBSCRIBER),
    ),
    "cycle.status_changed": Rule("cycle", "状态变更", _digest("owner", "member", SUBSCRIBER)),
    "cycle.testing": Rule("cycle", "转测", _instant("owner", "project_lead") + _digest("member", SUBSCRIBER)),
    "cycle.completed": Rule(
        "cycle", "已完成", _instant("owner", "project_lead", "product_manager") + _digest("member", SUBSCRIBER)
    ),
    "cycle.upcoming_overdue": Rule("cycle", "即将延期", _digest("owner")),
    "cycle.overdue": Rule(
        "cycle", "已延期", _instant("owner", "project_lead", "product_manager") + _digest("member", SUBSCRIBER)
    ),
    # ── 发布 ────────────────────────────────────────────────
    "release.created": Rule("release", "新建", _digest("owner", "project_lead", "product_manager", "member")),
    "release.owner_changed": Rule(
        "release", "负责人变更", (_t("new_owner", ASSIGN, INSTANT),) + _digest("project_lead")
    ),
    "release.schedule_changed": Rule(
        "release",
        "计划时间调整",
        _instant("owner") + _digest("project_lead", "product_manager", "member", SUBSCRIBER),
    ),
    "release.status_changed": Rule("release", "状态变更", _digest("owner", "member", SUBSCRIBER)),
    "release.testing": Rule("release", "转测", _instant("owner", "project_lead") + _digest("member", SUBSCRIBER)),
    "release.completed": Rule(
        "release", "已完成", _instant("owner", "project_lead", "product_manager") + _digest("member", SUBSCRIBER)
    ),
    "release.upcoming_overdue": Rule("release", "即将延期", _digest("owner")),
    "release.overdue": Rule(
        "release", "已延期", _instant("owner", "project_lead", "product_manager") + _digest("member", SUBSCRIBER)
    ),
    # ── 风险 ────────────────────────────────────────────────
    "risk.created": Rule("risk", "指派", (_t("owner", ASSIGN, INSTANT),) + _digest("stakeholder")),
    "risk.owner_changed": Rule(
        "risk", "指派", (_t("new_owner", ASSIGN, INSTANT),) + _digest("proposer", "stakeholder")
    ),
    "risk.updated": Rule("risk", "更新", _digest("owner", "proposer", "stakeholder")),
    # ── 需求 ────────────────────────────────────────────────
    "requirement.assigned": Rule("requirement", "指派", (_t("new_assignee", ASSIGN, INSTANT),)),
    "requirement.status_changed": Rule("requirement", "状态变更", _digest("assignee", "creator", SUBSCRIBER)),
    # ── 项目阶段 ────────────────────────────────────────────
    "stage.owner_changed": Rule("project_stage", "指派", (_t("new_owner", ASSIGN, INSTANT),)),
    "stage.updated": Rule("project_stage", "更新", _digest("owner", SUBSCRIBER)),
}


# 「通知对象」区块里各角色的叫法，按对象类型分；顺序即展示顺序。
# 只列对象上能直接取到的角色，approver / new_owner 这类只在单次事件里出现的不列。
ROLE_LABELS = {
    "issue": {"assignee": "负责人", "creator": "创建人"},
    "cycle": {"owner": "负责人", "project_lead": "项目负责人", "product_manager": "研发产品经理", "member": "成员"},
    "release": {"owner": "负责人", "project_lead": "项目负责人", "product_manager": "研发产品经理", "member": "成员"},
    "risk": {"owner": "责任人", "proposer": "提出人", "stakeholder": "相关干系人"},
    "stage_review": {"auditor": "审核人", "leader": "负责人", "stage_owner": "阶段负责人"},
    "requirement": {"assignee": "负责人", "creator": "创建人"},
    "project_stage": {"owner": "负责人"},
    "test_plan": {"reviewer": "复核人"},
}

# 订阅人在「通知对象」里的叫法：阶段评审没有自己的订阅人，用的是所属项目阶段的
SUBSCRIBER_LABELS = {"stage_review": "阶段订阅人"}

# 同一个人命中多个角色时取最高的一档；方式相同时类别按这个顺序取靠前的
CATEGORY_ORDER = (APPROVAL, ASSIGN, RESULT, INFORM)


# ──────────────────────────────── 规则页用的展示信息 ────────────────────────────────

# 「通知规则」页上的分组：(分组 key, 名称, ((事件代码前缀, 对象名), ...))。一组里有多种对象时页面多一列「对象」
RULE_GROUPS = (
    ("issue", "工作项", (("issue.", ""),)),
    ("cycle", "迭代", (("cycle.", ""),)),
    ("release", "发布", (("release.", ""),)),
    ("approval", "审批", (("workflow.", "工作流审批"), ("reqchange.", "需求变更单"), ("tailoring.", "裁剪表签批"))),
    ("review", "评审", (("review.", "阶段评审"), ("casereview.", "用例评审"), ("planreview.", "计划复核"))),
    ("requirement", "需求", (("requirement.", ""),)),
    ("project_stage", "项目阶段", (("stage.", ""),)),
    ("risk", "风险", (("risk.", ""),)),
)

# 事件在规则页上的名字
EVENT_LABELS = {
    "issue.assigned": "指派",
    "issue.mentioned": "提及",
    "issue.updated": "字段变更",
    "issue.commented": "评论",
    "workflow.requested": "发起审批",
    "workflow.reset": "重新审批",
    "workflow.approved": "审批通过",
    "workflow.rejected": "审批驳回",
    "workflow.cancelled": "审批取消",
    "reqchange.requested": "提交",
    "reqchange.approved": "通过",
    "reqchange.rejected": "驳回",
    "tailoring.requested": "提交签批",
    "tailoring.approved": "签批通过",
    "tailoring.rejected": "签批退回",
    "review.submitted": "提交审核",
    "review.approved": "审核通过",
    "review.returned": "退回",
    "review.people_added": "加入名单",
    "casereview.assigned": "指定评审人",
    "casereview.rejected": "评审不通过",
    "casereview.completed": "评审完成",
    "planreview.requested": "用例执行完",
    "planreview.rejected": "复核不通过",
    "cycle.created": "新建",
    "cycle.owner_changed": "负责人变更",
    "cycle.schedule_changed": "计划时间调整",
    "cycle.status_changed": "状态变更",
    "cycle.testing": "转测",
    "cycle.completed": "已完成",
    "cycle.upcoming_overdue": "即将延期",
    "cycle.overdue": "已延期",
    "release.created": "新建",
    "release.owner_changed": "负责人变更",
    "release.schedule_changed": "计划时间调整",
    "release.status_changed": "状态变更",
    "release.testing": "转测",
    "release.completed": "已完成",
    "release.upcoming_overdue": "即将延期",
    "release.overdue": "已延期",
    "risk.created": "新建",
    "risk.owner_changed": "责任人变更",
    "risk.updated": "其他变更",
    "requirement.assigned": "负责人变更",
    "requirement.status_changed": "状态变更",
    "stage.owner_changed": "负责人变更",
    "stage.updated": "状态、计划时间变更",
}

# 只在单次事件里出现的角色的叫法；个别业务的叫法不同，按事件代码前缀覆盖
EVENT_ROLE_LABELS = {
    "approver": "审批人",
    "initiator": "发起人",
    "new_owner": "新负责人",
    "new_assignee": "新负责人",
    "mentioned": "被提及的人",
    "reviewer": "评审人",
    "case_owner": "用例负责人",
    "executor": "执行人",
    "new_leader": "新负责人",
    "new_auditor": "新审核人",
}
EVENT_ROLE_LABEL_OVERRIDES = {
    "tailoring.": {"approver": "签批人", "initiator": "提交人"},
    "reqchange.": {"initiator": "提交人"},
    "planreview.": {"reviewer": "复核人"},
    "risk.": {"new_owner": "新责任人"},
}

# 有订阅人的对象类型（阶段评审用的是所属项目阶段的订阅人）；其余对象的规则里不出现「订阅人」
SUBSCRIBABLE_ENTITIES = frozenset(
    {"issue", "cycle", "release", "requirement", "project_stage", "test_plan", "stage_review"}
)


def event_group(event):
    """事件属于规则页的哪一组、哪种对象：(分组 key, 对象名)。"""
    for key, _label, prefixes in RULE_GROUPS:
        for prefix, object_label in prefixes:
            if event.startswith(prefix):
                return key, object_label
    return "", ""


def role_label(event, role):
    rule = RULES[event]
    if role == SUBSCRIBER:
        return SUBSCRIBER_LABELS.get(rule.entity, "订阅人")
    for prefix, labels in EVENT_ROLE_LABEL_OVERRIDES.items():
        if event.startswith(prefix) and role in labels:
            return labels[role]
    return ROLE_LABELS.get(rule.entity, {}).get(role) or EVENT_ROLE_LABELS.get(role, role)


def configurable_roles(event):
    """规则页上这个事件能配置的收件角色，按展示顺序。

    事件本身带的角色都能配。带「知会」的事件（对象的动态）还能把对象上的其他角色和订阅人加进来；
    纯流程事件（待审批、审批结果等）只能调它自己的那几个角色。
    """
    rule = RULES[event]
    entity_roles = list(ROLE_LABELS.get(rule.entity, {}))
    own = [target.role for target in rule.targets]
    roles = [role for role in own if role not in entity_roles and role != SUBSCRIBER]
    if any(target.category == INFORM for target in rule.targets):
        roles += entity_roles
        if rule.entity in SUBSCRIBABLE_ENTITIES:
            roles.append(SUBSCRIBER)
    else:
        roles += [role for role in entity_roles if role in own]
        if SUBSCRIBER in own:
            roles.append(SUBSCRIBER)
    return roles
