"""评审裁剪的领域编排：建表 → 勾选 → 签批 → 生效 → 修订。

一句话讲清这套东西在做什么：**裁剪表是「产品 × 评审模板节点」的勾选矩阵，签批通过
的那一刻，把勾选状态同步成一批真实的评审实例（``StageReview``）。**

**两个轴都是人挑出来的**：横轴 ``ReviewTailoringProduct``、纵轴 ``ReviewTailoringTemplate``
（只存顶层评审，它的评审活动跟着整块进来），格子是两者的交叉积。没进轴的评审压根不出现
在表里，也就不必为它写裁剪原因 —— 全量铺开时「凡是没勾的都要写理由」才是真正劝退人的
地方。所以建表只要一个标题，建出来是一张零行零列的空表。

三条贯穿全文的约定：

1. **调用方负责事务与行锁。** 本模块的写函数一律假定外层已经
   ``transaction.atomic()`` 且对 ``ReviewTailoring`` 行做过
   ``select_for_update(of=("self",))``。表头行就是这套东西的聚合根 —— 通过判定要
   跨多条签批行聚合，只锁签批行挡不住「两个人同时点通过各自都以为达成了规则」。
2. **软删必须自己做。** ``SoftDeleteModel.delete()`` 的级联是
   ``soft_delete_related_objects.delay(...)``（``plane/db/mixins.py:72``），投递发生在
   事务提交之前，且没有 worker 就永远不跑。生效编排里删评审一律走 queryset 级删除
   并手动处理反向引用，见 ``_delete_stage_reviews``。
3. **状态回落走 ``_editable_status``。** 驳回与撤回都不是终态，它们回到「能继续改」
   的那个状态：从未生效过回 ``draft``，生效过回 ``revising``。判据是 ``approved_at``
   而不是 ``status``，因为 ``status`` 正是要被改写的那一列。
"""

from django.db.models import Q
from django.utils import timezone

from plane.db.models import (
    FileAsset,
    ProductProject,
    ReviewTailoring,
    ReviewTailoringActivity,
    ReviewTailoringApproval,
    ReviewTailoringApprovalAction,
    ReviewTailoringApprovalType,
    ReviewTailoringItem,
    ReviewTailoringProduct,
    ReviewTailoringStatus,
    ReviewTailoringTemplate,
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewStatus,
    StageReviewTemplate,
)
from plane.db.models.stage_review import ACTIVITY_KINDS
from plane.utils.requirement import get_requirement_eligible_user_ids


