"""研发模式的预置与共享校验。

规格在 ``plane/db/seed_data/dev_modes.py``（零 import 的纯常量模块），迁移 0386 与本模块
共用同一份。

语义与 ``ensure_stage_review_templates`` 一致，是**一次性 bootstrap 而不是持续同步**：
「该工作区已有任意 DevMode 行（含软删）」就整体跳过。模式是用户可增删改的业务数据，
逐行 get_or_create 会把用户特意删掉的预置模式在每次调用时复活。
"""

import logging
from decimal import Decimal

from django.db import IntegrityError, transaction

from plane.db.models import (
    DevMode,
    DevModeStage,
    DevModeStageTemplate,
    StageReviewTemplate,
    StageType,
)
from plane.db.models.dev_mode import MAX_WORKLOAD_RATIO_TOTAL, SORT_ORDER_STEP
from plane.db.seed_data.dev_modes import (
    DEFAULT_DEV_MODE_NAME,
    DEV_MODE_SPECS,
    normalize_features,
)
from plane.utils.stage_review_template import ensure_stage_review_templates

logger = logging.getLogger("plane.api")


def default_dev_mode(workspace_id):
    """工作区的默认模式：预置的「混合模式」，它等价于加模式之前的现状（组件全开）。

    存量项目的回填、创建项目弹窗的默认选中、ORM 直建项目的兜底，三处都认这一个。
    用户把它删了（预置模式本来不让删，但 all_objects 里可能有历史残留）就退回该工作区
    任意一个模式，实在没有才返回 None。
    """
    return (
        DevMode.objects.filter(
            workspace_id=workspace_id, is_system=True, name=DEFAULT_DEV_MODE_NAME
        ).first()
        or DevMode.objects.filter(workspace_id=workspace_id).order_by("created_at", "id").first()
    )


def resolve_default_dev_mode_id(workspace_id):
    """同 ``default_dev_mode``，但工作区一个模式都没有时先补预置再取。

    给 ``Project.save()`` 兜底用：ORM 直建项目的路径（workspace_seed / dummy_data_task /
    模板 / 测试）不传 dev_mode，而这一列是 NOT NULL。工作区没模式只会发生在
    ``ensure_dev_modes`` 还没跑过的时候，补一次即可，之后都走上面的快路径。
    """
    if workspace_id is None:
        return None
    dev_mode = default_dev_mode(workspace_id)
    if dev_mode is not None:
        return dev_mode.id

    from plane.db.models import Workspace

    workspace = Workspace.objects.filter(id=workspace_id).first()
    if workspace is None:
        return None
    ensure_dev_modes(workspace)
    dev_mode = default_dev_mode(workspace_id)
    return dev_mode.id if dev_mode is not None else None


def ensure_dev_modes(workspace, actor=None):
    """给 workspace 预置三个研发模式，返回新建的模式数（已有任意模式时返回 0）。

    依赖阶段类型与评审树已存在，所以先调 ``ensure_stage_review_templates``（它自己也是
    幂等的，而且会顺带 ensure 阶段类型）。三个 ensure 的固定顺序是
    阶段类型 → 评审树 → 研发模式，工作区创建入口（views/workspace/base.py）只调本函数，
    靠这里的嵌套保证顺序。并发下抢在一起的那一路会撞 dev_mode 的唯一约束，
    由 IntegrityError 收场。
    """
    if DevMode.all_objects.filter(workspace_id=workspace.id).exists():
        return 0

    # 模式的阶段引用阶段类型、勾选引用评审模板，两者都要先在。
    # 它自带 IntegrityError 兜底，放在下面的 atomic 外面调。
    ensure_stage_review_templates(workspace, actor=actor)

    actor_id = getattr(actor, "id", None)
    try:
        with transaction.atomic():
            stage_types = list(
                StageType.objects.filter(workspace_id=workspace.id).order_by(
                    "sort_order", "created_at", "id"
                )
            )
            # 该工作区每个阶段类型下的活跃模板节点，一次查完按类型分桶
            templates_by_stage = {}
            for template in StageReviewTemplate.objects.filter(
                workspace_id=workspace.id, is_active=True
            ).only("id", "stage_id"):
                templates_by_stage.setdefault(template.stage_id, []).append(template.id)

            created = 0
            for spec in DEV_MODE_SPECS:
                dev_mode = DevMode.objects.create(
                    workspace_id=workspace.id,
                    name=spec["name"],
                    description=spec["description"],
                    icon_props=dict(spec["icon_props"]),
                    features=normalize_features(spec["features"]),
                    is_system=True,
                    created_by_id=actor_id,
                )
                created += 1
                if spec["seed_all_stages"]:
                    _seed_stages(dev_mode, stage_types, templates_by_stage, actor_id)
            return created
    except IntegrityError:
        logger.info("dev modes already seeded concurrently (workspace=%s)", workspace.id)
        return 0


