"""需求进项目：候选池、关联校验、项目侧的提单授权，以及需求状态的写入口。

这里只处理「引用」这一层。需求本体、字段结构、版本、基线、审批名单全部仍归产品，
项目侧一律只读 —— 写入口只有关联关系本身（项目/迭代/发布/工作项四张关联表）、
sort_order，以及需求级的交付状态 `Requirement.status`（人工维护，产品侧与项目侧
共用 set_requirement_status；只有两条只升不降的自动推进 promote_*，见
RequirementItemStatus 的 docstring）。
"""

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from datetime import date

from django.db.models import (
    BooleanField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    Subquery,
    UUIDField,
    Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from plane.db.models import (
    Cycle,
    ProductProject,
    ReleaseStatus,
    Requirement,
    RequirementApprovalPolicy,
    RequirementApprovalState,
    RequirementChangeType,
    RequirementCycle,
    RequirementIssue,
    RequirementItemStatus,
    RequirementPriority,
    RequirementProject,
    RequirementRelease,
    StateGroup,
)


def split_query_csv(raw):
    if not raw:
        return []
    return [item.strip() for item in str(raw).split(",") if item.strip()]


def _parse_iso_date(raw, field_name):
    if not raw:
        return None, None
    try:
        return date.fromisoformat(raw), None
    except ValueError:
        return None, {field_name: "Invalid date."}


def _choice_csv(raw, allowed, field_name):
    values = split_query_csv(raw)
    unknown = [item for item in values if item not in allowed]
    if unknown:
        return None, {field_name: f"Unknown {field_name}."}
    return values, None


def approval_state_q(states):
    """把派生审批态收成 Q。调用方必须先 annotate_pending。"""
    pending = Q(pending_change_item_id__isnull=False)
    no_pending = Q(pending_change_item_id__isnull=True)
    clauses = []
    if RequirementApprovalState.PENDING_DELETION in states:
        clauses.append(pending & Q(pending_change_type=RequirementChangeType.DELETE))
    if RequirementApprovalState.IN_REVIEW in states:
        clauses.append(pending & ~Q(pending_change_type=RequirementChangeType.DELETE))
    if RequirementApprovalState.DRAFT in states:
        clauses.append(no_pending & Q(approved_version__isnull=True))
    if RequirementApprovalState.MODIFIED in states:
        clauses.append(
            no_pending
            & Q(approved_version__isnull=False)
            & ~Q(version=F("approved_row_version"))
        )
    if RequirementApprovalState.APPROVED in states:
        clauses.append(
            no_pending
            & Q(approved_version__isnull=False)
            & Q(version=F("approved_row_version"))
        )
    query = Q()
    for clause in clauses:
        query |= clause
    return query


def apply_project_requirement_list_filters(queryset, query_params):
    """项目需求 list 的专用 SQL 筛选。成功返回 (queryset, None)，失败返回 (None, error_dict)。

    多值参数用逗号分隔；单个旧值（?status=in_progress）仍然有效。
    approval_state 依赖 annotate_pending 的 pending_change_type。
    """
    statuses, error = _choice_csv(
        query_params.get("status"), RequirementItemStatus.values, "status"
    )
    if error:
        return None, error
    if statuses:
        queryset = queryset.filter(status__in=statuses)

    priorities, error = _choice_csv(
        query_params.get("priority"), RequirementPriority.values, "priority"
    )
    if error:
        return None, error
    if priorities:
        queryset = queryset.filter(priority__in=priorities)

    approval_states, error = _choice_csv(
        query_params.get("approval_state"),
        RequirementApprovalState.values,
        "approval_state",
    )
    if error:
        return None, error
    if approval_states:
        queryset = queryset.filter(approval_state_q(approval_states))

    title = (query_params.get("title") or "").strip()
    if title:
        queryset = queryset.filter(title__icontains=title)

    assignee_ids = split_query_csv(query_params.get("assignee_id"))
    if assignee_ids:
        queryset = queryset.filter(assignee_id__in=assignee_ids)

    start_date, error = _parse_iso_date(query_params.get("start_date"), "start_date")
    if error:
        return None, error
    start_from, error = _parse_iso_date(
        query_params.get("start_date_from"), "start_date_from"
    )
    if error:
        return None, error
    start_to, error = _parse_iso_date(query_params.get("start_date_to"), "start_date_to")
    if error:
        return None, error
    if start_date:
        queryset = queryset.filter(start_date=start_date)
    else:
        if start_from:
            queryset = queryset.filter(start_date__gte=start_from)
        if start_to:
            queryset = queryset.filter(start_date__lte=start_to)

    target_date, error = _parse_iso_date(query_params.get("target_date"), "target_date")
    if error:
        return None, error
    target_from, error = _parse_iso_date(
        query_params.get("target_date_from"), "target_date_from"
    )
    if error:
        return None, error
    target_to, error = _parse_iso_date(
        query_params.get("target_date_to"), "target_date_to"
    )
    if error:
        return None, error
    if target_date:
        queryset = queryset.filter(target_date=target_date)
    else:
        if target_from:
            queryset = queryset.filter(target_date__gte=target_from)
        if target_to:
            queryset = queryset.filter(target_date__lte=target_to)

    return queryset, None


class RequirementLinkError(Exception):
    """关联链路的业务错误。形状对齐 utils.requirement_change.RequirementChangeError。"""

    def __init__(self, message, *, code=None, detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail or {}


def linked_product_ids(project_id):
    """本项目已关联的产品 id。候选池的第一道过滤。

    两个 helper 都显式 .order_by() 清掉模型默认排序：它们只当子查询用，带着排序列
    进 IN (...) 会变成多列子查询。
    """
    return (
        ProductProject.objects.filter(project_id=project_id)
        .order_by()
        .values_list("product_id", flat=True)
    )


def linked_requirement_ids(project_id):
    return (
        RequirementProject.objects.filter(project_id=project_id)
        .order_by()
        .values_list("requirement_id", flat=True)
    )


def linkable_requirements_queryset(*, slug, project_id):
    """候选池：本项目关联产品下、已通过评审、未关闭、且尚未关联进来的需求。

    只放 approved_version 非空的行（决策 3）：未过评审的需求不进入交付链路。
    已关闭（closed）的需求不进任何关联选择器（见 RequirementItemStatus）。
    """
    return (
        Requirement.objects.filter(
            workspace__slug=slug,
            product_id__in=linked_product_ids(project_id),
            approved_version__isnull=False,
        )
        .exclude(status=RequirementItemStatus.CLOSED)
        .exclude(id__in=linked_requirement_ids(project_id))
        .select_related("product")
        .order_by("product__identifier", "sort_order", "created_at", "id")
    )


def linkable_facets(*, slug, project_id):
    """关联需求弹窗左侧产品分面的计数。

    口径与 requirement_facets 的 by_product 同一条规矩：统计**全集**（整个候选池），
    不随搜索 / product_id 筛选变化 —— 分面是最外层作用域，自己的数字不该跟着选中项走。
    搭 linkable 列表一起返回（extra_stats），不另开端点、不多发请求。

    .order_by() 必须清掉候选池的默认排序，否则排序列会被拖进 GROUP BY。
    """
    from django.db.models import Count

    by_product = {
        str(row["product_id"]): row["count"]
        for row in linkable_requirements_queryset(slug=slug, project_id=project_id)
        .order_by()
        .values("product_id")
        .annotate(count=Count("id"))
    }
    return {"by_product": by_product, "total": sum(by_product.values())}


def linked_requirements_queryset(*, slug, project_id):
    """本项目已关联的需求，按关联行的 sort_order 排。

    link_sort_order 从关联行拉平到需求行上，列表序列化器直接读注解，不必为每行
    再查一次中间表。需求状态是需求本体上的真实列（Requirement.status），不需要注解。

    latest_release_name 供「目标发布」chip 展示；工作项三个计数供网格「工作项数 +
    完成率」列（完成率由前端算，这里只给分子分母）；linked_cycle_ids 供「拆分
    工作项」弹窗在恰好一个未取消迭代时预填（多个不猜）。
    """
    from django.db.models import Count

    link_rows = RequirementProject.objects.filter(
        requirement_id=OuterRef("pk"), project_id=project_id
    )
    # 有效迭代关联（未取消；NULL 状态的历史行不算已取消）。
    # cycle__/release__deleted_at 显式过滤：FK 穿透不走软删 manager，
    # 不能指向一个已删除的容器
    valid_cycle_rows = RequirementCycle.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        cycle__deleted_at__isnull=True,
    ).filter(Q(cycle__status__isnull=True) | ~Q(cycle__status=Cycle.Status.CANCELLED))
    # 在途或已发布的发布关联（驳回/取消的不再展示）
    live_release_rows = RequirementRelease.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        release__deleted_at__isnull=True,
    ).exclude(release__status__in=[ReleaseStatus.REJECTED, ReleaseStatus.CANCELLED])
    # live 工作项关联。issue__deleted_at 过滤理由同上：删除工作项与异步级联之间的
    # 窗口期里，已删行不能再计进工作项数与完成率
    live_issue_rows = RequirementIssue.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        issue__deleted_at__isnull=True,
    )
    return (
        Requirement.objects.filter(
            workspace__slug=slug,
            id__in=linked_requirement_ids(project_id),
        )
        .annotate(
            link_sort_order=Subquery(link_rows.values("sort_order")[:1]),
            latest_release_name=Subquery(
                # 已发布的优先于在途的
                live_release_rows.annotate(
                    is_completed=ExpressionWrapper(
                        Q(release__status=ReleaseStatus.COMPLETED),
                        output_field=BooleanField(),
                    )
                )
                .order_by("-is_completed", "-created_at")
                .values("release__name")[:1]
            ),
            # Count 子查询统一 .order_by() 清默认排序再 GROUP BY —— 少了它
            # 排序列会被拖进 GROUP BY，单行子查询变多行
            issue_count=Subquery(
                live_issue_rows.order_by()
                .values("requirement_id")
                .annotate(c=Count("id"))
                .values("c")[:1]
            ),
            completed_issue_count=Subquery(
                live_issue_rows.filter(issue__state__group=StateGroup.COMPLETED)
                .order_by()
                .values("requirement_id")
                .annotate(c=Count("id"))
                .values("c")[:1]
            ),
            cancelled_issue_count=Subquery(
                live_issue_rows.filter(issue__state__group=StateGroup.CANCELLED)
                .order_by()
                .values("requirement_id")
                .annotate(c=Count("id"))
                .values("c")[:1]
            ),
            # 复用有效迭代口径（未删未取消），照 annotate_project_ids 的
            # ArrayAgg + Coalesce 空数组范式
            linked_cycle_ids=Coalesce(
                Subquery(
                    valid_cycle_rows.order_by()
                    .values("requirement_id")
                    .annotate(arr=ArrayAgg("cycle_id"))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
        )
        .select_related("product")
        .order_by("link_sort_order", "product__identifier", "sequence_id")
    )


def annotate_project_ids(queryset):
    """把「这条需求进了哪些项目」注解成 UUID 数组 `project_ids`。

    照 utils/grouper.py 的 ArrayAgg 子查询范式。deleted_at__isnull=True 是必需的 ——
    关联行是软删的，漏了它解除关联的项目会一直挂在需求上。归档项目一并排除，否则
    详情页的「所属项目」多选会回显一个选不中的项目。
    """
    subquery = Subquery(
        RequirementProject.objects.filter(
            requirement_id=OuterRef("pk"),
            deleted_at__isnull=True,
            project__archived_at__isnull=True,
        )
        .values("requirement_id")
        .annotate(arr=ArrayAgg("project_id"))
        .values("arr")
    )
    return queryset.annotate(
        project_ids=Coalesce(subquery, Value([], output_field=ArrayField(UUIDField())))
    )


def requirement_facets(*, project_id, product_id=None):
    """项目需求页顶部分面的计数。

    **口径**（改之前先读完，分面计数最容易出的 bug 就是「点了筛选之后其他分面全变 0」）：
    - `by_product` 统计**全集**，不受任何筛选影响 —— 产品 tab 是最外层作用域，它自己的
      数字不该随选中项变化，否则点进 ECOM 之后 PAY 变成 0，用户就再也回不去了。
    - `by_status` / `by_requirement_type` 跟随**当前选中的产品**（视觉上它们嵌套在产品
      tab 之下），但不跟随搜索、状态、类型自身 —— 同理，状态条上的数字不能因为选了
      「进行中」就把其余几段清零。

    实现上直接聚合 `RequirementProject` 表并 join 到需求本体的 `status` 真实列，
    **不要**去 `linked_requirements_queryset` 的 Subquery 注解上做 GROUP BY —— 那会
    把整个子查询塞进 GROUP BY 子句。这里一次分组扫的是关联表，代价与页大小无关。
    """
    from django.db.models import Count

    # requirement__deleted_at 必须显式带上：关联行与需求行是分两步软删的
    # （批准删除时 row.delete() 当场标记需求，关联行要等 soft_delete_related_objects
    # 那个 Celery 任务跑完才标记）。少了这个条件，两者之间的窗口期里分面会比列表多数
    # 出几条 —— 列表走的是 Requirement.objects，天然带了这个过滤。
    base = RequirementProject.objects.filter(
        project_id=project_id, requirement__deleted_at__isnull=True
    )

    by_product = [
        {
            "product_id": str(row["requirement__product_id"]),
            "name": row["requirement__product__name"],
            "identifier": row["requirement__product__identifier"],
            "count": row["count"],
        }
        for row in base.filter(requirement__product__isnull=False)
        .values(
            "requirement__product_id",
            "requirement__product__name",
            "requirement__product__identifier",
        )
        .annotate(count=Count("id"))
        .order_by("requirement__product__identifier")
    ]

    scoped = base.filter(requirement__product_id=product_id) if product_id else base

    # 五个状态的键恒存在（含 0）：前端的状态条是固定五段，缺键会让某一段直接消失
    by_status = {value: 0 for value in RequirementItemStatus.values}
    for row in scoped.values("requirement__status").annotate(count=Count("id")):
        if row["requirement__status"] in by_status:
            by_status[row["requirement__status"]] = row["count"]

    by_requirement_type = {
        str(row["requirement__requirement_type_id"]): row["count"]
        for row in scoped.exclude(requirement__requirement_type_id=None)
        .values("requirement__requirement_type_id")
        .annotate(count=Count("id"))
    }

    return {
        "by_product": by_product,
        "by_status": by_status,
        "by_requirement_type": by_requirement_type,
        "total": sum(item["count"] for item in by_product),
    }


def status_counts_by_project(*, product_id, project_ids):
    """产品侧「关联项目」列表用：每个项目引用了本产品多少需求、各状态各多少。

    状态是需求级的（跨项目共享一份），所以同一条需求进了几个项目就会在几个项目的
    bucket 里各计一次 —— 这里统计的是「该项目引用的本产品需求，按需求状态的分布」。

    每个 bucket 在五个状态键之外另带 issue_total / issue_completed /
    issue_cancelled 三个工作项聚合键（本产品需求在该项目下的 live 关联工作项，
    按 State.group 分桶），供前端按任务完成率展示 —— 状态键与工作项键混在同一个
    dict 里，消费方按键取用，不要对整个 bucket 求和。

    一次分组查询覆盖所有项目，序列化器按 project_id 取用 —— 不要每行查一次。
    """
    from django.db.models import Count

    counts = {
        str(project_id): {
            **{value: 0 for value in RequirementItemStatus.values},
            "issue_total": 0,
            "issue_completed": 0,
            "issue_cancelled": 0,
        }
        for project_id in project_ids
    }
    rows = (
        RequirementProject.objects.filter(
            project_id__in=project_ids,
            requirement__product_id=product_id,
            # 同上：软删的需求不该计进产品侧的需求数与完成率
            requirement__deleted_at__isnull=True,
        )
        .values("project_id", "requirement__status")
        .annotate(count=Count("id"))
    )
    for row in rows:
        bucket = counts.get(str(row["project_id"]))
        if bucket is not None and row["requirement__status"] in bucket:
            bucket[row["requirement__status"]] = row["count"]

    # 工作项聚合同样一次分组覆盖所有项目。issue__/requirement__deleted_at 显式
    # 过滤理由同上：FK 穿透不走软删 manager，窗口期里已删行不能再计进完成率
    issue_rows = (
        RequirementIssue.objects.filter(
            project_id__in=project_ids,
            requirement__product_id=product_id,
            requirement__deleted_at__isnull=True,
            issue__deleted_at__isnull=True,
        )
        .order_by()
        .values("project_id", "issue__state__group")
        .annotate(count=Count("id"))
    )
    for row in issue_rows:
        bucket = counts.get(str(row["project_id"]))
        if bucket is None:
            continue
        bucket["issue_total"] += row["count"]
        if row["issue__state__group"] == StateGroup.COMPLETED:
            bucket["issue_completed"] += row["count"]
        elif row["issue__state__group"] == StateGroup.CANCELLED:
            bucket["issue_cancelled"] += row["count"]
    return counts


def resolve_linkable_requirements(*, slug, project_id, requirement_ids):
    """把一批需求 id 解析成可关联的需求行；任一条不合格就整批拒绝。

    全有或全无 —— 与 row_base.bulk_destroy 同样的取舍：部分成功会让前端拿不准哪些
    生效了，而这里的失败原因（未过评审 / 产品没关联进本项目）都是用户可以自己修的。
    """
    requested = list(dict.fromkeys(str(item) for item in requirement_ids))
    if not requested:
        raise RequirementLinkError(
            "Requirements are required.", code="REQUIREMENT_LINK_EMPTY"
        )

    rows = list(
        Requirement.objects.filter(id__in=requested, workspace__slug=slug).only(
            "id", "product_id", "approved_version", "status"
        )
    )
    found = {str(row.id): row for row in rows}
    allowed_product_ids = {str(pid) for pid in linked_product_ids(project_id)}

    conflicts = []
    for requirement_id in requested:
        row = found.get(requirement_id)
        if row is None:
            conflicts.append({"id": requirement_id, "reason": "NOT_FOUND"})
        elif not row.product_id:
            # 项目自建需求与标准库条目不走这条链路：它们没有产品作用域，
            # 「产品定义需求 → 项目交付需求」这条线上不存在它们。
            conflicts.append({"id": requirement_id, "reason": "NOT_PRODUCT_SCOPED"})
        elif str(row.product_id) not in allowed_product_ids:
            conflicts.append({"id": requirement_id, "reason": "PRODUCT_NOT_LINKED"})
        elif row.approved_version is None:
            conflicts.append({"id": requirement_id, "reason": "NOT_APPROVED"})
        elif row.status == RequirementItemStatus.CLOSED:
            conflicts.append({"id": requirement_id, "reason": "CLOSED"})

    if conflicts:
        raise RequirementLinkError(
            "Some requirements cannot be linked to this project.",
            code="REQUIREMENT_LINK_REJECTED",
            detail={"conflicts": conflicts},
        )

    return [found[requirement_id] for requirement_id in requested]


def resolve_linkable_products(*, user, slug, project, product_ids):
    """解析一批可关联的产品 id。

    两条规则，缺一不可：
    - 两端必须同工作区。DB 表达不了（workspace 各自挂在父表上），这里兜住。
    - **调用者必须看得见这个产品**（can_view_product）。少了这条，任何持有
      project.product_link.manage 的人都可以把一个 network=0 的私密产品关联进自己的
      项目，然后从 linkable-requirements 里读出它全部已评审需求的正文与自定义字段 ——
      产品作用域的端点会 404 掉他，项目这条路却绕开了那道门。
    """
    from plane.db.models import Product
    from plane.utils.product import can_view_product

    requested = list(dict.fromkeys(str(item) for item in product_ids))
    if not requested:
        return []

    rows = (
        Product.objects.filter(
            id__in=requested, workspace__slug=slug, workspace_id=project.workspace_id
        )
        .select_related("workspace")
        .prefetch_related("reviewers")
    )
    # 不可见的产品与不存在的产品报同一个错：区分开等于告诉调用者「这个 id 是存在的」
    visible = {str(row.id) for row in rows if can_view_product(user, row)}
    missing = [item for item in requested if item not in visible]
    if missing:
        raise RequirementLinkError(
            "Some products do not exist in this workspace.",
            code="PRODUCT_LINK_REJECTED",
            detail={"product_ids": missing},
        )
    return requested


def resolve_linkable_projects(*, user, slug, product, project_ids):
    """解析一批可从产品侧关联的项目 id。

    产品页写这张桥时，不能只看「看得见这个项目」：公开项目对工作区全员可见，
    产品负责人若能把产品塞进任意公开项目，等于改了别人的需求候选池。
    所以这里要求调用者是该项目的活跃成员，且项目未归档、与产品同工作区。
    """
    from plane.db.models import Project

    requested = list(dict.fromkeys(str(item) for item in project_ids))
    if not requested:
        return []

    rows = Project.objects.filter(
        id__in=requested,
        workspace__slug=slug,
        workspace_id=product.workspace_id,
        archived_at__isnull=True,
        project_projectmember__member=user,
        project_projectmember__is_active=True,
    ).distinct()
    visible = {str(row.id) for row in rows}
    missing = [item for item in requested if item not in visible]
    if missing:
        raise RequirementLinkError(
            "Some projects do not exist in this workspace.",
            code="PROJECT_LINK_REJECTED",
            detail={"project_ids": missing},
        )
    return requested


def unlink_product_from_project(*, slug, project_id, product_id):
    """解除一条产品 ↔ 项目关联。该项目下还有本产品需求时拒绝，避免留下孤儿引用。"""
    linked_count = RequirementProject.objects.filter(
        project_id=project_id, requirement__product_id=product_id
    ).count()
    if linked_count:
        raise RequirementLinkError(
            "Unlink this product's requirements from the project first.",
            code="PRODUCT_HAS_LINKED_REQUIREMENTS",
            detail={
                "product_id": str(product_id),
                "project_id": str(project_id),
                "requirement_count": linked_count,
            },
        )
    ProductProject.objects.filter(
        workspace__slug=slug, project_id=project_id, product_id=product_id
    ).delete()


def is_requirement_linked(*, requirement_id, project_id):
    return RequirementProject.objects.filter(
        requirement_id=requirement_id, project_id=project_id
    ).exists()


def can_submit_change_from_project(user, requirement, project) -> bool:
    """项目成员对「已关联进本项目」的需求可以发起变更单，但不能直接改内容。

    刻意**不放宽** utils/product.py::can_edit_product_requirements —— 那个函数一放开，
    row_base 的七个写端点、变更单的全部写路径、以及序列化器的 can_edit 标志会一起
    打开。这里只回答「这条需求能不能从这个项目提单」。

    项目成员身份与 project.requirement_link.view 由端点上的
    @allow_fine_permission 负责，这里不重复查一遍权限表 —— 两处判定各自演进迟早
    会对不上。
    """
    if requirement is None or project is None:
        return False
    # 变更单是产品作用域的，需求本体必须归属某个产品
    if not requirement.product_id:
        return False
    if not is_requirement_linked(requirement_id=requirement.id, project_id=project.id):
        return False
    # 已经在别的待审单里的行内容只读，再开一张单会让两张单基于同一份快照
    return not requirement.is_locked


def resolve_policy_for_linked_requirement(requirement):
    """取需求所属产品的审批配置。

    与 views/requirement/mixins.get_scoped_policy 的区别有两点，都是刻意的：
    - 不查产品可见性。能走到这里的人已经通过了项目侧的 requirement_link 权限，
      而需求本身已经被关联进这个项目 —— 产品的可见性不该再挡一次。
    - 不惰性创建。配置行不存在意味着这个产品还没有审批人，submit_change_request
      随后也会以 REQUIREMENT_APPROVER_REQUIRED 拒绝；由项目成员创建一条 owner 是
      自己的产品审批配置显然更糟。
    """
    return (
        RequirementApprovalPolicy.objects.filter(product_id=requirement.product_id)
        .select_related("workspace", "product", "project", "owner")
        .first()
    )


def set_requirement_status(requirement_id, *, status, actor=None):
    """需求状态的人工写入口，产品侧与项目侧共用。

    条件化 `.update()` 而不是 `row.save()`：绕开 `Requirement.save()` 的其他副作用，
    不 bump version、不碰 approved_row_version —— 状态不算内容
    （utils/requirement.NON_CONTENT_BUILTIN_COLUMNS），改它不该触发评审。

    不判 closed（closed → 任意非 closed 值就是「重开」）、不判 is_locked（评审轴与
    状态轴正交）。status 的合法性由调用方的 ChoiceField 校验。
    """
    Requirement.objects.filter(id=requirement_id).update(
        status=status,
        updated_at=timezone.now(),
        updated_by_id=actor.id if actor else None,
    )


def promote_on_project_link(requirement_ids):
    """自动推进 (a)：需求被关联进项目 → not_started → projected。只升不降、幂等。

    重复关联同一项目也算「关联事件」—— 曾被人工降回 not_started 的会再升一次。
    """
    ids = list(requirement_ids)
    if not ids:
        return
    Requirement.objects.filter(
        id__in=ids, status=RequirementItemStatus.NOT_STARTED
    ).update(status=RequirementItemStatus.PROJECTED, updated_at=timezone.now())


def promote_to_released(requirement_ids):
    """自动推进 (b) 的核心：not_started / projected / in_progress → released。
    closed 不动；已是 released 的自然幂等。"""
    ids = list(requirement_ids)
    if not ids:
        return
    Requirement.objects.filter(
        id__in=ids,
        status__in=[
            RequirementItemStatus.NOT_STARTED,
            RequirementItemStatus.PROJECTED,
            RequirementItemStatus.IN_PROGRESS,
        ],
    ).update(status=RequirementItemStatus.RELEASED, updated_at=timezone.now())


def promote_on_release_completed(release_id):
    """发布单变为已发布（completed）→ 该发布单下全部关联需求推到 released。

    发布单之后被驳回 / 取消 / 改回测试中，一律**不降档**。把需求补挂进一张已发布
    的发布单时，调用方对「本批 ids」直接调 promote_to_released，不用整单 ——
    避免把人工降回去的旧关联再推一次。
    """
    promote_to_released(
        RequirementRelease.objects.filter(release_id=release_id)
        .order_by()
        .values_list("requirement_id", flat=True)
    )
