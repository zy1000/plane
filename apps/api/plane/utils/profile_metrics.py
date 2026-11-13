# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from datetime import timedelta

from django.db.models import Case, CharField, Count, F, OuterRef, Q, Subquery, Value, When
from django.utils import timezone

from plane.db.models import (
    CaseReviewRecord,
    CaseReviewThrough,
    Cycle,
    Issue,
    IssueAssignee,
    IssueTransitionRecord,
    PlanCase,
    Product,
    Project,
    Release,
    ReleaseStatus,
    Requirement,
    RequirementApprovalState,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementChangeType,
    RequirementIssue,
    RequirementItemStatus,
    StateGroup,
    TransitionRecordStatus,
)
from plane.app.permissions.base import _get_workspace
from plane.utils.product import filter_visible_products
from plane.utils.visibility import visible_projects_q


CLOSED_ISSUE_STATE_GROUPS = ("completed", "cancelled")
CLOSED_CYCLE_STATUSES = (Cycle.Status.COMPLETED, Cycle.Status.CANCELLED, "completed", "cancelled")
CLOSED_RELEASE_STATUSES = (ReleaseStatus.COMPLETED, ReleaseStatus.CANCELLED)
DEFECT_TYPE_CATEGORY_NAME = "缺陷"
# 需求的「未闭环」= 交付阶梯上还没走到已发布的三档；released 视为完成、closed 视为取消，
# 与工作项的 completed / cancelled 对齐（见 domain-glossary.md 轴 A）。
OPEN_REQUIREMENT_STATUSES = (
    RequirementItemStatus.NOT_STARTED,
    RequirementItemStatus.PROJECTED,
    RequirementItemStatus.IN_PROGRESS,
)


PROFILE_METRIC_KEYS = frozenset(
    {
        "open_assigned_requirements",
        "overdue_requirements",
        "unscheduled_requirements",
        "pending_requirement_approvals",
        "today_pending_issues",
        "week_pending_issues",
        "overdue_issues",
        "unscheduled_pending_issues",
        "pending_approval_issues",
        "pending_execution_cases",
        "pending_review_cases",
        "responsible_cycles",
        "responsible_releases",
        "assigned_issues",
        "created_issues",
        "subscribed_issues",
        "open_assigned_issues",
        "open_created_issues",
        "open_subscribed_issues",
        "open_defect_issues",
        "open_assigned_non_defect_issues",
    }
)

ISSUE_PROFILE_METRICS = frozenset(
    {
        "today_pending_issues",
        "week_pending_issues",
        "overdue_issues",
        "unscheduled_pending_issues",
        "pending_approval_issues",
        "assigned_issues",
        "created_issues",
        "subscribed_issues",
        "open_assigned_issues",
        "open_created_issues",
        "open_subscribed_issues",
        "open_defect_issues",
        "open_assigned_non_defect_issues",
    }
)

# 需求侧指标：树按产品聚合、明细按 product_id 收窄，而不是项目
REQUIREMENT_PROFILE_METRICS = frozenset(
    {
        "open_assigned_requirements",
        "overdue_requirements",
        "unscheduled_requirements",
    }
)
PRODUCT_SCOPED_METRICS = REQUIREMENT_PROFILE_METRICS | {"pending_requirement_approvals"}
# 一级节点是产品的指标：需求类 + 待评审用例（用例评审 2026-11 起归产品）
PRODUCT_GROUPED_METRICS = PRODUCT_SCOPED_METRICS | {"pending_review_cases"}


def _accessible_project_ids(slug, viewer):
    """查看者能看到的、未归档的项目（成员 / 负责 / 白名单，utils/visibility.py）。

    按 workspace_id 过滤，不要写成 ``workspace__slug``：连 workspaces 表比 slug 会让规划器把这个
    子查询估成十几行，外层于是先扫完整个工作区的工作项再去对负责人（同一条计数 20ms → 2ms）。"""
    workspace = _get_workspace(slug, viewer)
    if workspace is None:
        return Project.objects.none().values("id")
    return (
        Project.objects.filter(workspace_id=workspace.id, archived_at__isnull=True)
        .filter(visible_projects_q(viewer, workspace, None))
        .values("id")
    )


def _base_issue_queryset(slug, viewer):
    # 同样按 workspace_id：比 slug 时规划器看不到这个工作区实际占了多少工作项
    workspace = _get_workspace(slug, viewer)
    return Issue.issue_objects.filter(
        workspace_id=workspace.id if workspace else None,
        project_id__in=_accessible_project_ids(slug, viewer),
    )


