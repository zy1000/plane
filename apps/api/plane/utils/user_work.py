# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""「我的工作」页的聚合：待处理 / 已处理 / 我发起的 三个视图 + 个人视图设置。

- **来源（source）** = 一类工作 + 一条「与本人关系」的规则，key 见 ``PENDING_SOURCES``。
  每个来源各查一次，在 Python 里合并成同一种行形状（``_row``），前端按 ``type`` 挑图标与
  专属列。按人算体量只有几十到几百行，跨十来张表拼 UNION 不值当；已处理先按时间范围收窄
  再合并分页。
- **可见性按查看者（viewer）算**：看别人的个人主页不能漏出自己看不到的项目 / 产品，口径
  沿用 ``profile_metrics``（成员 / 负责 / 白名单项目，可见产品）。
- **视图设置挂在被查看的人（subject）身上**：别人看他的页面也按他的设置展示，只有本人能改。
- 阶段评审的「待我处理」= 未评审 / 评审中 × 我是负责人 ∪ 审核中 × 我是审核人（状态机见
  ``utils/stage_review.py``：每一步只有名单里的人能推）；「我已处理」从轨迹表按 actor 取，
  状态没法倒推出「谁推的」。
"""

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.db.models import F, Q
from django.utils import timezone

from plane.db.models import (
    ApprovalAction,
    CaseReviewRecord,
    IssueTransitionApprovalRecord,
    IssueTransitionRecord,
    PlanCase,
    PlanCaseRecord,
    PlanCaseReviewRecord,
    Requirement,
    RequirementApprovalAction,
    RequirementChangeApproval,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementItemStatus,
    ReviewTailoring,
    ReviewTailoringApproval,
    ReviewTailoringApprovalAction,
    ReviewTailoringStatus,
    StageReview,
    StageReviewActivity,
    StageReviewStatus,
    TransitionRecordStatus,
    WorkspaceUserWorkPreference,
)
from plane.db.models.stage_review import ROOT_KINDS
from plane.utils.profile_metrics import (
    DEFECT_TYPE_CATEGORY_NAME,
    OPEN_REQUIREMENT_STATUSES,
    _accessible_project_ids,
    _assigned_requirement_queryset,
    _base_issue_queryset,
    _open_issue_queryset,
    accessible_product_ids,
    get_profile_metric_queryset,
)
from plane.utils.requirement import requirement_display_id
from plane.utils.stage_review import REJECT_VERB


# ──────────────────────────────── 来源与设置 ────────────────────────────────

PENDING_SOURCES = (
    "review",
    "review_activity",
    "tailoring_approval",
    "issue_approval",
    "requirement_change",
    "work_item",
    "defect",
    "requirement",
    "case_execution",
    "case_review",
    "plan_review",
)
PROCESSED_SOURCES = PENDING_SOURCES
#: 我发起的：固定来源，不受设置控制
INITIATED_SOURCES = ("work_item", "defect", "requirement", "requirement_change", "issue_approval", "tailoring_approval")
#: 测试三项默认关 —— 不是每个人都做测试，默认开会让待处理被几十条用例淹掉
DEFAULT_OFF_SOURCES = frozenset({"case_execution", "case_review", "plan_review"})

PENDING_GROUP_BY = ("type", "owner", "due_date", "none")
PENDING_ORDER_BY = ("due_date", "created_at")
PROCESSED_GROUP_BY = ("date", "type", "owner", "none")
PROCESSED_DAYS = (7, 30, 90)
PROCESSED_DEFAULT_PAGE_SIZE = 20
PROCESSED_MAX_PAGE_SIZE = 100


def default_config():
    return {
        "pending": {
            "sources": {key: key not in DEFAULT_OFF_SOURCES for key in PENDING_SOURCES},
            "group_by": "type",
            "order_by": "due_date",
            "overdue_first": True,
        },
        "processed": {
            "sources": {key: key not in DEFAULT_OFF_SOURCES for key in PROCESSED_SOURCES},
            "days": 30,
            "group_by": "date",
        },
    }


def _pick(value, allowed, fallback):
    return value if value in allowed else fallback


def normalize_config(raw):
    """任意 JSON → 完整、合法的设置。未知 key 丢弃，非法值回落到默认。"""
    config = default_config()
    raw = raw if isinstance(raw, dict) else {}
    for view in ("pending", "processed"):
        incoming = raw.get(view)
        if not isinstance(incoming, dict):
            continue
        sources = incoming.get("sources")
        if isinstance(sources, dict):
            for key in config[view]["sources"]:
                if key in sources:
                    config[view]["sources"][key] = bool(sources[key])
        if view == "pending":
            config[view]["group_by"] = _pick(incoming.get("group_by"), PENDING_GROUP_BY, "type")
            config[view]["order_by"] = _pick(incoming.get("order_by"), PENDING_ORDER_BY, "due_date")
            if "overdue_first" in incoming:
                config[view]["overdue_first"] = bool(incoming["overdue_first"])
        else:
            config[view]["days"] = _pick(incoming.get("days"), PROCESSED_DAYS, 30)
            config[view]["group_by"] = _pick(incoming.get("group_by"), PROCESSED_GROUP_BY, "date")
    return config


def merge_config(base, incoming):
    """PATCH 语义：只覆盖送来的视图 / 字段，其余保留。"""
    merged = {view: dict(base.get(view, {})) for view in ("pending", "processed")}
    incoming = incoming if isinstance(incoming, dict) else {}
    for view in ("pending", "processed"):
        patch = incoming.get(view)
        if not isinstance(patch, dict):
            continue
        for key, value in patch.items():
            if key == "sources" and isinstance(value, dict):
                sources = dict(merged[view].get("sources", {}))
                sources.update(value)
                merged[view]["sources"] = sources
            else:
                merged[view][key] = value
    return merged


def get_user_work_config(workspace_id, user_id):
    row = WorkspaceUserWorkPreference.objects.filter(workspace_id=workspace_id, user_id=user_id).first()
    return normalize_config(row.config if row else None)


def save_user_work_config(workspace_id, user_id, incoming):
    row = WorkspaceUserWorkPreference.objects.filter(workspace_id=workspace_id, user_id=user_id).first()
    current = normalize_config(row.config if row else None)
    config = normalize_config(merge_config(current, incoming))
    if row is None:
        WorkspaceUserWorkPreference.objects.create(workspace_id=workspace_id, user_id=user_id, config=config)
    else:
        row.config = config
        row.save(update_fields=["config", "updated_at"])
    return config


def enabled_sources(config, view):
    allowed = PENDING_SOURCES if view == "pending" else PROCESSED_SOURCES
    return [key for key in allowed if config[view]["sources"].get(key)]


def parse_types(raw, allowed):
    values = {value.strip() for value in (raw or "").split(",") if value.strip()}
    return [key for key in allowed if key in values]


# ──────────────────────────────── 行的形状 ────────────────────────────────


@dataclass
class _Ctx:
    slug: str
    user_id: str
    viewer: object
    project_ids: object
    product_ids: object
    today: date


def _ctx(slug, user_id, viewer):
    return _Ctx(
        slug=slug,
        user_id=user_id,
        viewer=viewer,
        project_ids=_accessible_project_ids(slug, viewer),
        product_ids=accessible_product_ids(slug, viewer),
        today=timezone.localdate(),
    )


def _user_name(user):
    if user is None:
        return None
    return user.display_name or f"{user.first_name} {user.last_name}".strip() or user.email


def _iso(value):
    return value.isoformat() if value else None


def _project_owner(project):
    if project is None:
        return None
    return {"kind": "project", "id": str(project.id), "name": project.name, "identifier": project.identifier}


def _product_owner(product):
    if product is None:
        return None
    return {
        "kind": "product",
        "id": str(product.id),
        "name": product.name,
        "identifier": getattr(product, "identifier", None),
    }


def _status(key, label=None, color=None, group=None):
    return {"key": key, "label": label, "color": color, "group": group}


def _state_meta(state):
    if state is None:
        return None
    return {"id": str(state.id), "name": state.name, "color": state.color, "group": state.group}


def _issue_code(issue):
    return f"{issue.project.identifier}-{issue.sequence_id}"


def _issue_status(issue):
    if issue.state_id is None:
        return None
    return _status(issue.state.group, issue.state.name, issue.state.color, issue.state.group)


def _row(type_, obj_id, **fields):
    row = {
        "key": f"{type_}:{obj_id}",
        "type": type_,
        "id": str(obj_id),
        "code": "",
        "title": "",
        "meta": {},
        "owner": None,
        "project_id": None,
        "product_id": None,
        "status": None,
        "action": None,
        "due_date": None,
        "priority": None,
        "created_at": None,
    }
    row.update(fields)
    return row


def _due_bucket(due, today):
    if not due:
        return None
    if due < today:
        return "overdue"
    if due == today:
        return "today"
    week_end = today + timedelta(days=6 - today.weekday())
    if due <= week_end:
        return "week"
    return "later"


def _finalize(rows, today):
    """日期统一成 ISO 字符串，顺手算出截止日所在的时间桶（逾期 / 今天 / 本周 / 之后）。"""
    for row in rows:
        due = row.get("due_date")
        if isinstance(due, datetime):
            due = due.date()
        row["due_bucket"] = _due_bucket(due, today)
        for key in ("due_date", "created_at", "acted_at"):
            value = row.get(key)
            if isinstance(value, (date, datetime)):
                row[key] = value.isoformat()
    return rows


# ──────────────────────────────── 各来源的行 ────────────────────────────────

#: 评审每个状态「待谁、做什么」
REVIEW_ACTION_BY_STATUS = {
    StageReviewStatus.NOT_STARTED: ("start_review", "leader"),
    StageReviewStatus.IN_REVIEW: ("submit_for_approval", "leader"),
    StageReviewStatus.IN_APPROVAL: ("audit", "auditor"),
}
_REVIEW_STATUS_ORDER = (
    StageReviewStatus.NOT_STARTED,
    StageReviewStatus.IN_REVIEW,
    StageReviewStatus.IN_APPROVAL,
    StageReviewStatus.COMPLETED,
)


def _review_type(review):
    return "review" if review.kind in ROOT_KINDS else "review_activity"


def _review_title(review):
    """评审活动的标题去掉「父评审-」前缀，同项目评审执行台的做法。"""
    title = review.title or ""
    if review.parent_id and review.parent is not None:
        prefix = f"{review.parent.title}-"
        if title.startswith(prefix):
            return title[len(prefix) :]
    return title


def _review_row(review, **extra):
    return _row(
        _review_type(review),
        review.id,
        code=review.standard_code or "",
        title=_review_title(review),
        meta={
            "kind": review.kind,
            "stage": review.stage.name if review.stage_id else None,
            "stage_id": str(review.stage_id) if review.stage_id else None,
            "product": review.product.name if review.product_id else None,
            "parent_id": str(review.parent_id) if review.parent_id else None,
            "parent_title": review.parent.title if review.parent_id and review.parent else None,
            "result": review.result,
        },
        owner=_project_owner(review.project),
        project_id=str(review.project_id),
        product_id=str(review.product_id) if review.product_id else None,
        status=_status(review.status, StageReviewStatus(review.status).label),
        due_date=review.end_date,
        created_at=review.created_at,
        **extra,
    )


def _review_select(queryset):
    return queryset.select_related("project", "product", "stage", "parent")


def _pending_reviews(ctx):
    leader_statuses = (StageReviewStatus.NOT_STARTED, StageReviewStatus.IN_REVIEW)
    queryset = _review_select(
        StageReview.objects.filter(workspace__slug=ctx.slug, project_id__in=ctx.project_ids)
        .filter(
            Q(status__in=leader_statuses, leaders__id=ctx.user_id)
            | Q(status=StageReviewStatus.IN_APPROVAL, auditors__id=ctx.user_id)
        )
        .distinct()
    )
    for review in queryset:
        action, role = REVIEW_ACTION_BY_STATUS[review.status]
        yield _review_row(review, action={"key": action, "role": role})


def _tailoring_row(tailoring, **extra):
    return _row(
        "tailoring_approval",
        tailoring.id,
        code="",
        title=tailoring.title,
        meta={
            "round": tailoring.round,
            "tailoring_kind": tailoring.tailoring_kind,
            "requester": _user_name(tailoring.submitted_by),
            "requested_at": _iso(tailoring.submitted_at),
        },
        owner=_project_owner(tailoring.project),
        project_id=str(tailoring.project_id),
        created_at=tailoring.submitted_at or tailoring.created_at,
        **extra,
    )


def _pending_tailoring_approvals(ctx):
    queryset = ReviewTailoringApproval.objects.filter(
        approver_id=ctx.user_id,
        action__isnull=True,
        round=F("tailoring__round"),
        tailoring__status=ReviewTailoringStatus.PENDING,
        tailoring__deleted_at__isnull=True,
        tailoring__workspace__slug=ctx.slug,
        tailoring__project_id__in=ctx.project_ids,
    ).select_related("tailoring", "tailoring__project", "tailoring__submitted_by")
    for approval in queryset:
        yield _tailoring_row(
            approval.tailoring,
            status=_status("pending_sign"),
            action={"key": "sign", "role": "signer"},
        )


def _transition_meta(record):
    return {
        "issue_id": str(record.issue_id),
        "transition_id": str(record.id),
        "from_state": _state_meta(record.from_state),
        "to_state": _state_meta(record.to_state),
        "requester": _user_name(record.created_by),
        "requested_at": _iso(record.created_at),
        "transition_status": record.status,
    }


def _issue_approval_row(record, **extra):
    issue = record.issue
    return _row(
        "issue_approval",
        record.id,
        code=_issue_code(issue),
        title=issue.name,
        meta=_transition_meta(record),
        owner=_project_owner(issue.project),
        project_id=str(issue.project_id),
        due_date=issue.target_date,
        priority=issue.priority,
        created_at=record.created_at,
        **extra,
    )


_TRANSITION_RELATED = (
    "transition_record",
    "transition_record__issue",
    "transition_record__issue__project",
    "transition_record__issue__state",
    "transition_record__from_state",
    "transition_record__to_state",
    "transition_record__created_by",
)


def _pending_issue_approvals(ctx):
    queryset = IssueTransitionApprovalRecord.objects.filter(
        approver_id=ctx.user_id,
        action__isnull=True,
        transition_record__status=TransitionRecordStatus.PENDING,
        transition_record__deleted_at__isnull=True,
        transition_record__issue__in=_base_issue_queryset(ctx.slug, ctx.viewer),
    ).select_related(*_TRANSITION_RELATED)
    for approval in queryset:
        yield _issue_approval_row(
            approval.transition_record,
            status=_status("pending_approval"),
            action={"key": "approve", "role": "approver"},
        )


def _change_title(change):
    """变更单没有标题：取变更项快照里的需求标题，多条时「X 等 N 条」（同通知文案）。"""
    titles = []
    first_type = None
    for item in change.items.all():
        if first_type is None:
            first_type = item.change_type
        snapshot = item.proposed_snapshot or item.before_snapshot or {}
        title = snapshot.get("title") if isinstance(snapshot, dict) else None
        if title:
            titles.append(title)
    if not titles:
        return f"CR-{change.sequence_id}", first_type, 0
    title = titles[0] if len(titles) == 1 else f"{titles[0]} 等 {len(titles)} 条"
    return title, first_type, len(titles)


def _change_row(change, **extra):
    title, change_type, item_count = _change_title(change)
    owner = _product_owner(change.product) if change.product_id else _project_owner(change.project)
    return _row(
        "requirement_change",
        change.id,
        code=f"CR-{change.sequence_id}",
        title=title,
        meta={
            "change_type": change_type,
            "item_count": item_count,
            "requester": _user_name(change.created_by),
            "requested_at": _iso(change.created_at),
            "approval_type": change.approval_type,
            "change_status": change.status,
        },
        owner=owner,
        project_id=str(change.project_id) if change.project_id else None,
        product_id=str(change.product_id) if change.product_id else None,
        created_at=change.created_at,
        **extra,
    )


def _change_scope_q(ctx, prefix=""):
    return Q(**{f"{prefix}product_id__in": ctx.product_ids}) | Q(**{f"{prefix}project_id__in": ctx.project_ids})


def _pending_requirement_changes(ctx):
    queryset = (
        RequirementChangeRequest.objects.filter(
            workspace__slug=ctx.slug,
            status=RequirementChangeStatus.PENDING,
            approvals__approver_id=ctx.user_id,
            approvals__action__isnull=True,
            approvals__deleted_at__isnull=True,
        )
        .filter(_change_scope_q(ctx))
        .select_related("product", "project", "created_by")
        .prefetch_related("items")
        .distinct()
    )
    for change in queryset:
        yield _change_row(change, status=_status("pending_review"), action={"key": "review", "role": "reviewer"})


def _issue_type(issue):
    if issue.type_id and issue.type.category_id and issue.type.category.name == DEFECT_TYPE_CATEGORY_NAME:
        return "defect"
    return "work_item"


def _issue_row(issue, type_=None, **extra):
    return _row(
        type_ or _issue_type(issue),
        issue.id,
        code=_issue_code(issue),
        title=issue.name,
        meta={"type_name": issue.type.name if issue.type_id else None, "sequence_id": issue.sequence_id},
        owner=_project_owner(issue.project),
        project_id=str(issue.project_id),
        status=_issue_status(issue),
        due_date=issue.target_date,
        priority=issue.priority,
        created_at=issue.created_at,
        **extra,
    )


def _issue_select(queryset):
    return queryset.select_related("project", "state", "type", "type__category")


def _assigned_issues(ctx):
    return _issue_select(
        _base_issue_queryset(ctx.slug, ctx.viewer).filter(
            issue_assignee__assignee_id=ctx.user_id, issue_assignee__deleted_at__isnull=True
        )
    ).distinct()


def _pending_issues(ctx, wanted):
    for issue in _open_issue_queryset(_assigned_issues(ctx)):
        type_ = _issue_type(issue)
        if type_ in wanted:
            yield _issue_row(issue, type_, action={"key": "handle", "role": "assignee"})


def _requirement_row(requirement, **extra):
    return _row(
        "requirement",
        requirement.id,
        code=requirement_display_id(requirement) or "",
        title=requirement.title,
        owner=_product_owner(requirement.product),
        product_id=str(requirement.product_id) if requirement.product_id else None,
        status=_status(requirement.status, RequirementItemStatus(requirement.status).label),
        due_date=requirement.target_date,
        priority=requirement.priority,
        created_at=requirement.created_at,
        **extra,
    )


def _pending_requirements(ctx):
    queryset = (
        _assigned_requirement_queryset(ctx.slug, ctx.user_id, ctx.viewer)
        .filter(status__in=OPEN_REQUIREMENT_STATUSES)
        .select_related("product")
    )
    for requirement in queryset:
        yield _requirement_row(requirement, action={"key": "handle", "role": "assignee"})


def _plan_case_row(plan_case, type_="case_execution", **extra):
    plan = plan_case.plan
    if plan.project_id:
        owner = _project_owner(plan.project)
    else:
        owner = _product_owner(plan.product) if plan.product_id else None
    return _row(
        type_,
        plan_case.id,
        code=plan_case.case.code or "",
        title=plan_case.case.name,
        meta={
            "plan_id": str(plan.id),
            "plan_name": plan.name,
            "case_id": str(plan_case.case_id),
            "result": plan_case.result,
            "review_status": plan_case.review_status,
        },
        owner=owner,
        project_id=str(plan.project_id) if plan.project_id else None,
        product_id=str(plan.product_id) if plan.product_id else None,
        created_at=plan_case.created_at,
        **extra,
    )


def _pending_case_executions(ctx):
    queryset = get_profile_metric_queryset("pending_execution_cases", ctx.slug, ctx.user_id, ctx.viewer)
    for plan_case in queryset.select_related("plan__product"):
        yield _plan_case_row(
            plan_case, status=_status("not_executed"), action={"key": "execute", "role": "executor"}
        )


def _case_review_row(through, **extra):
    review = through.review
    return _row(
        "case_review",
        through.id,
        code=through.case.code or "",
        title=through.case.name,
        meta={
            "review_id": str(review.id),
            "review_name": review.name,
            "case_id": str(through.case_id),
            "result": through.result,
        },
        owner=_product_owner(review.product),
        product_id=str(review.product_id) if review.product_id else None,
        created_at=through.created_at,
        **extra,
    )


def _pending_case_reviews(ctx):
    queryset = get_profile_metric_queryset("pending_review_cases", ctx.slug, ctx.user_id, ctx.viewer)
    for through in queryset:
        personal = getattr(through, "personal_review_status", None)
        yield _case_review_row(
            through,
            status=_status(personal or "not_reviewed", personal),
            action={"key": "review", "role": "reviewer"},
        )


def _pending_plan_reviews(ctx):
    """待我复核：我是计划复核人、用例已执行、复核未定、且我这轮还没投过票。"""
    voted = PlanCaseReviewRecord.objects.filter(reviewer_id=ctx.user_id, invalidated_at__isnull=True).values(
        "plan_case_id"
    )
    queryset = (
        PlanCase.objects.filter(
            plan__reviewers__id=ctx.user_id,
            plan__deleted_at__isnull=True,
            plan__project__workspace__slug=ctx.slug,
            plan__project_id__in=ctx.project_ids,
            review_status__in=(PlanCase.ReviewStatus.NOT_START, PlanCase.ReviewStatus.PROCESS),
            case__deleted_at__isnull=True,
        )
        .exclude(result=PlanCase.Result.NOT_START)
        .exclude(id__in=voted)
        .select_related("case", "plan", "plan__project", "plan__product")
        .distinct()
    )
    for plan_case in queryset:
        yield _plan_case_row(
            plan_case,
            "plan_review",
            status=_status("not_rechecked", plan_case.review_status),
            action={"key": "recheck", "role": "reviewer"},
        )


# ──────────────────────────────── 待处理 ────────────────────────────────


def build_pending_rows(slug, user_id, viewer, types):
    ctx = _ctx(slug, user_id, viewer)
    wanted = set(types)
    rows = []
    if wanted & {"review", "review_activity"}:
        rows.extend(row for row in _pending_reviews(ctx) if row["type"] in wanted)
    if "tailoring_approval" in wanted:
        rows.extend(_pending_tailoring_approvals(ctx))
    if "issue_approval" in wanted:
        rows.extend(_pending_issue_approvals(ctx))
    if "requirement_change" in wanted:
        rows.extend(_pending_requirement_changes(ctx))
    if wanted & {"work_item", "defect"}:
        rows.extend(_pending_issues(ctx, wanted))
    if "requirement" in wanted:
        rows.extend(_pending_requirements(ctx))
    if "case_execution" in wanted:
        rows.extend(_pending_case_executions(ctx))
    if "case_review" in wanted:
        rows.extend(_pending_case_reviews(ctx))
    if "plan_review" in wanted:
        rows.extend(_pending_plan_reviews(ctx))
    return _finalize(rows, ctx.today)


def filter_rows(rows, search=None, quick=None, owners=None):
    """列表接口的轻量过滤：标题 / 编号搜索、时间桶、所属项目 / 产品。都在行上做。"""
    needle = (search or "").strip().lower()
    owner_ids = {value.strip() for value in (owners or "").split(",") if value.strip()}
    result = []
    for row in rows:
        if needle and needle not in (row["title"] or "").lower() and needle not in (row["code"] or "").lower():
            continue
        if quick and row.get("due_bucket") != quick:
            continue
        if owner_ids and not (row["owner"] and row["owner"]["id"] in owner_ids):
            continue
        result.append(row)
    return result


def _count_by_type(rows):
    return dict(Counter(row["type"] for row in rows))


def pending_summary(rows, config):
    """头部页签条数 + 左栏各类型条数 + 快捷筛选条数 + 摘要页焦点卡用的「按动作」条数。
    ``by_type`` 覆盖**全部**来源（摘要页的数字不该随开关变），``enabled_total`` 才按设置算。"""
    enabled = enabled_sources(config, "pending")
    by_type = _count_by_type(rows)
    quick = {bucket: Counter() for bucket in ("overdue", "today", "week")}
    for row in rows:
        bucket = row.get("due_bucket")
        if bucket in quick and row["type"] in enabled:
            quick[bucket][row["type"]] += 1
    by_action = Counter(row["action"]["key"] for row in rows if row.get("action"))
    return {
        "total": len(rows),
        "enabled_total": sum(by_type.get(key, 0) for key in enabled),
        "enabled_types": enabled,
        "by_type": by_type,
        "quick": {bucket: {"total": sum(c.values()), "by_type": dict(c)} for bucket, c in quick.items()},
        "by_action": dict(by_action),
    }


# ──────────────────────────────── 已处理 ────────────────────────────────


def _review_processed_action(activity):
    if activity.field == "result":
        return "rejected_result", activity.new_value
    try:
        old_index = _REVIEW_STATUS_ORDER.index(activity.old_value)
        new_index = _REVIEW_STATUS_ORDER.index(activity.new_value)
    except ValueError:
        return "started", None
    if new_index < old_index:
        return "rolled_back", None
    if activity.old_value == StageReviewStatus.NOT_STARTED:
        return "started", None
    if activity.old_value == StageReviewStatus.IN_REVIEW:
        return "submitted", (activity.extra or {}).get("result")
    return "audited", None


def _processed(row, acted_at, action_key, result=None, comment=None, current_status=None, suffix=None):
    row["acted_at"] = acted_at
    row["processed_action"] = {"key": action_key, "result": result, "comment": comment or None}
    row["current_status"] = current_status if current_status is not None else row.get("status")
    if suffix is not None:
        row["key"] = f"{row['key']}:{suffix}"
    return row


def _processed_reviews(ctx, since, wanted):
    queryset = (
        StageReviewActivity.objects.filter(
            actor_id=ctx.user_id,
            created_at__gte=since,
            workspace__slug=ctx.slug,
            project_id__in=ctx.project_ids,
            stage_review__deleted_at__isnull=True,
        )
        .filter(Q(field="status") | Q(field="result", comment=REJECT_VERB))
        .select_related(
            "stage_review",
            "stage_review__project",
            "stage_review__product",
            "stage_review__stage",
            "stage_review__parent",
        )
    )
    for activity in queryset:
        review = activity.stage_review
        if _review_type(review) not in wanted:
            continue
        action_key, result = _review_processed_action(activity)
        extra = activity.extra or {}
        yield _processed(
            _review_row(review),
            activity.created_at,
            action_key,
            result=result,
            comment=extra.get("approval_comment") or extra.get("rollback_reason") or extra.get("conditional_reason"),
            suffix=activity.id,
        )


def _processed_tailoring_approvals(ctx, since):
    queryset = ReviewTailoringApproval.objects.filter(
        approver_id=ctx.user_id,
        action__isnull=False,
        acted_at__gte=since,
        tailoring__deleted_at__isnull=True,
        tailoring__workspace__slug=ctx.slug,
        tailoring__project_id__in=ctx.project_ids,
    ).select_related("tailoring", "tailoring__project", "tailoring__submitted_by")
    for approval in queryset:
        tailoring = approval.tailoring
        approved = approval.action == ReviewTailoringApprovalAction.APPROVED
        yield _processed(
            _tailoring_row(
                tailoring,
                status=_status(tailoring.status, ReviewTailoringStatus(tailoring.status).label),
            ),
            approval.acted_at,
            "tailoring_approved" if approved else "tailoring_rejected",
            comment=approval.comment,
            suffix=approval.id,
        )


def _processed_issue_approvals(ctx, since):
    queryset = IssueTransitionApprovalRecord.objects.filter(
        approver_id=ctx.user_id,
        action__isnull=False,
        updated_at__gte=since,
        transition_record__deleted_at__isnull=True,
        transition_record__issue__in=_base_issue_queryset(ctx.slug, ctx.viewer),
    ).select_related(*_TRANSITION_RELATED)
    for approval in queryset:
        record = approval.transition_record
        approved = approval.action == ApprovalAction.APPROVED
        # 审批记录没有 acted_at，表态时间只能用 updated_at 近似
        yield _processed(
            _issue_approval_row(record, status=_issue_status(record.issue)),
            approval.updated_at,
            "transition_approved" if approved else "transition_rejected",
            comment=approval.comment,
            suffix=approval.id,
        )


def _processed_requirement_changes(ctx, since):
    queryset = (
        RequirementChangeApproval.objects.filter(
            approver_id=ctx.user_id,
            action__isnull=False,
            acted_at__gte=since,
            change_request__workspace__slug=ctx.slug,
        )
        .filter(_change_scope_q(ctx, "change_request__"))
        .select_related(
            "change_request",
            "change_request__product",
            "change_request__project",
            "change_request__created_by",
        )
        .prefetch_related("change_request__items")
    )
    for approval in queryset:
        change = approval.change_request
        approved = approval.action == RequirementApprovalAction.APPROVED
        yield _processed(
            _change_row(change, status=_status(change.status, RequirementChangeStatus(change.status).label)),
            approval.acted_at,
            "change_approved" if approved else "change_rejected",
            comment=approval.comment,
            suffix=approval.id,
        )


def _processed_issues(ctx, since, wanted):
    queryset = _assigned_issues(ctx).filter(state__group="completed", completed_at__gte=since)
    for issue in queryset:
        type_ = _issue_type(issue)
        if type_ not in wanted:
            continue
        yield _processed(
            _issue_row(issue, type_),
            issue.completed_at,
            "closed" if type_ == "defect" else "completed",
        )


def _processed_requirements(ctx, since):
    # 需求没有「关闭时间」，用最后更新时间近似
    queryset = (
        _assigned_requirement_queryset(ctx.slug, ctx.user_id, ctx.viewer)
        .filter(status__in=(RequirementItemStatus.RELEASED, RequirementItemStatus.CLOSED), updated_at__gte=since)
        .select_related("product")
    )
    for requirement in queryset:
        yield _processed(
            _requirement_row(requirement),
            requirement.updated_at,
            "released" if requirement.status == RequirementItemStatus.RELEASED else "closed",
        )


def _processed_case_executions(ctx, since):
    queryset = PlanCaseRecord.objects.filter(
        assignee_id=ctx.user_id,
        created_at__gte=since,
        plan_case__deleted_at__isnull=True,
        plan_case__plan__deleted_at__isnull=True,
        plan_case__plan__project__workspace__slug=ctx.slug,
        plan_case__plan__project_id__in=ctx.project_ids,
    ).select_related(
        "plan_case", "plan_case__case", "plan_case__plan", "plan_case__plan__project", "plan_case__plan__product"
    )
    for record in queryset:
        plan_case = record.plan_case
        yield _processed(
            _plan_case_row(plan_case, status=_status(plan_case.result, plan_case.result)),
            record.created_at,
            "executed",
            result=record.result,
            suffix=record.id,
        )


def _processed_case_reviews(ctx, since):
    queryset = CaseReviewRecord.objects.filter(
        assignee_id=ctx.user_id,
        created_at__gte=since,
        crt__deleted_at__isnull=True,
        crt__review__deleted_at__isnull=True,
        crt__review__product__workspace__slug=ctx.slug,
        crt__review__product_id__in=ctx.product_ids,
    ).select_related("crt", "crt__case", "crt__review", "crt__review__product")
    for record in queryset:
        through = record.crt
        yield _processed(
            _case_review_row(through, status=_status(through.result, through.result)),
            record.created_at,
            "case_reviewed",
            result=record.result,
            suffix=record.id,
        )


def _processed_plan_reviews(ctx, since):
    queryset = PlanCaseReviewRecord.objects.filter(
        reviewer_id=ctx.user_id,
        created_at__gte=since,
        plan_case__deleted_at__isnull=True,
        plan_case__plan__deleted_at__isnull=True,
        plan_case__plan__project__workspace__slug=ctx.slug,
        plan_case__plan__project_id__in=ctx.project_ids,
    ).select_related(
        "plan_case", "plan_case__case", "plan_case__plan", "plan_case__plan__project", "plan_case__plan__product"
    )
    for record in queryset:
        plan_case = record.plan_case
        yield _processed(
            _plan_case_row(plan_case, "plan_review", status=_status(plan_case.review_status, plan_case.review_status)),
            record.created_at,
            "rechecked",
            result=record.result,
            suffix=record.id,
        )


def build_processed_rows(slug, user_id, viewer, types, days):
    ctx = _ctx(slug, user_id, viewer)
    since = timezone.now() - timedelta(days=days)
    wanted = set(types)
    rows = []
    if wanted & {"review", "review_activity"}:
        rows.extend(_processed_reviews(ctx, since, wanted))
    if "tailoring_approval" in wanted:
        rows.extend(_processed_tailoring_approvals(ctx, since))
    if "issue_approval" in wanted:
        rows.extend(_processed_issue_approvals(ctx, since))
    if "requirement_change" in wanted:
        rows.extend(_processed_requirement_changes(ctx, since))
    if wanted & {"work_item", "defect"}:
        rows.extend(_processed_issues(ctx, since, wanted))
    if "requirement" in wanted:
        rows.extend(_processed_requirements(ctx, since))
    if "case_execution" in wanted:
        rows.extend(_processed_case_executions(ctx, since))
    if "case_review" in wanted:
        rows.extend(_processed_case_reviews(ctx, since))
    if "plan_review" in wanted:
        rows.extend(_processed_plan_reviews(ctx, since))
    rows.sort(key=lambda row: row["acted_at"] or timezone.now(), reverse=True)
    return _finalize(rows, ctx.today)


# ──────────────────────────────── 我发起的 ────────────────────────────────


def build_initiated_rows(slug, user_id, viewer, types):
    """我创建且还没闭环的：工作项 / 缺陷 / 需求，加上我提交、还在等别人表态的
    变更单 / 流转申请 / 裁剪表。"""
    ctx = _ctx(slug, user_id, viewer)
    wanted = set(types)
    rows = []
    if wanted & {"work_item", "defect"}:
        queryset = _issue_select(_open_issue_queryset(_base_issue_queryset(ctx.slug, ctx.viewer))).filter(
            created_by_id=ctx.user_id
        )
        for issue in queryset:
            type_ = _issue_type(issue)
            if type_ in wanted:
                rows.append(_issue_row(issue, type_))
    if "requirement" in wanted:
        queryset = Requirement.objects.filter(
            workspace__slug=ctx.slug,
            created_by_id=ctx.user_id,
            status__in=OPEN_REQUIREMENT_STATUSES,
            product_id__in=ctx.product_ids,
        ).select_related("product")
        rows.extend(_requirement_row(requirement) for requirement in queryset)
    if "requirement_change" in wanted:
        queryset = (
            RequirementChangeRequest.objects.filter(
                workspace__slug=ctx.slug, created_by_id=ctx.user_id, status=RequirementChangeStatus.PENDING
            )
            .filter(_change_scope_q(ctx))
            .select_related("product", "project", "created_by")
            .prefetch_related("items")
        )
        rows.extend(_change_row(change, status=_status("pending_review")) for change in queryset)
    if "issue_approval" in wanted:
        queryset = IssueTransitionRecord.objects.filter(
            created_by_id=ctx.user_id,
            status=TransitionRecordStatus.PENDING,
            issue__in=_base_issue_queryset(ctx.slug, ctx.viewer),
        ).select_related("issue", "issue__project", "issue__state", "from_state", "to_state", "created_by")
        rows.extend(_issue_approval_row(record, status=_status("pending_approval")) for record in queryset)
    if "tailoring_approval" in wanted:
        queryset = ReviewTailoring.objects.filter(
            workspace__slug=ctx.slug,
            submitted_by_id=ctx.user_id,
            status=ReviewTailoringStatus.PENDING,
            project_id__in=ctx.project_ids,
        ).select_related("project", "submitted_by")
        rows.extend(_tailoring_row(tailoring, status=_status("pending_sign")) for tailoring in queryset)
    rows.sort(key=lambda row: row["created_at"] or timezone.now(), reverse=True)
    return _finalize(rows, ctx.today)


def rows_by_type(rows):
    return _count_by_type(rows)
