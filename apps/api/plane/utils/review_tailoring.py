"""评审裁剪的领域编排：建表 → 勾选 → 签批 → 生效 → 修订。

一句话讲清这套东西在做什么：**裁剪表是「产品 × 模式阶段 × 评审模板节点」的勾选矩阵，
签批通过的那一刻，把勾选状态同步成一批真实的评审实例（``StageReview``）。**

**两个轴都是人挑出来的**：横轴 ``ReviewTailoringProduct``、纵轴 ``ReviewTailoringTemplate``
（评审与评审活动各占一行、各自独立挑选，可以只挑某个活动而不挑它所属的评审），格子是
两者的交叉积。没进轴的评审压根不出现
在表里，也就不必为它写裁剪原因 —— 全量铺开时「凡是没勾的都要写理由」才是真正劝退人的
地方。所以建表只要一个标题，建出来是一张零行零列的空表。

**纵轴是二元的**：``ReviewTailoringTemplate`` 只记「要裁哪些模板节点」，真正的行由
``axis_rows()`` 按**本项目研发模式的阶段**展开 —— 节点在哪几个阶段下被勾选，就在表上占
几行（``TailoringRow`` = 模式阶段 × 模板节点）。同一模式里两个阶段指向同一个阶段类型
（o-1、o-2）时，同一个节点各占一行、各自勾选、各自生成实例，互不影响。

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

from collections import defaultdict
from dataclasses import dataclass

from django.db.models import Count, Q
from django.utils import timezone

from plane.db.models import (
    DevModeStage,
    DevModeStageTemplate,
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


def _axis_template_ids(tailoring):
    """纵轴上的模板节点 id（评审或评审活动，各自独立）。"""
    return list(
        ReviewTailoringTemplate.objects.filter(tailoring=tailoring).values_list(
            "template_id", flat=True
        )
    )


@dataclass(frozen=True)
class TailoringRow:
    """纵轴展开后的一行：**模式阶段 × 模板节点**。

    序列化器直接吃这个对象（``ReviewTailoringRowSerializer``），所以属性名就是前端契约。
    """

    stage: DevModeStage
    template: StageReviewTemplate
    #: 只有「挪进来才有的行」才有值：这一行的格子全是从别的阶段挪过来的（见 ``detail_rows``）
    origin_stage: DevModeStage | None = None

    @property
    def key(self):
        return (self.stage_id, self.template_id)

    @property
    def stage_id(self):
        return self.stage.id

    @property
    def template_id(self):
        return self.template.id


def project_stages(project_id):
    """项目研发模式的阶段，按模式里的拖拽顺序。这就是裁剪表与评审列表的阶段顺序。"""
    return list(
        DevModeStage.objects.filter(dev_mode__projects__id=project_id)
        .select_related("stage_type")
        .order_by("sort_order", "created_at", "id")
    )


def stage_template_ids(stages):
    """{阶段 id: 该阶段勾选的模板节点 id 集合}。模式里没勾的节点不进裁剪表。"""
    selected = defaultdict(set)
    if not stages:
        return selected
    for stage_id, template_id in DevModeStageTemplate.objects.filter(
        dev_mode_stage_id__in=[stage.id for stage in stages]
    ).values_list("dev_mode_stage_id", "template_id"):
        selected[stage_id].add(template_id)
    return selected


def _expand_rows(project_id, template_ids):
    """把纵轴上的模板 id 展开成真正要铺的行：**模式阶段 × 该阶段勾选的启用节点**。

    评审与活动各自独立挑选 —— 只挑了活动就只有活动那一行，挑了评审也不会连带它的活动。
    一个节点在模式里被两个同类型阶段都勾上，就展开成两行。

    行序 = 阶段的 ``sort_order`` → 节点的 ``sort_order``。阶段这一层的顺序由模式决定，
    不再看阶段类型的顺序：同类型的 o-1、o-2 靠模式里的拖拽分先后。
    """
    template_ids = list(template_ids)
    if not template_ids:
        return []
    templates = {
        template.id: template
        for template in StageReviewTemplate.objects.filter(
            id__in=template_ids, is_active=True
        ).select_related("stage")
    }
    if not templates:
        return []
    stages = project_stages(project_id)
    selected_by_stage = stage_template_ids(stages)

    rows = []
    for stage in stages:
        picked = [
            template
            for tid, template in templates.items()
            if tid in selected_by_stage.get(stage.id, ())
        ]
        picked.sort(key=lambda t: (t.sort_order, t.created_at, str(t.id)))
        rows.extend(TailoringRow(stage=stage, template=template) for template in picked)
    return rows


def axis_rows(tailoring):
    """纵轴当前展开出来的全部行。视图组装详情时也用它 —— 零产品的表要靠它画出行。"""
    return _expand_rows(tailoring.project_id, _axis_template_ids(tailoring))


def detail_rows(tailoring, items):
    """详情要画的行 = 纵轴展开的行 + 「格子挪进来才有的行」。

    评审活动挪到一个模式里没勾它的阶段后，(目标阶段, 节点) 不在 ``axis_rows`` 里 —— 不补
    上这一行，挪过去的格子在矩阵上就没地方落。补出来的行带 ``origin_stage``（取这一行里
    格子的原阶段），前端据此画「自 X」徽章。行序与纵轴一致：阶段顺序 → 节点顺序。
    """
    rows = axis_rows(tailoring)
    known = {row.key for row in rows}
    extra = {}
    for item in items:
        key = (item.stage_id, item.template_id)
        if key in known:
            continue
        row = extra.get(key)
        if row is None or (row.origin_stage is None and item.origin_stage_id):
            extra[key] = TailoringRow(
                stage=item.stage,
                template=item.template,
                origin_stage=item.origin_stage if item.origin_stage_id else None,
            )
    if not extra:
        return rows
    return sorted(
        [*rows, *extra.values()],
        key=lambda row: (
            row.stage.sort_order,
            str(row.stage.created_at),
            str(row.stage.id),
            row.template.sort_order,
            str(row.template.created_at),
            str(row.template.id),
        ),
    )


def _build_items(tailoring, rows, product_ids, actor):
    """按 (产品 × 行) 铺格子。新格子默认「保留」—— 挑进表里的评审默认是要做的，
    裁掉才需要人去点、去写原因。

    ``bulk_create`` 绕过 ``save()``，所以 ``title`` 快照与 ``created_by`` 都要显式给
    （``ReviewTailoringItem.save()`` 本来负责补 title）。
    """
    return [
        ReviewTailoringItem(
            tailoring=tailoring,
            product_id=product_id,
            stage=row.stage,
            template=row.template,
            title=row.template.title,
            selected=True,
            reason="",
            created_by=actor,
            updated_by=actor,
        )
        for product_id in product_ids
        for row in rows
    ]


# --- 建表与格子维护 --------------------------------------------------------


def create_tailoring(*, project, title, description_html, actor):
    """新建一张裁剪表。**只建表头，一个格子都不铺。**

    矩阵是「产品 × 模式阶段 × 模板节点」，而产品这一维在建表这一刻还不知道 —— 由人在
    详情页逐列添加（``add_products``）。所以新表是一张零列的空表，纵轴要等第一列产品
    进来才显形。

    项目的研发模式一个阶段都没有（Scrum 就是这样）时直接拒绝：纵轴永远展不开，建出来
    也只是一张永远空着的表。这类模式本来也关掉了评审组件，走到这里说明是自定义模式开了
    评审却没配阶段。
    """
    if not project_stages(project.id):
        raise ReviewTailoringError(
            "The project's development mode has no stages.",
            code="REVIEW_TAILORING_MODE_HAS_NO_STAGE",
            detail={"dev_mode_id": str(project.dev_mode_id)},
        )
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
    rows = axis_rows(tailoring)
    if rows:
        ReviewTailoringItem.objects.bulk_create(
            _build_items(tailoring, rows, fresh, actor), batch_size=500
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
    """给纵轴加几个模板节点，并按当前横轴把展开出来的行铺满格子。

    挑了评审不会连带它的活动，只挑某个活动也不必挑它所属的评审 —— 跟本项目无关的节点
    根本不进表，也就不用为它编裁剪理由。

    **传的是模板节点 id，不是行**：一个节点在项目模式里被几个阶段勾选，服务端就展开成
    几行。一个阶段都没勾它的节点直接拒绝 —— 模式的勾选是硬边界，不能靠接口绕过去。
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

    # 模式的勾选是硬边界：项目模式里没有任何阶段勾过的节点不许进表
    stages = project_stages(tailoring.project_id)
    selectable = set()
    for picked in stage_template_ids(stages).values():
        selectable |= picked
    unselected = [tid for tid in template_ids if tid not in selectable]
    if unselected:
        raise ReviewTailoringError(
            "Some reviews are not enabled by the project's development mode.",
            code="REVIEW_TAILORING_TEMPLATE_NOT_IN_MODE",
            detail={
                "template_ids": [str(tid) for tid in unselected],
                "titles": [candidates[tid].title for tid in unselected],
            },
        )

    existing = set(_axis_template_ids(tailoring))
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
            _build_items(
                tailoring,
                _expand_rows(tailoring.project_id, fresh),
                product_ids,
                actor,
            ),
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
    """移除纵轴的一行。只移这一个节点 —— 评审与活动各自独立，移评审不会带走它的活动。"""
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

    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring, template_id=template_id)
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
    """把格子对齐「当前横轴 × 当前纵轴展开出来的行」。

    开始修订时跑一次：这期间模板库可能停用了表上的某个评审或活动，模式里也可能加了阶段。

    顺带收一下轴自己的烂摊子：产品被解除了与本项目的关联、评审节点被停用或删除，那一
    行 / 那一列就不该继续留在表上。

    删的分寸有两条：

    1. 只删还没生成过评审的格子 —— 已经生成的评审是既成事实，产品被解除关联不该让它凭空
       消失，那属于评审自己的生命周期。
    2. **模式里取消勾选某个节点，不删已有的格子**，只是新建的裁剪表看不到它。和「评审树
       停用节点」的现有处理一致：已经在表上的行留着，免得一次模式调整把在办的裁剪表改得
       面目全非。所以 stale 只认「模板节点被停用 / 被移出纵轴」和「产品掉出横轴」，不认
       「(阶段, 节点) 组合不在当前行集合里」。
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

    live_template_ids = set(
        StageReviewTemplate.objects.filter(
            id__in=_axis_template_ids(tailoring), is_active=True
        ).values_list("id", flat=True)
    )
    generated_templates = {item.template_id for item in items if item.stage_review_id}
    stale_rows = [
        row
        for row in ReviewTailoringTemplate.objects.filter(tailoring=tailoring)
        if row.template_id not in live_template_ids
        and row.template_id not in generated_templates
    ]
    if stale_rows:
        ReviewTailoringTemplate.objects.filter(
            id__in=[row.id for row in stale_rows]
        ).delete(soft=False)

    # 2. 再按收拾干净的两个轴对齐格子
    product_ids = _axis_product_ids(tailoring)
    rows = axis_rows(tailoring)
    live_axis_template_ids = set(
        StageReviewTemplate.objects.filter(
            id__in=_axis_template_ids(tailoring), is_active=True
        ).values_list("id", flat=True)
    )
    product_id_set = set(product_ids)
    present = {(item.product_id, item.stage_id, item.template_id) for item in items}
    # 挪走的活动在原处留的是空位，不是缺格子 —— 补回去生效时就会多生成一条重复的评审
    present |= {
        (item.product_id, item.origin_stage_id, item.template_id)
        for item in items
        if item.origin_stage_id
    }

    missing = [
        item
        for item in _build_items(tailoring, rows, product_ids, actor)
        if (item.product_id, item.stage_id, item.template_id) not in present
    ]
    if missing:
        ReviewTailoringItem.objects.bulk_create(missing, batch_size=500)

    # 掉出两个轴、且从没生成过评审的格子 → 硬删干净。硬删是因为它从未生效过，留着只会
    # 让矩阵多出一行 / 一列读不懂的东西。
    # 判据只看「产品还在不在横轴」「模板节点还在不在纵轴且启用」，不看阶段 —— 模式里取消
    # 勾选造成的「行不在当前行集合里」要保留（见 docstring 第 2 条）。
    stale = [
        item
        for item in items
        if item.stage_review_id is None
        and (
            item.product_id not in product_id_set
            or item.template_id not in live_axis_template_ids
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
    """保存勾选与裁剪原因。

    评审与评审活动各自独立、互不带动（产品决策）：裁掉评审不会连带裁掉它的活动，保留活动
    也不会把评审拉回来。

    草稿态允许原因留空 —— 逼着边勾边写会让人没法先把矩阵勾完。缺原因在提交签批时才拦。

    格子带 ``stage_id`` 就是把评审活动挪到另一个模式阶段（``_move_cells``）：改的是同一个
    格子的阶段，勾选与原因原样保留。已生效的表在修订里挪，实例要等签批生效才跟着挪。
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
        ).select_related("template", "stage", "origin_stage", "stage_review")
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

    moved = _move_cells(tailoring, items, cells, actor)

    for cell in cells:
        item = items[cell["id"]]
        if "selected" in cell:
            item.selected = bool(cell["selected"])
        if "reason" in cell:
            item.reason = (cell["reason"] or "").strip()

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
                        "stage_id": str(item.stage_id),
                        "stage_label": item.stage.name,
                        "template_id": str(item.template_id),
                        "title": item.title,
                        # 裁掉时原因往往同一次保存里写，这条记录不会再单独记原因
                        "reason": "" if item.selected else item.reason,
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
                        "stage_id": str(item.stage_id),
                        "stage_label": item.stage.name,
                        "template_id": str(item.template_id),
                        "title": item.title,
                    },
                )
    if moved:
        ReviewTailoringItem.objects.bulk_update(
            moved, ["stage", "origin_stage", "updated_at"], batch_size=500
        )
    return list(items.values())