def _open_issue_queryset(queryset):
    return queryset.exclude(state__group__in=CLOSED_ISSUE_STATE_GROUPS)


def accessible_product_ids(slug, viewer):
    """查看者能看到的产品，口径与产品列表一致（utils/product.py::filter_visible_products）。
    与工作项按「查看者所在项目」过滤同理 —— 看别人 profile 不能漏出自己看不到的产品。"""
    workspace = _get_workspace(slug, viewer)
    if workspace is None:
        return Product.objects.none().values("id")
    return filter_visible_products(Product.objects.filter(workspace_id=workspace.id), viewer, workspace).values("id")


def _assigned_requirement_queryset(slug, user_id, viewer):
    """该成员负责的产品需求。只算产品作用域（project 作用域是模型预留、无 URL 入口），
    标准库条目没有负责人也没有交付状态，天然不在其中。"""
    return Requirement.objects.filter(
        workspace__slug=slug,
        assignee_id=user_id,
        product_id__in=accessible_product_ids(slug, viewer),
    )


# 个人主页「与本人关系」分组，工作项 / 缺陷 / 需求三页共用：
# 已分配 = 负责人是他；已创建 = 他创建的；已延期 = 分配给他、过了截止日且未闭环。
# 组间可重叠 —— 既分配给他又是他创建的，两组都出现；已延期的同时也在已分配里。
PROFILE_USER_RELATION_GROUP_BY = "user_relation"
PROFILE_USER_RELATIONS = ("assigned", "created", "overdue")


def parse_user_relations(raw):
    """CSV → 合法的关系列表，按 PROFILE_USER_RELATIONS 的顺序，未知值忽略。"""
    values = {value.strip() for value in (raw or "").split(",")}
    return [relation for relation in PROFILE_USER_RELATIONS if relation in values]


def _any_of(conditions, relations):
    combined = Q(pk__in=[])
    for relation in relations:
        combined |= conditions[relation]
    return combined


def issue_user_relation_q(relations, user_id):
    """工作项与本人的关系条件，多个关系取并集。已延期口径同指标 overdue_issues。"""
    assigned = Q(
        id__in=IssueAssignee.objects.filter(assignee_id=user_id, deleted_at__isnull=True).values("issue_id")
    )
    conditions = {
        "assigned": assigned,
        "created": Q(created_by_id=user_id),
        "overdue": assigned
        & Q(target_date__lt=timezone.now().date())
        & ~Q(state__group__in=CLOSED_ISSUE_STATE_GROUPS),
    }
    return _any_of(conditions, relations)


def requirement_user_relation_q(relations, user_id):
    """需求与本人的关系条件，多个关系取并集。已延期口径同指标 overdue_requirements。"""
    conditions = {
        "assigned": Q(assignee_id=user_id),
        "created": Q(created_by_id=user_id),
        "overdue": Q(
            assignee_id=user_id,
            status__in=OPEN_REQUIREMENT_STATUSES,
            target_date__lt=timezone.now().date(),
        ),
    }
    return _any_of(conditions, relations)


def profile_relation_tab_counts(slug, user_id, viewer):
    """个人主页页签上的条数，口径与三个页签的列表一致：
    工作项 / 缺陷 = 分配给他 ∪ 他创建、未完成；需求 = 他负责 ∪ 他创建。"""
    issues = (
        Issue.issue_objects.filter(
            visible_projects_q(viewer, slug, "project"),
            workspace__slug=slug,
        )
        .filter(issue_user_relation_q(("assigned", "created"), user_id))
        .exclude(state__group__in=CLOSED_ISSUE_STATE_GROUPS)
    )
    return {
        "work_items": issues.exclude(type__category__name=DEFECT_TYPE_CATEGORY_NAME).count(),
        "defects": issues.filter(type__category__name=DEFECT_TYPE_CATEGORY_NAME).count(),
        "requirements": profile_requirements_queryset(slug, user_id, viewer).count(),
    }


def profile_requirements_queryset(slug, user_id, viewer):
    """「需求」tab 的基础集：他负责的 ∪ 他创建的产品需求，全部交付状态，供列表与分面共用。
    产品作用域之外的（标准库条目、项目作用域）没有 product，天然不在其中。"""
    return Requirement.objects.filter(
        requirement_user_relation_q(("assigned", "created"), user_id),
        workspace__slug=slug,
        product_id__in=accessible_product_ids(slug, viewer),
    )


