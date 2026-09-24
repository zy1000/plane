"""项目阶段的领域编排：从模式带出、树规则（占比 / 日期 / 父子）、状态副作用、批量改属性。

视图保持薄，规则都在这里。树规则需要整棵树（父的范围、叶子合计、有没有子），所以每次
写操作先 ``load_tree`` 把项目的全部活跃阶段拉进内存，在快照上算，不逐行查库。

规则见 ``db/models/project_stage.py`` 模块头注。这里补几条实现口径：

- ``parent`` 只在创建时可写，所以没有「重挂」分支，也就不需要防环 —— 新节点没有子。
- 父第一次挂子时，父原有的占比下移给这个子（子自己没传占比时）；父置空成汇总节点。
- 批量改属性按树深度升序处理（父先子后），每条在自己的保存点里对 DB 当前状态校验：
  父子同时选中、一起改成同一个新范围时，子看到的是已经更新过的父。
"""

from collections import defaultdict
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import RestrictedError
from django.utils import timezone

from plane.db.models import (
    DevModeStage,
    DevModeStageTemplate,
    ProjectStage,
    ProjectStageStatus,
    StageReviewTemplate,
)
from plane.db.models.dev_mode import MAX_WORKLOAD_RATIO_TOTAL, SORT_ORDER_STEP