class ReviewTailoringError(Exception):
    """带错误码的领域异常。视图统一翻成 400 / 409，前端按 code 出中文文案。"""

    def __init__(self, message, *, code="REVIEW_TAILORING_INVALID", detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail or {}


#: 可编辑的两个状态。勾选、加产品、改标题、提交签批都只在这里面允许。
EDITABLE_STATUSES = (ReviewTailoringStatus.DRAFT, ReviewTailoringStatus.REVISING)


# --- 小工具 ---------------------------------------------------------------


def _editable_status(tailoring):
    """驳回 / 撤回 / 取消修订之后该回到哪个状态。"""
    return (
        ReviewTailoringStatus.REVISING
        if tailoring.approved_at
        else ReviewTailoringStatus.DRAFT
    )


def _require_status(tailoring, statuses, *, code, message):
    if tailoring.status not in statuses:
        raise ReviewTailoringError(message, code=code)


def _write_activity(
    tailoring,
    *,
    actor,
    verb,
    field=None,
    old_value=None,
    new_value=None,
    comment="",
    extra=None,
    tailoring_comment=None,
):
    """同步写一条变更历史。

    ``created_by`` 走 crum 自动填不可靠（后台任务里没有请求上下文），显式给。
    """
    return ReviewTailoringActivity.objects.create(
        workspace_id=tailoring.workspace_id,
        project_id=tailoring.project_id,
        tailoring=tailoring,
        actor=actor,
        created_by=actor,
        updated_by=actor,
        verb=verb,
        field=field,
        old_value=None if old_value is None else str(old_value),
        new_value=None if new_value is None else str(new_value),
        comment=comment or "",
        extra=extra or {},
        tailoring_comment=tailoring_comment,
        epoch=int(timezone.now().timestamp()),
    )


def _linked_product_ids(project_id):
    """项目当前关联的产品。裁剪表的横轴只能从这里面选。"""
    return set(
        ProductProject.objects.filter(project_id=project_id).values_list(
            "product_id", flat=True
        )
    )


def _axis_product_ids(tailoring):
    """横轴上的产品，按加入顺序无关的固定口径排（列头的排序由视图统一做）。"""
    return list(
        ReviewTailoringProduct.objects.filter(tailoring=tailoring)
        .order_by("product__identifier", "product__name", "id")
        .values_list("product_id", flat=True)
    )


def _axis_root_ids(tailoring):
    """纵轴上的顶层评审 id。"""
    return list(
        ReviewTailoringTemplate.objects.filter(tailoring=tailoring).values_list(
            "template_id", flat=True
        )
    )


def _expand_templates(root_ids):
    """把选中的顶层评审展开成真正要铺的节点：它自己 + 它下面**当前启用**的评审活动。

    纵轴只存顶层，展开放在读的时候做 —— 模板库后来给这个评审加的新活动才进得来，那正是
    修订时 ``sync_items`` 该补上的东西。

    排序口径与模板库列表一致（``views/stage_review/template.py:48``）：阶段之间按字典值
    的 ``sort_order``，阶段内按节点的 ``sort_order``。``select_related("stage")`` 是给
    序列化器用的 —— 行要透出阶段标签。
    """
    root_ids = list(root_ids)
    if not root_ids:
        return []
    return list(
        StageReviewTemplate.objects.filter(
            Q(id__in=root_ids) | Q(parent_id__in=root_ids), is_active=True
        )
        .select_related("stage")
        .order_by("stage__sort_order", "sort_order", "created_at", "id")
    )


def axis_templates(tailoring):
    """纵轴展开后的全部节点。视图组装详情时也用它 —— 零产品的表要靠它画出行。"""
    return _expand_templates(_axis_root_ids(tailoring))


def _sort_templates_root_first(templates):
    """先根后子：生成评审实例时父必须先有 id，取消勾选时父先删。"""
    roots = [item for item in templates if item.parent_id is None]
    children = [item for item in templates if item.parent_id is not None]
    return roots + children


def _build_items(tailoring, templates, product_ids, actor):
    """按 (产品 × 模板节点) 铺格子。

    ``bulk_create`` 绕过 ``save()``，所以 ``title`` 快照与 ``created_by`` 都要显式给
    （``ReviewTailoringItem.save()`` 本来负责补 title）。
    """
    return [
        ReviewTailoringItem(
            tailoring=tailoring,
            product_id=product_id,
            template=template,
            title=template.title,
            selected=False,
            reason="",
            created_by=actor,
            updated_by=actor,
        )
        for product_id in product_ids
        for template in templates
    ]


# --- 建表与格子维护 --------------------------------------------------------


def create_tailoring(*, project, title, description_html, actor):
    """新建一张裁剪表。**只建表头，一个格子都不铺。**

    矩阵是「产品 × 全阶段模板节点」，而产品这一维在建表这一刻还不知道 —— 由人在详情页
    逐列添加（``add_products``）。所以新表是一张零列的空表，纵轴要等第一列产品进来才
    显形。
    """
    tailoring = ReviewTailoring.objects.create(
        workspace_id=project.workspace_id,
        project=project,
        title=title,
        description_html=description_html or None,
        status=ReviewTailoringStatus.DRAFT,
        created_by=actor,
        updated_by=actor,
    )
    _write_activity(
        tailoring,
        actor=actor,
        verb="created",
        field="tailoring",
        new_value=title,
    )
    return tailoring


def add_products(*, tailoring, product_ids, actor):
    """给横轴加几列产品，并按当前纵轴把这几列的格子铺满。

    产品必须已经关联进本项目 —— 裁剪的是「本项目要为这个产品做哪些评审」，没关联的
    产品在这里没有意义。纵轴此刻可以是空的：列先立住，等加了评审再由 ``add_reviews``
    把交叉的格子补出来。
    """
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )
    product_ids = list(dict.fromkeys(product_ids))
    linked = _linked_product_ids(tailoring.project_id)
    invalid = [str(pid) for pid in product_ids if pid not in linked]
    if invalid:
        raise ReviewTailoringError(
            "Some products are not linked to this project.",
            code="REVIEW_TAILORING_PRODUCT_NOT_LINKED",
            detail={"product_ids": invalid},
        )

    existing = set(_axis_product_ids(tailoring))
    fresh = [pid for pid in product_ids if pid not in existing]
    if not fresh:
        return 0

    ReviewTailoringProduct.objects.bulk_create(
        [
            ReviewTailoringProduct(
                tailoring=tailoring,
                product_id=product_id,
                created_by=actor,
                updated_by=actor,
            )
            for product_id in fresh
        ]
    )
    templates = axis_templates(tailoring)
    if templates:
        ReviewTailoringItem.objects.bulk_create(
            _build_items(tailoring, templates, fresh, actor), batch_size=500
        )
    _write_activity(
        tailoring,
        actor=actor,
        verb="updated",
        field="products",
        new_value=len(fresh),
        extra={"product_ids": [str(pid) for pid in fresh]},
    )
    return len(fresh)