def annotate_requirement_issue_counts(queryset):
    """工作项三元组（总数 / 已完成 / 已取消），**不限项目** —— 跨产品视角问的是
    「这条需求整体落地到哪一步」。子查询写法照 linked_requirements_queryset。"""
    live_issue_rows = RequirementIssue.objects.filter(
        requirement_id=OuterRef("pk"), issue__deleted_at__isnull=True
    )

    def _count(rows):
        return Subquery(rows.order_by().values("requirement_id").annotate(c=Count("id")).values("c")[:1])

    return queryset.annotate(
        issue_count=_count(live_issue_rows),
        completed_issue_count=_count(live_issue_rows.filter(issue__state__group=StateGroup.COMPLETED)),
        cancelled_issue_count=_count(live_issue_rows.filter(issue__state__group=StateGroup.CANCELLED)),
    )


def profile_requirement_facets(base, product_ids=None):
    """tab 顶部分面。口径与项目需求页一致：by_product 统计全集不受筛选影响，
    by_status 跟随选中的产品但不跟随其它筛选（否则选了「进行中」其余几段全变 0）。"""
    by_product = [
        {
            "product_id": str(row["product_id"]),
            "name": row["product__name"],
            "identifier": row["product__identifier"],
            "count": row["count"],
        }
        for row in base.order_by()
        .values("product_id", "product__name", "product__identifier")
        .annotate(count=Count("id"))
        .order_by("product__identifier")
    ]
    scoped = base.filter(product_id__in=product_ids) if product_ids else base
    by_status = {value: 0 for value in RequirementItemStatus.values}
    for row in scoped.order_by().values("status").annotate(count=Count("id")):
        if row["status"] in by_status:
            by_status[row["status"]] = row["count"]
    return {
        "by_product": by_product,
        "by_status": by_status,
        "total": sum(item["count"] for item in by_product),
    }


def _requirement_approval_state_expression():
    """approval_state 是派生 property，聚合时要在 SQL 里按同样的判定顺序表达。"""
    return Case(
        When(
            pending_change_item__isnull=False,
            pending_change_item__change_type=RequirementChangeType.DELETE,
            then=Value(RequirementApprovalState.PENDING_DELETION),
        ),
        When(pending_change_item__isnull=False, then=Value(RequirementApprovalState.IN_REVIEW)),
        When(approved_version__isnull=True, then=Value(RequirementApprovalState.DRAFT)),
        When(~Q(version=F("approved_row_version")), then=Value(RequirementApprovalState.MODIFIED)),
        default=Value(RequirementApprovalState.APPROVED),
        output_field=CharField(),
    )


def get_profile_requirement_summary(slug, user_id, viewer):
    """profile 概览「我的需求」区块的分布类数字（不进指标树 / 明细）。"""
    base = _assigned_requirement_queryset(slug, user_id, viewer)

    status_distribution = {value: 0 for value in RequirementItemStatus.values}
    for row in base.order_by().values("status").annotate(count=Count("id")):
        if row["status"] in status_distribution:
            status_distribution[row["status"]] = row["count"]

    approval_distribution = {value: 0 for value in RequirementApprovalState.values}
    for row in (
        base.order_by()
        .annotate(approval_state_value=_requirement_approval_state_expression())
        .values("approval_state_value")
        .annotate(count=Count("id"))
    ):
        if row["approval_state_value"] in approval_distribution:
            approval_distribution[row["approval_state_value"]] = row["count"]

    # 落地进度：挂在这些需求下的工作项按 issue 去重（一条工作项挂多条需求只算一次），
    # 已关闭的需求不参与 —— 它在交付语义上等同取消。
    issue_completion = Issue.issue_objects.filter(
        issue_requirements__requirement__in=base.exclude(status=RequirementItemStatus.CLOSED),
        issue_requirements__deleted_at__isnull=True,
    ).aggregate(
        total=Count("id", distinct=True),
        completed=Count("id", filter=Q(state__group="completed"), distinct=True),
        cancelled=Count("id", filter=Q(state__group="cancelled"), distinct=True),
    )

    return {
        "assigned_requirements": sum(status_distribution.values()),
        "requirement_status_distribution": status_distribution,
        "requirement_approval_distribution": approval_distribution,
        "requirement_issue_completion": issue_completion,
    }