def _move_cells(tailoring, items, cells, actor):
    """处理 ``save_cells`` 里带 ``stage_id`` 的格子：就地改阶段，返回挪了的格子（未落库）。

    规则一次全查完再抛，别让人改一处提一次：

    - 只有评审活动能挪，汇总评审一挪，它下面的活动就留在原阶段没了归属。
    - 目标阶段必须是本项目研发模式的阶段（不限阶段类型）。
    - 已评审的活动不能挪 —— 已评审即定稿。签批前才评审完的，生效时跳过（``_apply_effective``）。
    - 目标阶段已经有同一（产品 × 节点）的格子（o-1、o-2 都勾了它）→ 409。按挪完之后的
      整张表查，不靠数据库唯一约束报错。

    ``origin_stage`` 记「纵轴上本来那一格」：第一次挪走时记下原阶段，再挪不变，挪回原处清空。
    """
    requests = {
        cell["id"]: cell["stage_id"]
        for cell in cells
        if cell.get("stage_id") and cell["stage_id"] != items[cell["id"]].stage_id
    }
    if not requests:
        return []

    stages = {stage.id: stage for stage in project_stages(tailoring.project_id)}
    not_activity, not_in_mode, completed = [], [], []
    for item_id, stage_id in requests.items():
        item = items[item_id]
        if item.template.kind not in ACTIVITY_KINDS:
            not_activity.append({"item_id": str(item.id), "title": item.title})
        elif stage_id not in stages:
            not_in_mode.append({"item_id": str(item.id), "stage_id": str(stage_id)})
        elif (
            item.stage_review_id
            and item.stage_review.status == StageReviewStatus.COMPLETED
        ):
            completed.append({"item_id": str(item.id), "title": item.title})
    if not_activity:
        raise ReviewTailoringError(
            "Only review activities can move to another stage.",
            code="REVIEW_TAILORING_ONLY_ACTIVITY_CAN_MOVE",
            detail={"items": not_activity},
        )
    if not_in_mode:
        raise ReviewTailoringError(
            "The target stage is not in the project's development mode.",
            code="REVIEW_TAILORING_STAGE_NOT_IN_MODE",
            detail={"items": not_in_mode},
        )
    if completed:
        raise ReviewTailoringError(
            "Reviewed activities cannot move to another stage.",
            code="REVIEW_TAILORING_MOVE_COMPLETED",
            detail={"items": completed},
        )

    final_key = {
        item.id: (
            item.product_id,
            requests.get(item.id, item.stage_id),
            item.template_id,
        )
        for item in items.values()
    }
    taken = defaultdict(list)
    for item_id, key in final_key.items():
        taken[key].append(item_id)
    conflicts = [
        {"item_id": str(item_id), "title": items[item_id].title}
        for item_id in requests
        if len(taken[final_key[item_id]]) > 1
    ]
    if conflicts:
        raise ReviewTailoringError(
            "The target stage already has the same activity for this product.",
            code="REVIEW_TAILORING_MOVE_CONFLICT",
            detail={"items": conflicts},
        )

    moved = []
    for item_id, stage_id in requests.items():
        item = items[item_id]
        old_stage = item.stage
        home_id = item.origin_stage_id or item.stage_id
        item.stage = stages[stage_id]
        item.origin_stage = None if stage_id == home_id else stages.get(home_id)
        # 原阶段已被删（SET_NULL 语义）时 stages.get 取不到，按原处在新阶段处理
        moved.append(item)
        _write_activity(
            tailoring,
            actor=actor,
            verb="updated",
            field="cell_stage",
            old_value=old_stage.name,
            new_value=item.stage.name,
            extra={
                "item_id": str(item.id),
                "product_id": str(item.product_id),
                "stage_id": str(item.stage_id),
                "stage_label": item.stage.name,
                "old_stage_id": str(old_stage.id),
                "old_stage_label": old_stage.name,
                "template_id": str(item.template_id),
                "title": item.title,
            },
        )
    return moved


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
    """提交签批前的三道闸门，一次全查完再抛，别让人改一处提一次。"""
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

    # 2. 新勾的格子，模板不能是停用/已删的
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

    # 已评审的评审也允许裁掉：已评审即定稿、不能退回，这是定稿后唯一的纠错出口。
    # 前端在取消勾选与提交签批时提示「会连同轨迹、评论、附件一起删除」
    return items