def add_reviews(*, tailoring, template_ids, actor):
    """给纵轴加几个评审，并按当前横轴把这几行的格子铺满。

    只收**顶层节点**（评审，或直接挂在阶段下的评审活动）—— 它下面的评审活动跟着整块进
    矩阵。「这个评审要做，但其中某个活动不做」由矩阵里取消勾选 + 写裁剪原因表达，而不是
    靠纵轴少加一行；反过来，跟本项目无关的评审根本不进表，也就不用为它编理由。
    """
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )
    template_ids = list(dict.fromkeys(template_ids))
    candidates = {
        template.id: template
        for template in StageReviewTemplate.objects.filter(
            id__in=template_ids, workspace_id=tailoring.workspace_id, is_active=True
        )
    }
    invalid = [str(tid) for tid in template_ids if tid not in candidates]
    if invalid:
        raise ReviewTailoringError(
            "Some reviews do not exist in this workspace or are disabled.",
            code="REVIEW_TAILORING_TEMPLATE_INVALID",
            detail={"template_ids": invalid},
        )
    not_root = [
        str(tid) for tid in template_ids if candidates[tid].parent_id is not None
    ]
    if not_root:
        raise ReviewTailoringError(
            "Only a top-level review can be added to the matrix.",
            code="REVIEW_TAILORING_TEMPLATE_NOT_ROOT",
            detail={"template_ids": not_root},
        )

    existing = set(_axis_root_ids(tailoring))
    fresh = [tid for tid in template_ids if tid not in existing]
    if not fresh:
        return 0

    ReviewTailoringTemplate.objects.bulk_create(
        [
            ReviewTailoringTemplate(
                tailoring=tailoring,
                template_id=template_id,
                created_by=actor,
                updated_by=actor,
            )
            for template_id in fresh
        ]
    )
    product_ids = _axis_product_ids(tailoring)
    if product_ids:
        ReviewTailoringItem.objects.bulk_create(
            _build_items(tailoring, _expand_templates(fresh), product_ids, actor),
            batch_size=500,
        )
    _write_activity(
        tailoring,
        actor=actor,
        verb="updated",
        field="reviews",
        new_value=len(fresh),
        extra={
            "template_ids": [str(tid) for tid in fresh],
            "titles": [candidates[tid].title for tid in fresh],
        },
    )
    return len(fresh)


def _assert_axis_removable(items):
    """这一行 / 这一列能不能移除。

    只要其中任何一个格子已经生成过评审实例，就不许悄悄抽掉 —— 那条评审是既成事实，抽掉
    整行会让它失去唯一的来源解释。要下线请走修订，把格子取消勾选，让 ``_apply_effective``
    正经把评审删掉。
    """
    blocking = [item for item in items if item.stage_review_id]
    if blocking:
        raise ReviewTailoringError(
            "Some cells already generated reviews; uncheck them in a revision instead.",
            code="REVIEW_TAILORING_AXIS_IN_USE",
            detail={"item_ids": [str(item.id) for item in blocking]},
        )


def remove_product(*, tailoring, product_id, actor):
    """移除横轴的一列。加错了能改回来，不必删表重建。"""
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )
    column = ReviewTailoringProduct.objects.filter(
        tailoring=tailoring, product_id=product_id
    ).first()
    if column is None:
        raise ReviewTailoringError(
            "This product is not on the matrix.",
            code="REVIEW_TAILORING_AXIS_NOT_FOUND",
        )

    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring, product_id=product_id)
    )
    _assert_axis_removable(items)

    # 硬删：这一列从未生效过，留着软删行只会让唯一约束挡住下次重新加回来
    ReviewTailoringItem.objects.filter(
        id__in=[item.id for item in items]
    ).delete(soft=False)
    ReviewTailoringProduct.objects.filter(id=column.id).delete(soft=False)
    _write_activity(
        tailoring,
        actor=actor,
        verb="updated",
        field="products",
        old_value=1,
        extra={"removed_product_id": str(product_id)},
    )
    return len(items)


def remove_review(*, tailoring, template_id, actor):
    """移除纵轴的一行（顶层评审连同它的评审活动）。"""
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )
    row = ReviewTailoringTemplate.objects.filter(
        tailoring=tailoring, template_id=template_id
    ).select_related("template").first()
    if row is None:
        raise ReviewTailoringError(
            "This review is not on the matrix.",
            code="REVIEW_TAILORING_AXIS_NOT_FOUND",
        )

    # 停用后的活动不在 _expand_templates 里，但它的格子还在，所以按 template 的父子关系查
    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring).filter(
            Q(template_id=template_id) | Q(template__parent_id=template_id)
        )
    )
    _assert_axis_removable(items)

    ReviewTailoringItem.objects.filter(
        id__in=[item.id for item in items]
    ).delete(soft=False)
    ReviewTailoringTemplate.objects.filter(id=row.id).delete(soft=False)
    _write_activity(
        tailoring,
        actor=actor,
        verb="updated",
        field="reviews",
        old_value=1,
        extra={"removed_template_id": str(template_id), "title": row.template.title},
    )
    return len(items)