def _seed_stages(dev_mode, stage_types, templates_by_stage, actor_id):
    """按全部阶段类型各建一个阶段（名称取类型名），并勾满该类型下的活跃模板节点。"""
    stages = [
        DevModeStage(
            dev_mode_id=dev_mode.id,
            workspace_id=dev_mode.workspace_id,
            stage_type_id=stage_type.id,
            name=stage_type.name,
            sort_order=(index + 1) * SORT_ORDER_STEP,
            created_by_id=actor_id,
        )
        for index, stage_type in enumerate(stage_types)
    ]
    # bulk_create 绕过 save()，上面已经把 workspace_id 与 sort_order 都显式给了。
    # id 是 uuid4 默认值、__init__ 时就有，入库前就能拿来当勾选行的外键。
    DevModeStage.objects.bulk_create(stages)
    DevModeStageTemplate.objects.bulk_create(
        [
            DevModeStageTemplate(
                dev_mode_stage_id=stage.id,
                template_id=template_id,
                created_by_id=actor_id,
            )
            for stage in stages
            for template_id in templates_by_stage.get(stage.stage_type_id, [])
        ]
    )


def workload_ratio_total(dev_mode_id, exclude_stage_ids=None):
    """模式内已分配的工作量占比合计（不含 exclude 的那些阶段）。"""
    queryset = DevModeStage.objects.filter(
        dev_mode_id=dev_mode_id, workload_ratio__isnull=False
    )
    if exclude_stage_ids:
        queryset = queryset.exclude(id__in=exclude_stage_ids)
    total = Decimal("0")
    for value in queryset.values_list("workload_ratio", flat=True):
        total += value
    return total


def remaining_workload_ratio(dev_mode_id, exclude_stage_ids=None):
    """模式内还能分配的占比。用于前端提示与 serializer 报错文案。"""
    return Decimal(MAX_WORKLOAD_RATIO_TOTAL) - workload_ratio_total(
        dev_mode_id, exclude_stage_ids
    )


def check_workload_ratio(dev_mode_id, incoming_total, exclude_stage_ids=None):
    """占比校验：已分配 + 本次要写入的，不能超过 100。

    超了返回错误文案，没超返回 None。新建、编辑、批量新建都走这里。
    """
    if incoming_total is None:
        return None
    remaining = remaining_workload_ratio(dev_mode_id, exclude_stage_ids)
    if Decimal(incoming_total) > remaining:
        return (
            f"工作量占比累计不能超过 {MAX_WORKLOAD_RATIO_TOTAL}%，"
            f"当前最多还能分配 {_format_ratio(remaining)}%。"
        )
    return None


def _format_ratio(value):
    """去掉无意义的小数尾巴：10.00 -> 10，12.50 -> 12.5。"""
    normalized = Decimal(value).normalize()
    text = format(normalized, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def selectable_template_ids(stage):
    """这个阶段允许勾选的模板节点 id 集合 = 它的阶段类型下的全部活跃节点。"""
    return set(
        StageReviewTemplate.objects.filter(
            stage_id=stage.stage_type_id, is_active=True
        ).values_list("id", flat=True)
    )