def _snapshot_stage(recorded, item):
    """格子生效时所在的阶段（字符串 id）。

    批次 5 之前的快照没记阶段：那时还不能挪，生效时的阶段就是格子的「原处」——
    挪过的取 ``origin_stage``，没挪过的就是现在的阶段。
    """
    if "stage_id" in recorded:
        return recorded["stage_id"]
    return str(item.origin_stage_id or item.stage_id)


def _snapshot_origin(recorded):
    """格子生效时的 ``origin_stage``（字符串 id 或 None），旧快照一律为 None。"""
    return recorded.get("origin_stage_id")


def _changed_cell_count(snapshot, items):
    """与生效快照相比改动了几个格子：勾选、原因或阶段变了、快照里没有（新补进来）、
    快照里有但现在没了（被移除的行列）都各算一格。"""
    changed = 0
    current_ids = set()
    for item in items:
        current_ids.add(str(item.id))
        recorded = snapshot.get(str(item.id))
        if (
            recorded is None
            or bool(recorded.get("selected")) != item.selected
            or (recorded.get("reason") or "") != item.reason
            or _snapshot_stage(recorded, item) != str(item.stage_id)
        ):
            changed += 1
    return changed + sum(1 for key in snapshot if key not in current_ids)


def attach_effective_stage(tailoring, items):
    """给每个格子挂上生效快照里的阶段（``effective_stage_id``），就地写到对象上。

    前端拿它和本地（含未保存）的阶段比，头部「移动 N」、格子改动数才跟得上手上的改动。
    没有快照（从未生效）或快照里没有这一格（修订期间补进来的）为 None。
    """
    snapshot = tailoring.effective_snapshot or {}
    for item in items:
        recorded = snapshot.get(str(item.id))
        item.effective_stage_id = _snapshot_stage(recorded, item) if recorded else None
    return items


