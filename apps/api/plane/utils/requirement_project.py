"""需求进项目：候选池、关联校验、项目侧的提单授权，以及阶段重算引擎。

这里只处理「引用」这一层。需求本体、字段结构、版本、基线、审批名单全部仍归产品，
项目侧一律只读 —— 唯一的写入口是关联关系本身（项目/迭代/发布三张关联表）与
sort_order。stage 是**纯派生列**：由 recalculate_stage 按现存关联事实取最高档，
不接受任何手动写入。

工作项派生（in_progress / done 两档）属于 P3，届时在 recalculate_stage 里补
事实来源即可，阶梯与调用点都不用动。
"""

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import (
    BooleanField,
    ExpressionWrapper,
    JSONField,
    OuterRef,
    Q,
    Subquery,
    UUIDField,
    Value,
)
from django.db.models.functions import Coalesce, JSONObject
from django.utils import timezone

from plane.db.models import (
    Cycle,
    ProductProject,
    ReleaseStatus,
    Requirement,
    RequirementApprovalPolicy,
    RequirementCycle,
    RequirementItemStatus,
    RequirementProject,
    RequirementProjectActivity,
    RequirementProjectStage,
    RequirementRelease,
    STAGE_LADDER,
)


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
    """候选池：本项目关联产品下、已通过评审、且尚未关联进来的需求。

    只放 approved_version 非空的行（决策 3）：未过评审的需求不进入交付链路。
    副作用是正向的 —— 被关联的需求必然有 approved_version，后续把 status 推到
    implemented 不会撞上 req_draft_status_iff_never_approved。
    """
    return (
        Requirement.objects.filter(
            workspace__slug=slug,
            product_id__in=linked_product_ids(project_id),
            approved_version__isnull=False,
        )
        .exclude(id__in=linked_requirement_ids(project_id))
        .select_related("product")
        .order_by("product__identifier", "sort_order", "created_at", "id")
    )


def linked_requirements_queryset(*, slug, project_id):
    """本项目已关联的需求，按关联行的 sort_order 排。

    stage / link_sort_order 从关联行拉平到需求行上，列表序列化器直接读注解，
    不必为每行再查一次中间表。

    另外三个注解服务「阶段可解释」：latest_cycle_name / latest_release_name 是
    阶段胶囊 tooltip 的推导依据（阶段是派生值，不给依据用户只能猜）；
    has_completed_cycle 供序列化器算 carryover（已排期但迭代已结束的顺延信号）。
    """
    from django.db.models import Exists

    link_rows = RequirementProject.objects.filter(
        requirement_id=OuterRef("pk"), project_id=project_id
    )
    # 有效迭代关联（未取消；NULL 状态的历史行不算已取消）。取最近一条的名字做依据。
    # cycle__/release__deleted_at 显式过滤：FK 穿透不走软删 manager，
    # 推导依据不能指向一个已删除的容器
    valid_cycle_rows = RequirementCycle.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        cycle__deleted_at__isnull=True,
    ).filter(Q(cycle__status__isnull=True) | ~Q(cycle__status=Cycle.Status.CANCELLED))
    # 在途或已发布的发布关联（驳回/取消的不再作为依据展示）
    live_release_rows = RequirementRelease.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        release__deleted_at__isnull=True,
    ).exclude(release__status__in=[ReleaseStatus.REJECTED, ReleaseStatus.CANCELLED])
    completed_cycle_rows = RequirementCycle.objects.filter(
        requirement_id=OuterRef("pk"),
        project_id=project_id,
        cycle__deleted_at__isnull=True,
        cycle__status=Cycle.Status.COMPLETED,
    )
    return (
        Requirement.objects.filter(
            workspace__slug=slug,
            id__in=linked_requirement_ids(project_id),
        )
        .annotate(
            stage=Subquery(link_rows.values("stage")[:1]),
            link_sort_order=Subquery(link_rows.values("sort_order")[:1]),
            latest_cycle_name=Subquery(
                valid_cycle_rows.order_by("-created_at").values("cycle__name")[:1]
            ),
            latest_release_name=Subquery(
                # 已发布的优先于在途的：released 档的依据必须指向那张已发布的单
                live_release_rows.annotate(
                    is_completed=ExpressionWrapper(
                        Q(release__status=ReleaseStatus.COMPLETED),
                        output_field=BooleanField(),
                    )
                )
                .order_by("-is_completed", "-created_at")
                .values("release__name")[:1]
            ),
            has_completed_cycle=Exists(completed_cycle_rows),
        )
        .select_related("product")
        .order_by("link_sort_order", "product__identifier", "sequence_id")
    )