def get_profile_metric_queryset(metric, slug, user_id, viewer):
    if metric not in PROFILE_METRIC_KEYS:
        raise ValueError("Unsupported profile metric")

    today = timezone.now().date()
    week_end = today + timedelta(days=6 - today.weekday())
    accessible_project_ids = _accessible_project_ids(slug, viewer)

    if metric in ISSUE_PROFILE_METRICS:
        queryset = _base_issue_queryset(slug, viewer)

        if metric in {"created_issues", "open_created_issues"}:
            queryset = queryset.filter(created_by_id=user_id)
            if metric == "open_created_issues":
                queryset = _open_issue_queryset(queryset)
            return queryset.select_related("project", "state")

        if metric in {"subscribed_issues", "open_subscribed_issues"}:
            queryset = queryset.filter(
                issue_subscribers__subscriber_id=user_id,
                issue_subscribers__deleted_at__isnull=True,
            )
            if metric == "open_subscribed_issues":
                queryset = _open_issue_queryset(queryset)
            return queryset.select_related("project", "state").distinct()

        if metric == "pending_approval_issues":
            pending_transition = IssueTransitionRecord.objects.filter(
                issue_id=OuterRef("pk"),
                status=TransitionRecordStatus.PENDING,
                approval_records__approver_id=user_id,
                approval_records__action__isnull=True,
                approval_records__deleted_at__isnull=True,
            ).order_by("-created_at")
            return (
                queryset.filter(
                    transition_records__status=TransitionRecordStatus.PENDING,
                    transition_records__deleted_at__isnull=True,
                    transition_records__approval_records__approver_id=user_id,
                    transition_records__approval_records__action__isnull=True,
                    transition_records__approval_records__deleted_at__isnull=True,
                )
                .annotate(
                    approval_to_state_id=Subquery(pending_transition.values("to_state_id")[:1]),
                    approval_to_state_name=Subquery(pending_transition.values("to_state__name")[:1]),
                    approval_to_state_color=Subquery(pending_transition.values("to_state__color")[:1]),
                )
                .select_related("project", "state")
                .distinct()
            )

        queryset = queryset.filter(
            issue_assignee__assignee_id=user_id,
            issue_assignee__deleted_at__isnull=True,
        )
        if metric == "assigned_issues":
            return queryset.select_related("project", "state").distinct()

        queryset = _open_issue_queryset(queryset)
        if metric == "open_assigned_issues":
            return queryset.select_related("project", "state").distinct()

        if metric == "open_defect_issues":
            return queryset.filter(type__category__name=DEFECT_TYPE_CATEGORY_NAME).select_related(
                "project", "state"
            ).distinct()

        if metric == "open_assigned_non_defect_issues":
            return queryset.exclude(type__category__name=DEFECT_TYPE_CATEGORY_NAME).select_related(
                "project", "state"
            ).distinct()

        if metric == "today_pending_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lte=today)
        elif metric == "week_pending_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lte=week_end)
        elif metric == "overdue_issues":
            queryset = queryset.filter(target_date__isnull=False, target_date__lt=today)
        elif metric == "unscheduled_pending_issues":
            queryset = queryset.filter(target_date__isnull=True)

        return queryset.select_related("project", "state").distinct()

    if metric in REQUIREMENT_PROFILE_METRICS:
        queryset = _assigned_requirement_queryset(slug, user_id, viewer).filter(
            status__in=OPEN_REQUIREMENT_STATUSES
        )
        if metric == "overdue_requirements":
            queryset = queryset.filter(target_date__isnull=False, target_date__lt=today)
        elif metric == "unscheduled_requirements":
            queryset = queryset.filter(target_date__isnull=True)
        return queryset.annotate(
            pending_change_type=F("pending_change_item__change_type")
        ).select_related("product")

    if metric == "pending_requirement_approvals":
        # 与 RequirementApprovalInboxAPIView 的 pending 口径一致：我是审批人且尚未表态的待审单
        return (
            RequirementChangeRequest.objects.filter(
                workspace__slug=slug,
                product_id__in=accessible_product_ids(slug, viewer),
                status=RequirementChangeStatus.PENDING,
                approvals__approver_id=user_id,
                approvals__action__isnull=True,
                approvals__deleted_at__isnull=True,
            )
            .select_related("product", "created_by")
            .distinct()
        )

    if metric == "responsible_cycles":
        return (
            Cycle.objects.filter(
                Q(created_by_id=user_id) | Q(owned_by_id=user_id),
                workspace__slug=slug,
                project_id__in=accessible_project_ids,
                archived_at__isnull=True,
            )
            .exclude(status__in=CLOSED_CYCLE_STATUSES)
            .select_related("project", "owned_by")
            .distinct()
        )

    if metric == "responsible_releases":
        return (
            Release.objects.filter(
                Q(created_by_id=user_id) | Q(lead_id=user_id),
                workspace__slug=slug,
                project_id__in=accessible_project_ids,
                archived_at__isnull=True,
            )
            .exclude(status__in=CLOSED_RELEASE_STATUSES)
            .select_related("project", "lead")
            .distinct()
        )

    if metric == "pending_execution_cases":
        return (
            PlanCase.objects.filter(
                assignee_id=user_id,
                result=PlanCase.Result.NOT_START,
                case__deleted_at__isnull=True,
                case__repository__deleted_at__isnull=True,
                plan__deleted_at__isnull=True,
                plan__project__workspace__slug=slug,
                plan__project_id__in=accessible_project_ids,
            ).select_related("case", "plan", "plan__project", "assignee")
        )

    latest_review_result = (
        CaseReviewRecord.objects.filter(
            crt_id=OuterRef("pk"),
            assignee_id=user_id,
        )
        .exclude(result=CaseReviewRecord.Result.SUGGEST)
        .order_by("-created_at")
    )
    return (
        CaseReviewThrough.objects.filter(
            assignees__id=user_id,
            case__deleted_at__isnull=True,
            case__repository__deleted_at__isnull=True,
            review__deleted_at__isnull=True,
            review__product__workspace__slug=slug,
            review__product_id__in=accessible_product_ids(slug, viewer),
        )
        .annotate(
            personal_review_status=Subquery(latest_review_result.values("result")[:1])
        )
        .filter(
            Q(personal_review_status__isnull=True)
            | Q(personal_review_status=CaseReviewRecord.Result.RE_REVIEW)
        )
        .select_related("case", "review", "review__product")
        .distinct()
    )