def revision_changes(tailoring, items):
    """修订相对生效快照的逐条改动，签批弹窗的「改动明细」读它。

    三类：``add``（生效后会新建评审）、``cancel``（会删掉评审）、``move``（换了阶段）。
    同一格既取消又挪了只记取消 —— 评审都要删了，挪不挪没有意义。挪的是已评审的活动时
    ``will_skip``：签批生效时会被跳过（见 ``_apply_effective``）。没有快照（从未生效）
    返回空列表：头一次签批的全部格子都是「新增」，列出来没有信息量。
    """
    snapshot = tailoring.effective_snapshot or {}
    if not snapshot or tailoring.status not in (
        ReviewTailoringStatus.REVISING,
        ReviewTailoringStatus.PENDING,
    ):
        return []

    stage_names = {
        str(stage.id): stage.name for stage in project_stages(tailoring.project_id)
    }
    changes = []
    for item in items:
        recorded = snapshot.get(str(item.id))
        base = {
            "item_id": str(item.id),
            "product_id": str(item.product_id),
            "template_id": str(item.template_id),
            "title": item.title,
            "stage_id": str(item.stage_id),
            "stage_label": item.stage.name,
        }
        if recorded is None:
            if item.selected:
                changes.append({**base, "type": "add"})
            continue
        was_selected = bool(recorded.get("selected"))
        if item.selected and not was_selected:
            changes.append({**base, "type": "add"})
        elif was_selected and not item.selected:
            changes.append({**base, "type": "cancel"})
            continue
        old_stage = _snapshot_stage(recorded, item)
        if old_stage != str(item.stage_id):
            changes.append(
                {
                    **base,
                    "type": "move",
                    "old_stage_id": old_stage,
                    "old_stage_label": stage_names.get(old_stage, ""),
                    "will_skip": bool(
                        item.stage_review_id
                        and item.stage_review.status == StageReviewStatus.COMPLETED
                    ),
                }
            )
    return changes