def sync_items(*, tailoring, actor):
    """把格子对齐「当前横轴 × 当前纵轴展开后的节点」。

    开始修订时跑一次：这期间模板库可能给某个已选评审加了新活动、也可能停用了旧活动。

    顺带收一下轴自己的烂摊子：产品被解除了与本项目的关联、顶层评审被停用或删除，那一
    行 / 那一列就不该继续留在表上。

    删的分寸：只删还没生成过评审的格子 —— 已经生成的评审是既成事实，产品被解除关联不该
    让它凭空消失，那属于评审自己的生命周期。
    """
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )

    items = list(ReviewTailoringItem.objects.filter(tailoring=tailoring))
    linked = _linked_product_ids(tailoring.project_id)

    # 1. 轴上已经站不住的行列先摘掉（有格子生成过评审的留着，理由同上）
    stale_columns = [
        column
        for column in ReviewTailoringProduct.objects.filter(tailoring=tailoring)
        if column.product_id not in linked
    ]
    generated_products = {item.product_id for item in items if item.stage_review_id}
    stale_columns = [
        column for column in stale_columns if column.product_id not in generated_products
    ]
    if stale_columns:
        ReviewTailoringProduct.objects.filter(
            id__in=[column.id for column in stale_columns]
        ).delete(soft=False)

    live_root_ids = set(
        StageReviewTemplate.objects.filter(
            id__in=_axis_root_ids(tailoring), is_active=True
        ).values_list("id", flat=True)
    )
    generated_templates = {item.template_id for item in items if item.stage_review_id}
    stale_rows = [
        row
        for row in ReviewTailoringTemplate.objects.filter(tailoring=tailoring)
        if row.template_id not in live_root_ids
        and row.template_id not in generated_templates
    ]
    if stale_rows:
        ReviewTailoringTemplate.objects.filter(
            id__in=[row.id for row in stale_rows]
        ).delete(soft=False)

    # 2. 再按收拾干净的两个轴对齐格子
    product_ids = _axis_product_ids(tailoring)
    templates = axis_templates(tailoring)
    template_ids = {template.id for template in templates}
    product_id_set = set(product_ids)
    present = {(item.product_id, item.template_id) for item in items}

    missing = [
        ReviewTailoringItem(
            tailoring=tailoring,
            product_id=product_id,
            template=template,
            title=template.title,
            selected=False,
            reason="",
            created_by=actor,
            updated_by=actor,
        )
        for product_id in product_ids
        for template in templates
        if (product_id, template.id) not in present
    ]
    if missing:
        ReviewTailoringItem.objects.bulk_create(missing, batch_size=500)

    # 掉出两个轴、且从没生成过评审的格子 → 硬删干净。硬删是因为它从未生效过，留着只会
    # 让矩阵多出一行 / 一列读不懂的东西。
    stale = [
        item
        for item in items
        if item.stage_review_id is None
        and (
            item.product_id not in product_id_set or item.template_id not in template_ids
        )
    ]
    if stale:
        ReviewTailoringItem.objects.filter(
            id__in=[item.id for item in stale]
        ).delete(soft=False)

    if missing or stale:
        _write_activity(
            tailoring,
            actor=actor,
            verb="updated",
            field="items",
            old_value=len(stale),
            new_value=len(missing),
            extra={"added": len(missing), "removed": len(stale)},
        )
    return len(missing), len(stale)


def save_cells(*, tailoring, cells, actor):
    """保存勾选与裁剪原因，并把父子联动收敛好。

    联动规则（产品决策）：勾一个评审活动 → 它所属的评审自动勾上；取消一个评审 →
    它下面的活动全部取消。前端也做同样的联动，这里再做一遍是因为**前端的联动只是
    交互糖**，服务端不能相信客户端算对了。

    草稿态允许原因留空 —— 逼着边勾边写会让人没法先把矩阵勾完。缺原因在提交签批时才拦。
    """
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be edited.",
    )

    items = {
        item.id: item
        for item in ReviewTailoringItem.objects.filter(
            tailoring=tailoring
        ).select_related("template")
    }
    unknown = [str(cell["id"]) for cell in cells if cell["id"] not in items]
    if unknown:
        raise ReviewTailoringError(
            "Some cells do not belong to this tailoring.",
            code="REVIEW_TAILORING_ITEM_NOT_FOUND",
            detail={"item_ids": unknown},
        )

    before = {
        item.id: (item.selected, item.reason) for item in items.values()
    }

    for cell in cells:
        item = items[cell["id"]]
        if "selected" in cell:
            item.selected = bool(cell["selected"])
        if "reason" in cell:
            item.reason = (cell["reason"] or "").strip()

    _cascade_selection(items.values())

    # 勾上的格子不该留着上一次的裁剪原因 —— 它会在明细表里显示成「要做，但原因是…」
    for item in items.values():
        if item.selected and item.reason:
            item.reason = ""

    changed = [
        item
        for item in items.values()
        if before[item.id] != (item.selected, item.reason)
    ]
    if changed:
        ReviewTailoringItem.objects.bulk_update(
            changed, ["selected", "reason", "updated_at"], batch_size=500
        )
        for item in changed:
            old_selected, old_reason = before[item.id]
            if old_selected != item.selected:
                _write_activity(
                    tailoring,
                    actor=actor,
                    verb="updated",
                    field="cell_selected",
                    old_value=old_selected,
                    new_value=item.selected,
                    extra={
                        "item_id": str(item.id),
                        "product_id": str(item.product_id),
                        "template_id": str(item.template_id),
                        "title": item.title,
                    },
                )
            elif old_reason != item.reason:
                _write_activity(
                    tailoring,
                    actor=actor,
                    verb="updated",
                    field="cell_reason",
                    old_value=old_reason,
                    new_value=item.reason,
                    extra={
                        "item_id": str(item.id),
                        "product_id": str(item.product_id),
                        "template_id": str(item.template_id),
                        "title": item.title,
                    },
                )
    return list(items.values())


def _cascade_selection(items):
    """父子联动，就地改 ``selected``。

    只处理「有父」的活动格子：没有父的活动直接挂在阶段下（有些阶段没有汇总评审），
    它自己就是顶层，无从联动。
    """
    by_key = {(item.product_id, item.template_id): item for item in items}
    for item in items:
        parent_template_id = item.template.parent_id
        if not parent_template_id:
            continue
        parent = by_key.get((item.product_id, parent_template_id))
        if parent is None:
            continue
        if item.selected and not parent.selected:
            # 勾了活动就必须做它所属的评审
            parent.selected = True
            parent.reason = ""
    # 第二遍：父被取消的，子一律取消（顺序不能反，否则刚被子勾起来的父又被清掉）
    for item in items:
        parent_template_id = item.template.parent_id
        if not parent_template_id:
            continue
        parent = by_key.get((item.product_id, parent_template_id))
        if parent is not None and not parent.selected and item.selected:
            item.selected = False