class ProjectStageError(Exception):
    """带错误码的领域异常。视图统一翻成 400 / 409，前端按 code 出文案。"""

    def __init__(self, message, *, code="PROJECT_STAGE_INVALID", detail=None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.detail = detail or {}


# --- 树快照 ---------------------------------------------------------------


class StageTree:
    """项目全部活跃阶段的内存快照。所有树规则都在它上面算。"""

    def __init__(self, stages):
        self.by_id = {stage.id: stage for stage in stages}
        self.children_of = defaultdict(list)
        for stage in stages:
            if stage.parent_id is not None:
                self.children_of[stage.parent_id].append(stage)

    def children(self, stage_id):
        return self.children_of.get(stage_id, [])

    def is_leaf(self, stage_id):
        return not self.children_of.get(stage_id)

    def depth(self, stage_id):
        depth, current = 0, self.by_id.get(stage_id)
        seen = set()
        while current is not None and current.parent_id is not None and current.id not in seen:
            seen.add(current.id)
            depth += 1
            current = self.by_id.get(current.parent_id)
        return depth

    def leaf_total(self, exclude_ids=()):
        """叶子占比合计。``exclude_ids`` 里的阶段不计（编辑自己、父即将变非叶子）。"""
        exclude = set(exclude_ids)
        total = Decimal("0")
        for stage in self.by_id.values():
            if stage.id in exclude or not self.is_leaf(stage.id):
                continue
            if stage.workload_ratio is not None:
                total += stage.workload_ratio
        return total

    def computed_ratios(self):
        """{阶段 id: 占比}：父 = 子之和（递归），叶 = 自身值（None 保持 None）。"""
        memo = {}

        def compute(stage):
            if stage.id in memo:
                return memo[stage.id]
            children = self.children(stage.id)
            if not children:
                value = stage.workload_ratio
            else:
                value = None
                for child in children:
                    child_value = compute(child)
                    if child_value is not None:
                        value = (value or Decimal("0")) + child_value
            memo[stage.id] = value
            return value

        for stage in self.by_id.values():
            compute(stage)
        return memo


def load_tree(project_id):
    return StageTree(
        ProjectStage.objects.filter(project_id=project_id).only(
            "id", "parent_id", "workload_ratio", "start_date", "end_date", "sort_order"
        )
    )


def _sibling_key(stage):
    return (stage.sort_order, stage.created_at, str(stage.id))


def tree_order(project_id, stages=None):
    """项目全部活跃阶段按**树先序**排好的列表，每个对象就地挂 ``depth`` 与 ``rank``。

    ``ProjectStage.sort_order`` 是项目全局单调（后建的子阶段比所有既有阶段都大），跨层比较
    会把子阶段甩到最后。评审线所有「阶段顺序」（裁剪行、阶段汇总、移到阶段候选、纵轴候选、
    产品级汇总）一律从这里取 ``rank``，序列化器把 ``rank`` 当 ``sort_order`` 吐给前端。
    """
    if stages is None:
        stages = list(
            ProjectStage.objects.filter(project_id=project_id).select_related("stage_type")
        )
    tree = StageTree(stages)
    ordered = []

    def walk(parent_id, depth):
        siblings = [stage for stage in stages if (stage.parent_id or None) == parent_id]
        # 父不在列表里（不该发生）的当根处理，别把行丢了
        if parent_id is None:
            siblings = [
                stage
                for stage in stages
                if stage.parent_id is None or stage.parent_id not in tree.by_id
            ]
        for stage in sorted(siblings, key=_sibling_key):
            stage.depth = depth
            stage.rank = len(ordered)
            ordered.append(stage)
            walk(stage.id, depth + 1)

    walk(None, 0)
    return ordered


def selectable_template_ids_by_stage(stages):
    """{项目阶段 id: 该阶段可选的模板节点 id 集合}。

    有 ``source_stage`` 的沿用模式阶段的 ``DevModeStageTemplate`` 勾选（硬边界照旧）；没有的
    （项目自建、来源被删）按 ``stage_type`` 取该类型全部活跃节点。裁剪表纵轴展开、添加评审的
    硬边界校验、纵轴候选三处共用。
    """
    selected = defaultdict(set)
    if not stages:
        return selected
    by_source = defaultdict(list)
    type_only = defaultdict(list)
    for stage in stages:
        if stage.source_stage_id:
            by_source[stage.source_stage_id].append(stage.id)
        else:
            type_only[stage.stage_type_id].append(stage.id)
    if by_source:
        for source_id, template_id in DevModeStageTemplate.objects.filter(
            dev_mode_stage_id__in=list(by_source)
        ).values_list("dev_mode_stage_id", "template_id"):
            for stage_id in by_source[source_id]:
                selected[stage_id].add(template_id)
    if type_only:
        for type_id, template_id in StageReviewTemplate.objects.filter(
            stage_id__in=list(type_only), is_active=True
        ).values_list("stage_id", "id"):
            for stage_id in type_only[type_id]:
                selected[stage_id].add(template_id)
    return selected


def stage_in_use(stage):
    """这个阶段有没有被活跃的评审实例 / 裁剪格子引用（``origin_stage`` 是 SET_NULL，不算）。

    只算活跃行：软删过的行对 RESTRICT 仍算引用，但不该因为一条已删的评审拦住用户；真删时
    撞 ``RestrictedError`` 由调用方收成 409。
    """
    return stage.stage_reviews.exists() or stage.tailoring_items.exists()


# --- 从研发模式带出 ---------------------------------------------------------


def _mode_stages(project):
    return list(
        DevModeStage.objects.filter(dev_mode_id=project.dev_mode_id)
        .select_related("stage_type")
        .order_by("sort_order", "created_at", "id")
    )


def _build_from_mode_stage(project, mode_stage, *, actor, sort_order, workload_ratio):
    return ProjectStage(
        project_id=project.id,
        workspace_id=project.workspace_id,
        stage_type_id=mode_stage.stage_type_id,
        name=mode_stage.name,
        workload_ratio=workload_ratio,
        sort_order=sort_order,
        source_stage_id=mode_stage.id,
        created_by=actor,
        updated_by=actor,
    )


def copy_stages_from_dev_mode(project, *, actor=None):
    """项目创建时从所选模式拷一份阶段。项目已有任何阶段就整体跳过（幂等锚点同 ``ensure_dev_modes``）。

    ``bulk_create`` 绕过 ``ProjectBaseModel.save()``，所以 workspace / sort_order 都显式给。
    """
    if project.dev_mode_id is None:
        return []
    if ProjectStage.objects.filter(project_id=project.id).exists():
        return []
    rows = [
        _build_from_mode_stage(
            project,
            mode_stage,
            actor=actor,
            sort_order=(index + 1) * SORT_ORDER_STEP,
            workload_ratio=mode_stage.workload_ratio,
        )
        for index, mode_stage in enumerate(_mode_stages(project))
    ]
    with transaction.atomic():
        return ProjectStage.objects.bulk_create(rows)


def sync_from_dev_mode(project, *, actor=None, only_ids=None):
    """把模式里还没带出的阶段补进项目。

    已带出的按 ``source_stage`` 认；模式里删了再建同名阶段会换 id，所以「同类型且同名」的
    既有阶段也算已带出（``matched_by_name``）。补入的占比若让叶子合计超 100 就置空
    （``ratio_dropped``），让用户手动分。``only_ids`` 给了就只补这些模式阶段（弹窗里勾选）。
    """
    existing = list(ProjectStage.objects.filter(project_id=project.id))
    by_source = {stage.source_stage_id for stage in existing if stage.source_stage_id}
    by_type_name = {}
    for stage in existing:
        by_type_name.setdefault((stage.stage_type_id, stage.name), stage)
    tree = StageTree(existing)
    total = tree.leaf_total()
    last_sort = max((stage.sort_order for stage in existing), default=0)

    created, skipped, matched_by_name, ratio_dropped = [], [], [], []
    rows = []
    wanted = {str(item) for item in only_ids} if only_ids is not None else None
    for mode_stage in _mode_stages(project):
        if wanted is not None and str(mode_stage.id) not in wanted:
            continue
        if mode_stage.id in by_source:
            skipped.append(str(mode_stage.id))
            continue
        matched = by_type_name.get((mode_stage.stage_type_id, mode_stage.name))
        if matched is not None:
            matched_by_name.append(str(mode_stage.id))
            # 同名认亲的顺手补上来源，否则它的可选评审节点永远走「类型全集」而不是模式勾选
            if matched.source_stage_id is None:
                ProjectStage.objects.filter(pk=matched.pk).update(source_stage_id=mode_stage.id)
            continue
        ratio = mode_stage.workload_ratio
        if ratio is not None:
            if total + ratio > MAX_WORKLOAD_RATIO_TOTAL:
                ratio_dropped.append(mode_stage.name)
                ratio = None
            else:
                total += ratio
        last_sort += SORT_ORDER_STEP
        rows.append(
            _build_from_mode_stage(
                project, mode_stage, actor=actor, sort_order=last_sort, workload_ratio=ratio
            )
        )
    if rows:
        with transaction.atomic():
            created = ProjectStage.objects.bulk_create(rows)
    return {
        "created": created,
        "skipped": skipped,
        "matched_by_name": matched_by_name,
        "ratio_dropped": ratio_dropped,
    }


# --- 校验 -------------------------------------------------------------------


def _format_ratio(value):
    normalized = Decimal(value).normalize()
    text = format(normalized, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def check_leaf_ratio(tree, incoming, *, exclude_ids=()):
    """叶子累计 ≤ 100。``exclude_ids``：自己（编辑）与即将变成非叶子的父。"""
    if incoming is None:
        return
    remaining = Decimal(MAX_WORKLOAD_RATIO_TOTAL) - tree.leaf_total(exclude_ids)
    if Decimal(incoming) > remaining:
        raise ProjectStageError(
            f"工作量占比累计不能超过 {MAX_WORKLOAD_RATIO_TOTAL}%，"
            f"当前最多还能分配 {_format_ratio(max(remaining, Decimal('0')))}%。",
            code="PROJECT_STAGE_RATIO_OVER_LIMIT",
            detail={"remaining": str(max(remaining, Decimal("0")))},
        )


def _within(start, end, bound_start, bound_end):
    """(start, end) 是否落在 [bound_start, bound_end] 内。任一侧为空视为无界。"""
    for value in (start, end):
        if value is None:
            continue
        if bound_start is not None and value < bound_start:
            return False
        if bound_end is not None and value > bound_end:
            return False
    return True


def validate_dates(tree, *, parent_id, stage_id, start, end):
    """双向校验：对父，新值在父范围内；对子，每个子的现有范围在新值内。"""
    if start and end and end < start:
        raise ProjectStageError(
            "计划结束不能早于计划开始。", code="PROJECT_STAGE_DATE_ORDER"
        )
    parent = tree.by_id.get(parent_id) if parent_id else None
    if parent is not None and not _within(start, end, parent.start_date, parent.end_date):
        raise ProjectStageError(
            "子阶段的日期必须落在父阶段范围内。",
            code="PROJECT_STAGE_DATE_OUT_OF_PARENT",
            detail={
                "parent_start_date": parent.start_date.isoformat() if parent.start_date else None,
                "parent_end_date": parent.end_date.isoformat() if parent.end_date else None,
            },
        )
    if stage_id is not None:
        out_of_range = [
            str(child.id)
            for child in tree.children(stage_id)
            if not _within(child.start_date, child.end_date, start, end)
        ]
        if out_of_range:
            raise ProjectStageError(
                "已有子阶段的日期超出了新的范围，请先调整子阶段。",
                code="PROJECT_STAGE_CHILD_OUT_OF_RANGE",
                detail={"stage_ids": out_of_range},
            )


def _validated(stage):
    """跑模型校验，把 Django 的 ValidationError 翻成带错误码的领域异常。"""
    try:
        # created_by / updated_by 是 null=True 但没有 blank=True，回填的行为空会被 full_clean 挡
        stage.full_clean(
            exclude=[
                "workspace",
                "project",
                "stage_type",
                "parent",
                "owner",
                "source_stage",
                "created_by",
                "updated_by",
            ]
        )
    except ValidationError as exc:
        messages = getattr(exc, "message_dict", {})
        first = next(iter(messages.values()), ["数据不合法"])[0] if messages else "数据不合法"
        raise ProjectStageError(first, code="PROJECT_STAGE_INVALID", detail={"fields": messages})
    return stage


# --- 状态副作用 -------------------------------------------------------------


def apply_status(stage, new_status, *, explicit):
    """按状态切换填 / 清实际日期。同一次请求显式传了 ``actual_*`` 就以显式值为准。

    - → 进行中：实际开始为空则填今天
    - → 已完成：实际开始 / 实际完成为空则填今天
    - → 未开始：清空两个实际日期
    - 已完成 → 进行中 / 已暂停：清实际完成
    """
    old_status = stage.status
    today = timezone.localdate()
    stage.status = new_status
    if new_status == ProjectStageStatus.IN_PROGRESS:
        if stage.actual_start is None:
            stage.actual_start = today
        if old_status == ProjectStageStatus.COMPLETED:
            stage.actual_end = None
    elif new_status == ProjectStageStatus.COMPLETED:
        if stage.actual_start is None:
            stage.actual_start = today
        if stage.actual_end is None:
            stage.actual_end = today
    elif new_status == ProjectStageStatus.NOT_STARTED:
        stage.actual_start = None
        stage.actual_end = None
    elif new_status == ProjectStageStatus.PAUSED:
        if old_status == ProjectStageStatus.COMPLETED:
            stage.actual_end = None
    for field, value in explicit.items():
        setattr(stage, field, value)


# --- 写操作 -----------------------------------------------------------------

_DATE_FIELDS = ("start_date", "end_date")
_ACTUAL_FIELDS = ("actual_start", "actual_end")


def create_stage(project, *, actor, validated_data):
    """新建阶段（含子阶段）。调用方负责外层事务。"""
    data = dict(validated_data)
    parent = data.get("parent")
    status = data.pop("status", None)
    tree = load_tree(project.id)

    stage = ProjectStage(
        project_id=project.id,
        workspace_id=project.workspace_id,
        created_by=actor,
        updated_by=actor,
        **data,
    )
    validate_dates(
        tree,
        parent_id=parent.id if parent else None,
        stage_id=None,
        start=stage.start_date,
        end=stage.end_date,
    )

    exclude = []
    parent_row = tree.by_id.get(parent.id) if parent else None
    if parent_row is not None and tree.is_leaf(parent_row.id):
        # 父第一次挂子：父的占比下移给这个子，父变成汇总节点
        exclude.append(parent_row.id)
        if stage.workload_ratio is None and parent_row.workload_ratio is not None:
            stage.workload_ratio = parent_row.workload_ratio
    check_leaf_ratio(tree, stage.workload_ratio, exclude_ids=exclude)

    if status is not None:
        apply_status(stage, status, explicit={})
    _validated(stage)
    stage.save()
    if parent_row is not None and tree.is_leaf(parent_row.id) and parent_row.workload_ratio is not None:
        ProjectStage.objects.filter(pk=parent_row.id).update(workload_ratio=None, updated_by=actor)
    return stage


def update_stage(stage, *, actor, validated_data):
    """改字段。``parent`` 创建后不可改（serializer 已挡）。"""
    data = dict(validated_data)
    data.pop("parent", None)
    new_status = data.pop("status", None)
    explicit = {field: data.pop(field) for field in _ACTUAL_FIELDS if field in data}
    tree = load_tree(stage.project_id)

    if any(field in data for field in _DATE_FIELDS):
        validate_dates(
            tree,
            parent_id=stage.parent_id,
            stage_id=stage.id,
            start=data.get("start_date", stage.start_date),
            end=data.get("end_date", stage.end_date),
        )
    if data.get("workload_ratio") is not None:
        if not tree.is_leaf(stage.id):
            raise ProjectStageError(
                "有子阶段的阶段不能直接填占比，它的占比等于子阶段之和。",
                code="PROJECT_STAGE_RATIO_ON_PARENT",
            )
        check_leaf_ratio(tree, data["workload_ratio"], exclude_ids=[stage.id])
    stage_type = data.get("stage_type")
    if stage_type is not None and stage_type.id != stage.stage_type_id and stage_in_use(stage):
        # 评审树是按类型来的，换了类型已挂的评审 / 格子就对不上
        raise ProjectStageError(
            "阶段已挂评审或裁剪格子，不能改类型。", code="PROJECT_STAGE_TYPE_IN_USE"
        )

    changed = []
    for field, value in data.items():
        if getattr(stage, field) != value:
            setattr(stage, field, value)
            changed.append(field)
    if new_status is not None and new_status != stage.status:
        apply_status(stage, new_status, explicit=explicit)
        changed.extend(["status", *_ACTUAL_FIELDS])
    else:
        for field, value in explicit.items():
            if getattr(stage, field) != value:
                setattr(stage, field, value)
                changed.append(field)
    if not changed:
        return stage
    stage.updated_by = actor
    _validated(stage)
    stage.save(update_fields=[*dict.fromkeys(changed), "updated_by", "updated_at"])
    return stage


def bulk_update_stages(stages, *, actor, changes):
    """勾选后批量改负责人 / 计划日期。逐条保存点，部分成功。父先子后。"""
    tree = load_tree(next(iter(stages)).project_id) if stages else None
    ordered = sorted(stages, key=lambda stage: (tree.depth(stage.id), stage.sort_order))
    updated, failed = [], []
    for stage in ordered:
        try:
            with transaction.atomic():
                update_stage(stage, actor=actor, validated_data=dict(changes))
        except ProjectStageError as exc:
            failed.append(
                {"id": str(stage.id), "name": stage.name, "code": exc.code, "error": exc.message}
            )
            continue
        updated.append(stage)
    return updated, failed


def delete_stage(stage):
    """有活跃子阶段、或被活跃评审 / 格子引用的不能删（409）。硬删；软删残留撞 RESTRICT 同样收成 409。"""
    if ProjectStage.objects.filter(parent_id=stage.id).exists():
        raise ProjectStageError(
            "请先删除它下面的子阶段。", code="PROJECT_STAGE_HAS_CHILDREN"
        )
    if stage_in_use(stage):
        raise ProjectStageError(
            "这个阶段挂着评审或裁剪表里的格子，先在裁剪表把它们移到别的阶段，或删掉评审后再删。",
            code="PROJECT_STAGE_IN_USE",
        )
    try:
        stage.delete()
    except RestrictedError:
        raise ProjectStageError(
            "阶段仍被已删除的评审或裁剪格子引用，无法删除。", code="PROJECT_STAGE_IN_USE"
        )