def annotate_project_links(queryset):
    """把「这条需求进了哪些项目、各在什么阶段」注解成 JSON 数组
    `[{"project_id": ..., "stage": ...}]`。

    照 utils/grouper.py 的 ArrayAgg 子查询范式。deleted_at__isnull=True 是必需的 ——
    关联行是软删的，漏了它解除关联的项目会一直挂在需求上。归档项目一并排除，否则
    详情页的「所属项目」多选会回显一个选不中的项目。

    序列化器从这一个注解同时派生 project_ids（兼容旧消费方）与 project_links
    （产品侧的项目阶段徽章、零关联时前端显示「未开始」）。
    """
    subquery = Subquery(
        RequirementProject.objects.filter(
            requirement_id=OuterRef("pk"),
            deleted_at__isnull=True,
            project__archived_at__isnull=True,
        )
        .values("requirement_id")
        .annotate(arr=ArrayAgg(JSONObject(project_id="project_id", stage="stage")))
        .values("arr")
    )
    return queryset.annotate(
        project_links=Coalesce(
            subquery, Value([], output_field=ArrayField(JSONField()))
        )
    )


def requirement_facets(*, project_id, product_id=None):
    """项目需求页顶部分面的计数。

    **口径**（改之前先读完，分面计数最容易出的 bug 就是「点了筛选之后其他分面全变 0」）：
    - `by_product` 统计**全集**，不受任何筛选影响 —— 产品 tab 是最外层作用域，它自己的
      数字不该随选中项变化，否则点进 ECOM 之后 PAY 变成 0，用户就再也回不去了。
    - `by_stage` / `by_requirement_type` 跟随**当前选中的产品**（视觉上它们嵌套在产品
      tab 之下），但不跟随搜索、阶段、类型自身 —— 同理，阶段条上的数字不能因为选了
      「研发中」就把其余四段清零。

    实现上直接聚合 `RequirementProject` 表，**不要**去
    `linked_requirements_queryset` 的 `stage` Subquery 注解上做 GROUP BY —— 那会把整个
    子查询塞进 GROUP BY 子句。这里一次分组扫的是关联表，代价与页大小无关。
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

    # 五个阶段的键恒存在（含 0）：前端的阶段条是固定五段，缺键会让某一段直接消失
    by_stage = {value: 0 for value in RequirementProjectStage.values}
    for row in scoped.values("stage").annotate(count=Count("id")):
        by_stage[row["stage"]] = row["count"]

    by_requirement_type = {
        str(row["requirement__requirement_type_id"]): row["count"]
        for row in scoped.exclude(requirement__requirement_type_id=None)
        .values("requirement__requirement_type_id")
        .annotate(count=Count("id"))
    }

    return {
        "by_product": by_product,
        "by_stage": by_stage,
        "by_requirement_type": by_requirement_type,
        "total": sum(item["count"] for item in by_product),
    }


def stage_counts_by_project(*, product_id, project_ids):
    """产品侧「关联项目」列表用：每个项目引用了本产品多少需求、各阶段各多少。

    一次分组查询覆盖所有项目，序列化器按 project_id 取用 —— 不要每行查一次。
    """
    from django.db.models import Count

    counts = {
        str(project_id): {value: 0 for value in RequirementProjectStage.values}
        for project_id in project_ids
    }
    rows = (
        RequirementProject.objects.filter(
            project_id__in=project_ids,
            requirement__product_id=product_id,
            # 同上：软删的需求不该计进产品侧的需求数与完成率
            requirement__deleted_at__isnull=True,
        )
        .values("project_id", "stage")
        .annotate(count=Count("id"))
    )
    for row in rows:
        bucket = counts.get(str(row["project_id"]))
        if bucket is not None:
            bucket[row["stage"]] = row["count"]
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
            "id", "product_id", "approved_version"
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


def recalculate_stage(requirement_id, project_id, *, trigger=None, actor=None):
    """按现存关联事实重算 (需求, 项目) 的阶段，取 STAGE_LADDER 里的最高档。

    事实 → 档位（全部现查关联对象的当前状态，不存副本）：
    - 存在未取消的迭代关联            → planned（已排期）
    - 存在在途（未驳回/未取消）发布关联 → pending_verification（待验证）
    - 存在已发布（completed）发布关联   → released（已发布）
    - 什么都没有                      → linked（已立项）

    幂等、顺序无关：升档降档走同一条路 —— 事实作废（发布单被驳回、迭代被取消、
    解除关联）后重算自然回落。**迭代完成刻意不是事实**：时间盒到期不说明需求做完，
    顺延是常态，阶段保持已排期（前端用 carryover 标记提示）。

    **显式调用，不挂信号** —— 信号会让阶段推导与迭代/发布写路径耦合到无法排查。
    写入点清单：需求↔迭代/发布关联增删（views/requirement/container.py）、迭代状态
    变更涉及已取消（views/cycle/base.py）、发布状态任何变更（views/release/base.py）、
    以及 P3 之后的工作项事实（届时在下方补 in_progress / done 两档）。

    阶段变化时写一行 RequirementProjectActivity 留痕（trigger 记触发来源快照），
    并级联重算需求本体 status。返回新阶段；无变化返回 None。
    """
    link = RequirementProject.objects.filter(
        requirement_id=requirement_id, project_id=project_id
    ).first()
    if link is None:
        return None

    # 迭代事实。cycle.status 可空（历史行），空状态不等于已取消 —— 用显式的
    # isnull 分支兜住，否则 exclude/~Q 的 SQL 语义会把 NULL 行一并丢掉。
    # cycle__deleted_at 必须显式过滤：FK 穿透不走软删 manager，删除容器与
    # 异步级联之间的窗口期里，已删迭代不能再算有效事实。
    has_scheduled_cycle = (
        RequirementCycle.objects.filter(
            requirement_id=requirement_id,
            project_id=project_id,
            cycle__deleted_at__isnull=True,
        )
        .filter(
            Q(cycle__status__isnull=True) | ~Q(cycle__status=Cycle.Status.CANCELLED)
        )
        .exists()
    )

    # 发布事实一次取全：同一批状态既判「在途」又判「已发布」。
    # release__deleted_at 过滤理由同上
    release_statuses = set(
        RequirementRelease.objects.filter(
            requirement_id=requirement_id,
            project_id=project_id,
            release__deleted_at__isnull=True,
        ).values_list("release__status", flat=True)
    )
    dead_statuses = {ReleaseStatus.REJECTED, ReleaseStatus.CANCELLED}

    candidates = [RequirementProjectStage.LINKED]
    if has_scheduled_cycle:
        candidates.append(RequirementProjectStage.PLANNED)
    if any(status not in dead_statuses for status in release_statuses):
        candidates.append(RequirementProjectStage.PENDING_VERIFICATION)
    if ReleaseStatus.COMPLETED in release_statuses:
        candidates.append(RequirementProjectStage.RELEASED)

    new_stage = max(candidates, key=STAGE_LADDER.index)
    if link.stage == new_stage:
        # 阶段没变也要级联 status：解除项目关联等场景改变的是「全部已发布」的
        # 分母而不是本行阶段
        recalculate_requirement_status(requirement_id)
        return None

    old_stage = link.stage
    link.stage = new_stage
    link.save(update_fields=["stage", "updated_at"])
    RequirementProjectActivity.objects.create(
        workspace_id=link.workspace_id,
        project_id=link.project_id,
        requirement_id=requirement_id,
        old_stage=old_stage,
        new_stage=new_stage,
        trigger=trigger or {},
        created_by_id=actor.id if actor else None,
        updated_by_id=actor.id if actor else None,
    )
    recalculate_requirement_status(requirement_id)
    return new_stage


def recalculate_stages_for_cycle(cycle_id, *, trigger=None, actor=None):
    """迭代状态变更后，重算所有关联到它的 (需求, 项目)。

    逐条走 recalculate_stage 保持单一代码路径 —— 每条约 4 个索引查询，一个挂了
    几十条需求的迭代也就百余次点查，正确性优先于聚合优化。
    """
    pairs = RequirementCycle.objects.filter(cycle_id=cycle_id).values_list(
        "requirement_id", "project_id"
    )
    for requirement_id, project_id in pairs:
        recalculate_stage(requirement_id, project_id, trigger=trigger, actor=actor)


def recalculate_stages_for_release(release_id, *, trigger=None, actor=None):
    """发布单状态变更（发布/驳回/终止/恢复）后，重算所有关联到它的 (需求, 项目)。"""
    pairs = RequirementRelease.objects.filter(release_id=release_id).values_list(
        "requirement_id", "project_id"
    )
    for requirement_id, project_id in pairs:
        recalculate_stage(requirement_id, project_id, trigger=trigger, actor=actor)


def recalculate_requirement_status(requirement_id):
    """需求本体 status 的对称回写 —— stage 聚合到全局轴的唯一口子。

    所有关联项目的 stage 均为已发布**且至少有一条关联行** → implemented；条件
    失效（任一项目降档、或新关联进一个未发布的项目）→ 退回 confirmed。

    只在 confirmed ↔ implemented 之间翻转：draft 属审批轴（能进项目的需求必已
    审批，见 linkable_requirements_queryset 决策 3），obsolete 是人为动作，两者
    都不许碰。条件化 .update() 天然幂等，也绕开 Requirement.save() 的其他副作用；
    status 不算内容（NON_CONTENT_BUILTIN_COLUMNS），不 bump version、不触发评审。

    行锁串行化并发重算：两个触发点各自读分母再写，交错会让后写者依据过期快照
    （如 A 读到全部 released 的同时 B 插入一条 linked 行）。锁住需求行后再读
    关联行，第二个拿到锁的必然看到最新分母。
    """
    from django.db import transaction

    with transaction.atomic():
        locked = (
            Requirement.objects.select_for_update()
            .filter(id=requirement_id)
            .only("id", "status")
            .first()
        )
        if locked is None:
            return
        stages = list(
            RequirementProject.objects.filter(
                requirement_id=requirement_id
            ).values_list("stage", flat=True)
        )
        all_released = bool(stages) and all(
            stage == RequirementProjectStage.RELEASED for stage in stages
        )
        if all_released:
            Requirement.objects.filter(
                id=requirement_id, status=RequirementItemStatus.CONFIRMED
            ).update(
                status=RequirementItemStatus.IMPLEMENTED, updated_at=timezone.now()
            )
        else:
            Requirement.objects.filter(
                id=requirement_id, status=RequirementItemStatus.IMPLEMENTED
            ).update(
                status=RequirementItemStatus.CONFIRMED, updated_at=timezone.now()
            )