def update_header(*, tailoring, title=None, description_html=None, actor):
    """改标题与描述。

    表头是元数据，**不走签批也不进生效快照** —— 把标题写错了不该逼人重走一轮签批。
    签批中也允许改，唯一的例外是没有的。
    """
    changed = []
    if title is not None and title != tailoring.title:
        _write_activity(
            tailoring,
            actor=actor,
            verb="updated",
            field="title",
            old_value=tailoring.title,
            new_value=title,
        )
        tailoring.title = title
        changed.append("title")
    if description_html is not None and description_html != tailoring.description_html:
        _write_activity(
            tailoring, actor=actor, verb="updated", field="description"
        )
        tailoring.description_html = description_html or None
        changed.append("description_html")
    if changed:
        tailoring.updated_by = actor
        changed += ["updated_at", "updated_by"]
        tailoring.save(update_fields=changed)
    return tailoring


# --- 签批 -----------------------------------------------------------------


def _validate_before_submit(tailoring):
    """提交签批前的四道闸门，一次全查完再抛，别让人改一处提一次。"""
    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring).select_related(
            "template", "stage_review"
        )
    )
    if not items:
        raise ReviewTailoringError(
            "This tailoring has no cells to submit.",
            code="REVIEW_TAILORING_EMPTY",
        )

    # 1. 未勾选的必须写裁剪原因 —— 这是整张表存在的意义：裁掉要有理由
    missing_reason = [
        {"item_id": str(item.id), "title": item.title}
        for item in items
        if not item.selected and not item.reason.strip()
    ]
    if missing_reason:
        raise ReviewTailoringError(
            "Every tailored-out review needs a reason.",
            code="REVIEW_TAILORING_REASON_REQUIRED",
            detail={"items": missing_reason},
        )

    by_key = {(item.product_id, item.template_id): item for item in items}

    # 2. 勾了活动就必须勾它所属的评审（save_cells 会自动收敛，这里防的是绕过它的写入）
    orphan = [
        {"item_id": str(item.id), "title": item.title}
        for item in items
        if item.selected
        and item.template.parent_id
        and not getattr(
            by_key.get((item.product_id, item.template.parent_id)), "selected", False
        )
    ]
    if orphan:
        raise ReviewTailoringError(
            "A selected review activity requires its parent review to be selected.",
            code="REVIEW_TAILORING_PARENT_REQUIRED",
            detail={"items": orphan},
        )

    # 3. 新勾的格子，模板不能是停用/已删的
    disabled = [
        {"item_id": str(item.id), "title": item.title}
        for item in items
        if item.selected
        and item.stage_review_id is None
        and (item.template.is_active is False or item.template.deleted_at is not None)
    ]
    if disabled:
        raise ReviewTailoringError(
            "Some selected reviews come from a disabled template.",
            code="REVIEW_TAILORING_TEMPLATE_DISABLED",
            detail={"items": disabled},
        )

    # 4. 要删的评审里不能有已评审完的 —— 已完成的评审是既成记录，不能被一次裁剪抹掉
    to_delete_ids = [
        item.stage_review_id
        for item in items
        if not item.selected and item.stage_review_id
    ]
    if to_delete_ids:
        completed = list(
            StageReview.objects.filter(
                Q(id__in=to_delete_ids) | Q(parent_id__in=to_delete_ids),
                status=StageReviewStatus.COMPLETED,
            ).values("id", "title")
        )
        if completed:
            raise ReviewTailoringError(
                "Completed reviews cannot be tailored out.",
                code="REVIEW_TAILORING_REVIEW_COMPLETED",
                detail={
                    "reviews": [
                        {"id": str(row["id"]), "title": row["title"]}
                        for row in completed
                    ]
                },
            )
    return items


def _has_changes(tailoring, items):
    """修订提交时，与生效快照比一比有没有实际改动。"""
    snapshot = tailoring.effective_snapshot or {}
    if not snapshot:
        return True
    for item in items:
        recorded = snapshot.get(str(item.id))
        if recorded is None:
            return True
        if bool(recorded.get("selected")) != item.selected:
            return True
        if (recorded.get("reason") or "") != item.reason:
            return True
    # 快照里有、现在没有的格子（被 sync_items 删掉的列）也算改动
    return len(snapshot) != len(items)


def _validate_approvers(project_id, workspace_id, approver_ids):
    """签批人必须是本项目的活跃成员。复用需求审批那套资格查询，口径保持一致。"""
    eligible = get_requirement_eligible_user_ids(
        workspace_id=workspace_id,
        user_ids=approver_ids,
        project_id=project_id,
    )
    invalid = [str(uid) for uid in approver_ids if uid not in eligible]
    if invalid:
        raise ReviewTailoringError(
            "Approvers must be active members of this project.",
            code="REVIEW_TAILORING_APPROVER_INVALID",
            detail={"approver_ids": invalid},
        )