def apply_profile_metric_filters(
    queryset, metric, project_id=None, plan_id=None, review_id=None, product_id=None
):
    if metric in PRODUCT_SCOPED_METRICS:
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    if metric == "pending_execution_cases":
        if project_id:
            queryset = queryset.filter(plan__project_id=project_id)
        if plan_id:
            queryset = queryset.filter(plan_id=plan_id)
        return queryset

    if metric == "pending_review_cases":
        if product_id:
            queryset = queryset.filter(review__product_id=product_id)
        if review_id:
            queryset = queryset.filter(review_id=review_id)
        return queryset

    if project_id:
        queryset = queryset.filter(project_id=project_id)
    return queryset


def build_profile_metric_tree(queryset, metric):
    if metric == "pending_execution_cases":
        project_fields = ("plan__project_id", "plan__project__name")
        child_fields = ("plan_id", "plan__name")
        child_type = "plan"
    elif metric == "pending_review_cases":
        project_fields = ("review__product_id", "review__product__name")
        child_fields = ("review_id", "review__name")
        child_type = "review"
    elif metric in PRODUCT_SCOPED_METRICS:
        # 需求归产品不归项目：一级节点是产品，前端按 type 决定用 product_id 收窄
        project_fields = ("product_id", "product__name")
        child_fields = None
        child_type = None
    else:
        project_fields = ("project_id", "project__name")
        child_fields = None
        child_type = None
    node_type = "product" if metric in PRODUCT_GROUPED_METRICS else "project"

    project_rows = queryset.order_by().values(*project_fields).annotate(count=Count("id", distinct=True))
    children_by_project = {}
    if child_fields:
        child_rows = (
            queryset.order_by()
            .values(*project_fields, *child_fields)
            .annotate(count=Count("id", distinct=True))
        )
        for row in child_rows:
            project_id = str(row[project_fields[0]])
            children_by_project.setdefault(project_id, []).append(
                {
                    "id": str(row[child_fields[0]]),
                    "type": child_type,
                    "name": row[child_fields[1]],
                    "count": row["count"],
                    "project_id": project_id,
                }
            )

    nodes = []
    for row in project_rows:
        project_id = str(row[project_fields[0]])
        node = {
            "id": project_id,
            "type": node_type,
            "name": row[project_fields[1]],
            "count": row["count"],
            "project_id": project_id,
        }
        if child_fields:
            node["children"] = sorted(children_by_project.get(project_id, []), key=lambda item: item["name"])
        nodes.append(node)

    return sorted(nodes, key=lambda item: item["name"])
