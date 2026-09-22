"""阶段评审模板的预置：新建工作区自动带一套阶段类型 + 标准研发流程。

规格在 ``plane/db/seed_data/stage_review_templates.py``（零 import 的纯常量模块），
迁移 0362 / 0383 与本模块共用同一份，不再各抄一遍。

语义是**一次性 bootstrap，不是持续同步**：阶段类型看「该工作区有没有任意一行类型」，
模板看「有没有任意一行模板」（含软删），有就整体跳过。两者都是用户可增删改的业务数据，
逐行 get_or_create 会把用户特意删掉的行在每次调用时复活。往规格里追加新行因此**不会**
自动补给老工作区 —— 那要另写 delta 迁移。
"""

import logging

from django.db import IntegrityError, transaction

from plane.db.models import StageReviewTemplate, StageType
from plane.db.seed_data.stage_review_templates import (
    STAGE_TYPE_SPECS,
    iter_template_rows,
)
from plane.db.models.stage_type import SORT_ORDER_STEP

logger = logging.getLogger("plane.api")


def ensure_stage_types(workspace, actor=None):
    """给 workspace 预置 10 个阶段类型，返回新建的行数（已有任意类型时返回 0）。

    幂等锚点 = 「该工作区一行阶段类型都没有」。并发下抢在一起的那一路会撞
    stage_type 的唯一约束，由 IntegrityError 收场。
    """
    # all_objects 连软删行一起看：用户把类型全删了也不该再灌一次
    if StageType.all_objects.filter(workspace_id=workspace.id).exists():
        return 0
    try:
        with transaction.atomic():
            StageType.objects.bulk_create(
                [
                    StageType(
                        workspace_id=workspace.id,
                        code=code,
                        name=name,
                        is_system=True,
                        sort_order=(index + 1) * SORT_ORDER_STEP,
                        created_by_id=getattr(actor, "id", None),
                    )
                    for index, (code, name) in enumerate(STAGE_TYPE_SPECS)
                ]
            )
    except IntegrityError:
        logger.info(
            "stage types already seeded concurrently (workspace=%s)", workspace.id
        )
        return 0
    return len(STAGE_TYPE_SPECS)


def ensure_stage_review_templates(workspace, actor=None):
    """给 workspace 预置阶段评审模板，返回新建的行数（已有模板时返回 0）。

    幂等锚点 = 「该工作区一行模板都没有」。并发下抢在一起的那一路会撞 srt 的唯一约束，
    由 IntegrityError 收场（atomic 整块回滚，返回 0）。
    """
    if StageReviewTemplate.all_objects.filter(workspace_id=workspace.id).exists():
        return 0

    # 模板树挂在阶段类型上，先确保类型在。它自带 IntegrityError 兜底，放在 atomic 外面调。
    ensure_stage_types(workspace, actor=actor)

    try:
        with transaction.atomic():
            stage_by_name = {
                stage_type.name: stage_type
                for stage_type in StageType.objects.filter(workspace_id=workspace.id)
            }
            if not stage_by_name:
                # 类型一条都没有（并发中途、或被人删光）。不猜不硬建，下次调用再试。
                logger.warning(
                    "stage review templates skipped: no stage types (workspace=%s)",
                    workspace.id,
                )
                return 0
            return _create_templates(
                workspace.id, stage_by_name, getattr(actor, "id", None)
            )
    except IntegrityError:
        # 并发下另一路先写完（撞 srt 的两条唯一约束）：当作已存在
        logger.info(
            "stage review templates already seeded concurrently (workspace=%s)",
            workspace.id,
        )
        return 0


def _create_templates(workspace_id, stage_by_name, actor_id):
    """两遍建树：先顶层节点（根评审，以及没有根的阶段里的活动），再子节点。

    bulk_create 绕过 save()，所以 stage / workspace / sort_order / created_by 都要显式给
    （save() 里「stage 跟随父节点」「sort_order 追加到末尾」那两段不会跑）。id 是 uuid4
    默认值、``__init__`` 时就有，父实例入库前就能拿来当子节点的 parent_id。
    """
    top_level = {}
    roots = []
    children = []
    for row in iter_template_rows():
        stage = stage_by_name.get(row["stage_label"])
        if stage is None:
            # 阶段类型不在（被人改名或删过）。这一支整棵跳过，不 raise —— 预置失败不该拖垮建工作区。
            logger.warning(
                "stage review template skipped, stage type missing: %s",
                row["stage_label"],
            )
            continue
        node = StageReviewTemplate(
            workspace_id=workspace_id,
            stage_id=stage.id,
            kind=row["kind"],
            title=row["title"],
            initiator_role=row["initiator_role"],
            leader_role=row["leader_role"],
            auditor_role=row["auditor_role"],
            sort_order=row["sort_order"],
            created_by_id=actor_id,
        )
        if row["parent_title"] is None:
            top_level[(row["stage_label"], row["title"])] = node
            roots.append(node)
        else:
            parent = top_level.get((row["stage_label"], row["parent_title"]))
            if parent is None:
                logger.warning(
                    "stage review template skipped, parent missing: %s / %s",
                    row["stage_label"],
                    row["parent_title"],
                )
                continue
            node.parent_id = parent.id
            children.append(node)

    StageReviewTemplate.objects.bulk_create(roots)
    StageReviewTemplate.objects.bulk_create(children)
    return len(roots) + len(children)