def submit_for_approval(
    *, tailoring, approver_ids, approval_type, required_count, actor
):
    """提交签批：定这一轮的签批人与通过规则，表进入 pending。

    规则与名单**只对这一轮有效**，每轮 ``round += 1`` 重新建一批签批行；历史轮次的
    行原样留着当审计线索（口径同需求变更单，只是那边一张单只提交一次，这边可以反复）。
    """
    _require_status(
        tailoring,
        EDITABLE_STATUSES,
        code="REVIEW_TAILORING_NOT_EDITABLE",
        message="Only a draft or revising tailoring can be submitted.",
    )

    items = _validate_before_submit(tailoring)
    if tailoring.status == ReviewTailoringStatus.REVISING and not _has_changes(
        tailoring, items
    ):
        raise ReviewTailoringError(
            "Nothing changed since the tailoring took effect.",
            code="REVIEW_TAILORING_NO_CHANGES",
        )

    approver_ids = list(dict.fromkeys(approver_ids))
    _validate_approvers(tailoring.project_id, tailoring.workspace_id, approver_ids)

    next_round = tailoring.round + 1
    ReviewTailoringApproval.objects.bulk_create(
        [
            ReviewTailoringApproval(
                tailoring=tailoring,
                approver_id=approver_id,
                round=next_round,
                created_by=actor,
                updated_by=actor,
            )
            for approver_id in approver_ids
        ]
    )

    tailoring.round = next_round
    tailoring.approval_type = approval_type
    tailoring.required_count = (
        required_count
        if approval_type == ReviewTailoringApprovalType.N_OF_M
        else None
    )
    tailoring.status = ReviewTailoringStatus.PENDING
    tailoring.submitted_by = actor
    tailoring.submitted_at = timezone.now()
    tailoring.updated_by = actor
    tailoring.save(
        update_fields=[
            "round",
            "approval_type",
            "required_count",
            "status",
            "submitted_by",
            "submitted_at",
            "updated_at",
            "updated_by",
        ]
    )
    _write_activity(
        tailoring,
        actor=actor,
        verb="submitted",
        field="status",
        old_value=ReviewTailoringStatus.DRAFT,
        new_value=ReviewTailoringStatus.PENDING,
        extra={
            "round": next_round,
            "approval_type": approval_type,
            "required_count": tailoring.required_count,
            "approver_ids": [str(uid) for uid in approver_ids],
        },
    )

    from plane.utils.review_tailoring_notification import notify_approval_requested

    notify_approval_requested(tailoring, actor=actor)
    return tailoring


def _is_approved(tailoring, approved_count, total_count):
    """通过规则判定。与 ``requirement_change.py::_is_approved`` 同一套算法。"""
    if tailoring.approval_type == ReviewTailoringApprovalType.ALL:
        return approved_count >= total_count
    if tailoring.approval_type == ReviewTailoringApprovalType.N_OF_M:
        return approved_count >= (tailoring.required_count or total_count)
    return approved_count >= 1


def act_on_tailoring(*, tailoring, approver, action, comment=""):
    """签批人表态。任一驳回立即退回，通过则按规则判定是否生效。"""
    _require_status(
        tailoring,
        (ReviewTailoringStatus.PENDING,),
        code="REVIEW_TAILORING_NOT_PENDING",
        message="This tailoring is not waiting for approval.",
    )

    approval = ReviewTailoringApproval.objects.filter(
        tailoring=tailoring, round=tailoring.round, approver=approver
    ).first()
    if approval is None:
        raise ReviewTailoringError(
            "You are not an approver of this round.",
            code="REVIEW_TAILORING_NOT_APPROVER",
        )
    if approval.action:
        raise ReviewTailoringError(
            "You have already acted on this round.",
            code="REVIEW_TAILORING_ALREADY_ACTED",
        )

    approval.action = action
    approval.comment = comment or ""
    approval.acted_at = timezone.now()
    approval.updated_by = approver
    approval.save(
        update_fields=["action", "comment", "acted_at", "updated_at", "updated_by"]
    )

    from plane.utils.review_tailoring_notification import (
        notify_approval_rejected,
        notify_approval_approved,
    )

    if action == ReviewTailoringApprovalAction.REJECTED:
        tailoring.status = _editable_status(tailoring)
        tailoring.updated_by = approver
        tailoring.save(update_fields=["status", "updated_at", "updated_by"])
        _write_activity(
            tailoring,
            actor=approver,
            verb="rejected",
            field="status",
            old_value=ReviewTailoringStatus.PENDING,
            new_value=tailoring.status,
            comment=comment or "",
            extra={"round": tailoring.round},
        )
        notify_approval_rejected(tailoring, actor=approver)
        return tailoring, None

    approvals = list(
        ReviewTailoringApproval.objects.filter(
            tailoring=tailoring, round=tailoring.round
        )
    )
    approved_count = sum(
        1
        for item in approvals
        if item.action == ReviewTailoringApprovalAction.APPROVED
    )
    if not _is_approved(tailoring, approved_count, len(approvals)):
        _write_activity(
            tailoring,
            actor=approver,
            verb="approved",
            field="approval",
            new_value=f"{approved_count}/{len(approvals)}",
            comment=comment or "",
            extra={"round": tailoring.round, "partial": True},
        )
        return tailoring, None

    result = _apply_effective(tailoring=tailoring, actor=approver)
    notify_approval_approved(tailoring, actor=approver)
    return tailoring, result