def last_skipped_moves(tailoring):
    """最近一次生效时被跳过的移动（已评审的活动）。详情页横幅读它；非已生效态不给。"""
    if tailoring.status != ReviewTailoringStatus.APPROVED:
        return []
    activity = (
        ReviewTailoringActivity.objects.filter(
            tailoring=tailoring, verb="approved", field="status"
        )
        .order_by("-created_at")
        .first()
    )
    return (activity.extra or {}).get("skipped", []) if activity else []


def _has_changes(tailoring, items):
    """修订提交时，与生效快照比一比有没有实际改动。"""
    snapshot = tailoring.effective_snapshot or {}
    if not snapshot:
        return True
    return _changed_cell_count(snapshot, items) > 0


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

    result = _apply_effective(tailoring=tailoring, actor=approver, comment=comment)
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


def _delete_stage_reviews(review_ids, keep_ids=()):
    """同步软删一批评审及其下挂的一切。

    **不能调 ``instance.delete()``** —— 它的级联是 Celery 任务，投递在事务提交之前，
    没有 worker 就永远不跑，结果是评审没了但评论、附件、指针全留着。这里一次性把
    子活动、评论、附件、反向指针都处理掉。

    评审与评审活动各自独立：父评审被裁掉、活动还保留着的，活动评审不删，只断开父子变成
    独立的活动评审，免得它的轨迹、评论、附件跟着父评审一起没了。``keep_ids`` 是还保留着的评审。
    """
    if not review_ids:
        return []

    keep_ids = set(keep_ids)
    if keep_ids:
        StageReview.objects.filter(parent_id__in=review_ids, id__in=keep_ids).update(
            parent=None
        )

    all_ids = list(
        StageReview.objects.filter(
            Q(id__in=review_ids) | (Q(parent_id__in=review_ids) & ~Q(id__in=keep_ids))
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

    **实例的阶段取格子的 ``stage``，不是模板节点的阶段类型**：同一个节点在 o-1、o-2 下
    各有一个格子，生成的是两条落在不同阶段的评审。父子指针也因此要按 (产品, 阶段, 节点)
    三元组找 —— 只按 (产品, 节点) 会让 o-2 的活动认到 o-1 的父评审上去。
    """
    pending = [item for item in items if item.selected and item.stage_review_id is None]
    if not pending:
        return []

    # 父指针来源有两处：本次新建的，和上一版就已经生成的
    review_by_key = {
        (item.product_id, item.stage_id, item.template_id): item.stage_review_id
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
            # 父子必须落在同一个模式阶段：o-2 的活动只认 o-2 的那条父评审。
            # 挪过阶段的活动不挂父评审 —— 挪走就是脱离原父评审，目标阶段碰巧也有同一个
            # 父节点（o-1 → o-2）也不认
            parent_id = (
                review_by_key.get(
                    (item.product_id, item.stage_id, template.parent_id)
                )
                if template.parent_id and not item.origin_stage_id
                else None
            )
            review = StageReview(
                workspace_id=tailoring.workspace_id,
                project_id=tailoring.project_id,
                product_id=item.product_id,
                # 阶段跟着格子走，不是跟着模板节点的阶段类型
                stage_id=item.stage_id,
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
            review_by_key[(item.product_id, item.stage_id, template.id)] = review.id
            created_ids.append(review.id)
        StageReview.objects.bulk_create(reviews, batch_size=500)

    ReviewTailoringItem.objects.bulk_update(
        pending, ["stage_review", "updated_at"], batch_size=500
    )
    return created_ids


def _apply_effective(*, tailoring, actor, comment=""):
    """签批通过的那一刻：把勾选状态同步成真实的评审实例。

    顺序是「先删后建」：同一格子不可能同时既删又建，但先删能让被删评审占用的资源
    尽早释放，也让活动记录读起来是「去掉了这些、加上了这些」。
    """
    items = list(
        ReviewTailoringItem.objects.filter(tailoring=tailoring).select_related(
            "template", "stage"
        )
    )

    to_delete = [
        item.stage_review_id
        for item in items
        if not item.selected and item.stage_review_id
    ]
    # 还保留着的评审（多为父评审被裁、自己保留着的活动）不能被连带删掉
    keep_ids = {
        item.stage_review_id for item in items if item.selected and item.stage_review_id
    }
    deleted_ids = _delete_stage_reviews(to_delete, keep_ids)
    if deleted_ids:
        # 上面按 stage_review_id 批量置空了，本地对象也要跟上
        for item in items:
            if item.stage_review_id in deleted_ids:
                item.stage_review_id = None

    moved_ids, skipped = _move_stage_reviews(tailoring, items, actor)
    created_ids = _create_stage_reviews(tailoring, items, actor)

    tailoring.effective_snapshot = {
        str(item.id): {
            "selected": item.selected,
            "reason": item.reason,
            "stage_id": str(item.stage_id),
            "origin_stage_id": str(item.origin_stage_id)
            if item.origin_stage_id
            else None,
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
        comment=comment or "",
        extra={
            "round": tailoring.round,
            "revision": tailoring.revision,
            "created_count": len(created_ids),
            "deleted_count": len(deleted_ids),
            "moved_count": len(moved_ids),
            "created_ids": [str(rid) for rid in created_ids],
            "deleted_ids": [str(rid) for rid in deleted_ids],
            "moved_ids": [str(rid) for rid in moved_ids],
            "skipped": skipped,
        },
    )
    return {
        "created_ids": created_ids,
        "deleted_ids": deleted_ids,
        "moved_ids": moved_ids,
        "skipped": skipped,
    }


def _move_stage_reviews(tailoring, items, actor):
    """把修订里挪过阶段的格子对应的评审实例挪过去。返回 ``(挪了的评审 id, 跳过的明细)``。

    判据是「格子的阶段 ≠ 它的评审实例的阶段」，不看快照 —— 老快照没记阶段也判得准。
    只处理还保留着的格子（取消勾选的那条已经在前面删掉了）。

    **部分成功**：签批期间评审完了的活动跳过 —— 格子退回实例所在的阶段，实例不动，其余照挪。
    跳过的明细写进生效活动的 ``extra.skipped``，详情页横幅与变更历史都读那一份。
    """
    candidates = [
        item for item in items if item.selected and item.stage_review_id
    ]
    if not candidates:
        return [], []
    reviews = {
        review.id: review
        for review in StageReview.objects.filter(
            id__in=[item.stage_review_id for item in candidates]
        ).select_related("stage")
    }
    snapshot = tailoring.effective_snapshot or {}

    from plane.utils.stage_review import move_review_stage

    moved_ids, skipped, reverted = [], [], []
    for item in candidates:
        review = reviews.get(item.stage_review_id)
        if review is None or review.stage_id == item.stage_id:
            continue
        if review.status == StageReviewStatus.COMPLETED:
            skipped.append(
                {
                    "item_id": str(item.id),
                    "product_id": str(item.product_id),
                    "title": item.title,
                    "stage_id": str(review.stage_id),
                    "stage_label": review.stage.name,
                    "target_stage_id": str(item.stage_id),
                    "target_stage_label": item.stage.name,
                    "reason": "completed",
                }
            )
            recorded = snapshot.get(str(item.id)) or {}
            item.stage_id = review.stage_id
            item.origin_stage_id = _snapshot_origin(recorded)
            reverted.append(item)
            continue
        move_review_stage(
            review,
            stage=item.stage,
            actor=actor,
            extra={"tailoring_id": str(tailoring.id), "revision": tailoring.revision + 1},
        )
        moved_ids.append(review.id)
    if reverted:
        ReviewTailoringItem.objects.bulk_update(
            reverted, ["stage", "origin_stage", "updated_at"], batch_size=500
        )
    return moved_ids, skipped


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
        stage_id = _snapshot_stage(recorded, item)
        origin_id = _snapshot_origin(recorded)
        if (
            item.selected != bool(recorded.get("selected"))
            or item.reason != (recorded.get("reason") or "")
            or str(item.stage_id) != stage_id
            or (str(item.origin_stage_id) if item.origin_stage_id else None) != origin_id
        ):
            item.selected = bool(recorded.get("selected"))
            item.reason = recorded.get("reason") or ""
            item.stage_id = stage_id
            item.origin_stage_id = origin_id
            restored.append(item)

    # 先删快照外的格子再还原：挪回原阶段的格子要占的位置，可能正被修订期间补出来的格子占着
    if orphans:
        ReviewTailoringItem.objects.filter(id__in=orphans).delete(soft=False)
    if restored:
        ReviewTailoringItem.objects.bulk_update(
            restored,
            ["selected", "reason", "stage", "origin_stage", "updated_at"],
            batch_size=500,
        )

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


def attach_list_progress(tailorings, user=None):
    """给列表行补上「状态下面那行小字」要用的数，就地写到对象上。

    - ``approval_total`` / ``approval_approved``：本轮签批人数与已通过人数（签批中用）
    - ``my_approval_pending`` / ``my_approval_action``：按请求人算，他是不是本轮还没表态的签批人、
      表过态的话结论是什么（列表页「待你签批」与签批收件箱用）
    - ``generated_count``：已生成评审实例的格子数（已生效用）
    - ``pending_change_count``：修订期间相对生效快照改了几格（修订中用）

    列表是几十张表的量级，三条查询按表分组算完再分发，不在 queryset 上再挂 join ——
    列表 queryset 已经连了格子与两个轴，再连签批行会把行数乘上去。
    """
    tailorings = list(tailorings)
    if not tailorings:
        return tailorings
    ids = [tailoring.id for tailoring in tailorings]
    current_round = {tailoring.id: tailoring.round for tailoring in tailorings}

    approvals = defaultdict(lambda: [0, 0])
    # 请求人在本轮的签批行：有这一行才是签批人，action 为空就是还没表态
    mine = {}
    for tailoring_id, round_no, action, approver_id in ReviewTailoringApproval.objects.filter(
        tailoring_id__in=ids
    ).values_list("tailoring_id", "round", "action", "approver_id"):
        if round_no != current_round[tailoring_id]:
            continue
        approvals[tailoring_id][0] += 1
        if action == ReviewTailoringApprovalAction.APPROVED:
            approvals[tailoring_id][1] += 1
        if user is not None and approver_id == user.id:
            mine[tailoring_id] = action

    generated = dict(
        ReviewTailoringItem.objects.filter(
            tailoring_id__in=ids, stage_review__isnull=False
        )
        .values("tailoring_id")
        .annotate(count=Count("id"))
        .values_list("tailoring_id", "count")
    )

    revising_ids = [
        tailoring.id
        for tailoring in tailorings
        if tailoring.status == ReviewTailoringStatus.REVISING
        and tailoring.effective_snapshot
    ]
    revising_items = defaultdict(list)
    if revising_ids:
        for item in ReviewTailoringItem.objects.filter(
            tailoring_id__in=revising_ids
        ).only("id", "tailoring_id", "selected", "reason", "stage", "origin_stage"):
            revising_items[item.tailoring_id].append(item)

    for tailoring in tailorings:
        tailoring.approval_total, tailoring.approval_approved = approvals[tailoring.id]
        tailoring.my_approval_action = mine.get(tailoring.id)
        tailoring.my_approval_pending = (
            tailoring.status == ReviewTailoringStatus.PENDING
            and tailoring.id in mine
            and mine[tailoring.id] is None
        )
        tailoring.generated_count = generated.get(tailoring.id, 0)
        tailoring.pending_change_count = (
            _changed_cell_count(
                tailoring.effective_snapshot, revising_items[tailoring.id]
            )
            if tailoring.id in revising_ids
            else 0
        )
    return tailorings



def attach_detail_progress(tailoring, items, approvals):
    """详情页的四个进度数，口径与 ``attach_list_progress`` 一致，就地写到对象上。

    详情接口已经把全部格子与本轮签批查出来了（``approvals`` 只含本轮），这里直接数，
    不再发查询。修订中头部的「本次改了几格」、提交签批弹窗的摘要都读这几个数。
    """
    tailoring.approval_total = len(approvals)
    tailoring.approval_approved = sum(
        1
        for approval in approvals
        if approval.action == ReviewTailoringApprovalAction.APPROVED
    )
    tailoring.generated_count = sum(1 for item in items if item.stage_review_id)
    tailoring.pending_change_count = (
        _changed_cell_count(tailoring.effective_snapshot, items)
        if tailoring.status == ReviewTailoringStatus.REVISING
        and tailoring.effective_snapshot
        else 0
    )
    return tailoring