def withdraw(*, tailoring, actor):
    """撤回签批。只有本轮提交人能撤 —— 修订的提交人未必是建表的人。"""
    _require_status(
        tailoring,
        (ReviewTailoringStatus.PENDING,),
        code="REVIEW_TAILORING_NOT_PENDING",
        message="This tailoring is not waiting for approval.",
    )
    if tailoring.submitted_by_id and tailoring.submitted_by_id != actor.id:
        raise ReviewTailoringError(
            "Only the submitter can withdraw this approval.",
            code="REVIEW_TAILORING_NOT_SUBMITTER",
        )

    tailoring.status = _editable_status(tailoring)
    tailoring.updated_by = actor
    tailoring.save(update_fields=["status", "updated_at", "updated_by"])
    _write_activity(
        tailoring,
        actor=actor,
        verb="withdrawn",
        field="status",
        old_value=ReviewTailoringStatus.PENDING,
        new_value=tailoring.status,
        extra={"round": tailoring.round},
    )

    from plane.utils.review_tailoring_notification import notify_approval_withdrawn

    notify_approval_withdrawn(tailoring, actor=actor)
    return tailoring


# --- 生效 -----------------------------------------------------------------


def _delete_stage_reviews(review_ids):
    """同步软删一批评审及其下挂的一切。

    **不能调 ``instance.delete()``** —— 它的级联是 Celery 任务，投递在事务提交之前，
    没有 worker 就永远不跑，结果是评审没了但评论、附件、指针全留着。这里一次性把
    子活动、评论、附件、反向指针都处理掉。
    """
    if not review_ids:
        return []

    all_ids = list(
        StageReview.objects.filter(
            Q(id__in=review_ids) | Q(parent_id__in=review_ids)
        )
        .select_for_update(of=("self",))
        .order_by("id")
        .values_list("id", flat=True)
    )
    if not all_ids:
        return []

    # 反向指针先置空：置空之后再删，格子上不会短暂指向一条已删的评审
    ReviewTailoringItem.objects.filter(stage_review_id__in=all_ids).update(
        stage_review=None
    )
    StageReviewActivity.objects.filter(stage_review_id__in=all_ids).delete()
    StageReviewComment.objects.filter(stage_review_id__in=all_ids).delete()
    FileAsset.objects.filter(
        Q(stage_review_id__in=all_ids)
        | Q(stage_review_comment__stage_review_id__in=all_ids)
    ).delete()
    StageReview.objects.filter(id__in=all_ids).delete()
    return all_ids


def _create_stage_reviews(tailoring, items, actor):
    """把勾上但还没生成的格子变成评审实例。

    两批 ``bulk_create``（先根后子）而不是逐条 ``save()``：``save()`` 那点传播逻辑
    （从 parent 抄 project/product/stage）在这里本来就要显式给，逐条存只是多几百次
    round trip。代价是 ``clean()`` 不跑 —— 层级与同族由模板树保证，DB 的
    ``sr_kind_parent_consistent`` 还在兜底。
    """
    pending = [item for item in items if item.selected and item.stage_review_id is None]
    if not pending:
        return []

    # 父指针来源有两处：本次新建的，和上一版就已经生成的
    review_by_key = {
        (item.product_id, item.template_id): item.stage_review_id
        for item in items
        if item.stage_review_id
    }

    roots, children = [], []
    for item in pending:
        (children if item.template.kind in ACTIVITY_KINDS and item.template.parent_id else roots).append(item)

    created_ids = []
    for batch in (roots, children):
        if not batch:
            continue
        reviews = []
        for item in batch:
            template = item.template
            parent_id = (
                review_by_key.get((item.product_id, template.parent_id))
                if template.parent_id
                else None
            )
            review = StageReview(
                workspace_id=tailoring.workspace_id,
                project_id=tailoring.project_id,
                product_id=item.product_id,
                # 阶段跟着模板节点走 —— 一张表跨全部阶段，表头上没有阶段可抄
                stage_id=template.stage_id,
                kind=template.kind,
                parent_id=parent_id,
                template=template,
                title=item.title,
                description_html=template.description_html,
                initiator_role=template.initiator_role,
                leader_role=template.leader_role,
                auditor_role=template.auditor_role,
                status=StageReviewStatus.NOT_STARTED,
                sort_order=template.sort_order,
                created_by=actor,
                updated_by=actor,
            )
            reviews.append(review)
            item.stage_review_id = review.id
            review_by_key[(item.product_id, template.id)] = review.id
            created_ids.append(review.id)
        StageReview.objects.bulk_create(reviews, batch_size=500)

    ReviewTailoringItem.objects.bulk_update(
        pending, ["stage_review", "updated_at"], batch_size=500
    )
    return created_ids


def _apply_effective(*, tailoring, actor):
    """签批通过的那一刻：把勾选状态同步成真实的评审实例。

    顺序是「先删后建」：同一格子不可能同时既删又建，但先删能让被删评审占用的资源
    尽早释放，也让活动记录读起来是「去掉了这些、加上了这些」。
    """
    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring).select_related(
            "template"
        )
    )

    to_delete = [
        item.stage_review_id
        for item in items
        if not item.selected and item.stage_review_id
    ]
    deleted_ids = _delete_stage_reviews(to_delete)
    if deleted_ids:
        # 上面按 stage_review_id 批量置空了，本地对象也要跟上
        for item in items:
            if item.stage_review_id in deleted_ids:
                item.stage_review_id = None

    created_ids = _create_stage_reviews(tailoring, items, actor)

    tailoring.effective_snapshot = {
        str(item.id): {
            "selected": item.selected,
            "reason": item.reason,
            "stage_review_id": str(item.stage_review_id)
            if item.stage_review_id
            else None,
        }
        for item in items
    }
    tailoring.revision += 1
    tailoring.approved_at = timezone.now()
    tailoring.status = ReviewTailoringStatus.APPROVED
    tailoring.updated_by = actor
    tailoring.save(
        update_fields=[
            "effective_snapshot",
            "revision",
            "approved_at",
            "status",
            "updated_at",
            "updated_by",
        ]
    )
    _write_activity(
        tailoring,
        actor=actor,
        verb="approved",
        field="status",
        old_value=ReviewTailoringStatus.PENDING,
        new_value=ReviewTailoringStatus.APPROVED,
        extra={
            "round": tailoring.round,
            "revision": tailoring.revision,
            "created_count": len(created_ids),
            "deleted_count": len(deleted_ids),
            "created_ids": [str(rid) for rid in created_ids],
            "deleted_ids": [str(rid) for rid in deleted_ids],
        },
    )
    return {"created_ids": created_ids, "deleted_ids": deleted_ids}


# --- 修订 -----------------------------------------------------------------


def start_revision(*, tailoring, actor):
    """开始修订：表回到可编辑，并把这期间新增的产品/模板补进矩阵。"""
    _require_status(
        tailoring,
        (ReviewTailoringStatus.APPROVED,),
        code="REVIEW_TAILORING_NOT_APPROVED",
        message="Only an effective tailoring can be revised.",
    )
    tailoring.status = ReviewTailoringStatus.REVISING
    tailoring.updated_by = actor
    tailoring.save(update_fields=["status", "updated_at", "updated_by"])
    sync_items(tailoring=tailoring, actor=actor)
    _write_activity(
        tailoring,
        actor=actor,
        verb="revising",
        field="status",
        old_value=ReviewTailoringStatus.APPROVED,
        new_value=ReviewTailoringStatus.REVISING,
    )
    return tailoring


def cancel_revision(*, tailoring, actor):
    """取消修订：按生效快照原样还原，表回到已生效。

    修订期间从不碰评审实例（只有 ``_apply_effective`` 会），所以还原勾选与原因就够了。
    快照之外的格子是修订期间 ``sync_items`` 补进来的，从未生效过，硬删干净 —— 下次
    再修订会重新补。
    """
    _require_status(
        tailoring,
        (ReviewTailoringStatus.REVISING,),
        code="REVIEW_TAILORING_NOT_REVISING",
        message="This tailoring is not being revised.",
    )
    snapshot = tailoring.effective_snapshot or {}
    if not snapshot:
        raise ReviewTailoringError(
            "This tailoring has no effective snapshot to restore.",
            code="REVIEW_TAILORING_NO_SNAPSHOT",
        )

    items = list(ReviewTailoringItem.objects.filter(tailoring=tailoring))
    restored, orphans = [], []
    for item in items:
        recorded = snapshot.get(str(item.id))
        if recorded is None:
            orphans.append(item.id)
            continue
        if item.selected != bool(recorded.get("selected")) or item.reason != (
            recorded.get("reason") or ""
        ):
            item.selected = bool(recorded.get("selected"))
            item.reason = recorded.get("reason") or ""
            restored.append(item)

    if restored:
        ReviewTailoringItem.objects.bulk_update(
            restored, ["selected", "reason", "updated_at"], batch_size=500
        )
    if orphans:
        ReviewTailoringItem.objects.filter(id__in=orphans).delete(soft=False)

    tailoring.status = ReviewTailoringStatus.APPROVED
    tailoring.updated_by = actor
    tailoring.save(update_fields=["status", "updated_at", "updated_by"])
    _write_activity(
        tailoring,
        actor=actor,
        verb="revision_cancelled",
        field="status",
        old_value=ReviewTailoringStatus.REVISING,
        new_value=ReviewTailoringStatus.APPROVED,
        extra={"restored": len(restored), "discarded": len(orphans)},
    )
    return tailoring


def delete_tailoring(*, tailoring):
    """删表。

    只有从未生效过的草稿能删。已生效的表是它名下那批评审的唯一来源，删了之后评审就成了
    无从解释的孤儿；要下线请走修订，把所有格子取消勾选。
    """
    if tailoring.status == ReviewTailoringStatus.PENDING:
        raise ReviewTailoringError(
            "Withdraw the approval before deleting this tailoring.",
            code="REVIEW_TAILORING_PENDING_UNDELETABLE",
        )
    if tailoring.approved_at or tailoring.revision:
        raise ReviewTailoringError(
            "An effective tailoring cannot be deleted.",
            code="REVIEW_TAILORING_EFFECTIVE_UNDELETABLE",
        )
    tailoring.delete()
