"""阶段评审模板的预置：新建工作区自动带一套标准研发流程。

规格在 ``plane/db/seed_data/stage_review_templates.py``（零 import 的纯常量模块），
迁移 0362 与本模块共用同一份，不再各抄一遍。

语义是**一次性 bootstrap，不是持续同步**：只要工作区下已经有任何一行模板（含软删）就
整体跳过。模板是用户可增删改的业务数据，逐行 get_or_create 会把用户特意删掉的行在每次
调用时复活。往规格里追加新模板因此**不会**自动补给老工作区 —— 那要另写 delta 迁移。
"""

import logging

from django.db import IntegrityError, transaction

from plane.db.models import DataDictionary, DataDictionaryItem, StageReviewTemplate
from plane.db.seed_data.stage_review_templates import (
    PRODUCT_STAGE_DICTIONARY_KEY,
    PRODUCT_STAGE_LABELS,
    iter_template_rows,
)
from plane.utils.data_dictionary import bulk_create_items, ensure_system_dictionaries

logger = logging.getLogger("plane.api")


def ensure_stage_review_templates(workspace, actor=None):
    """给 workspace 预置阶段评审模板，返回新建的行数（已有模板时返回 0）。

    幂等锚点 = 「该工作区一行模板都没有」。并发下抢在一起的那一路会撞 srt 的唯一约束，
    由 IntegrityError 收场（atomic 整块回滚，返回 0）。
    """
    # all_objects 连软删行一起看：用户把模板全删了也不该再灌一次
    if StageReviewTemplate.all_objects.filter(workspace_id=workspace.id).exists():
        return 0

    # 字典头可能还不存在 —— ensure_system_dictionaries 是懒加载的，从没打开过数据字典
    # 设置页的工作区一本字典都没有。它自带 savepoint 与 IntegrityError 兜底，放在 atomic 外面调。
    ensure_system_dictionaries(workspace)

    try:
        with transaction.atomic():
            # 行锁是 bulk_create_items 的前置条件（见它的 docstring），不是这条链路的
            # 并发需要 —— 本函数只在建工作区时调，同一个工作区不会有第二路。
            # 没有 join，不用 of=self。
            dictionary = (
                DataDictionary.objects.select_for_update()
                .filter(workspace_id=workspace.id, key=PRODUCT_STAGE_DICTIONARY_KEY)
                .first()
            )
            if dictionary is None:
                # 用户自建字典占了 product_stage 这把 key。不猜不硬建，下次调用再试。
                logger.warning(
                    "stage review templates skipped: no product_stage dictionary (workspace=%s)",
                    workspace.id,
                )
                return 0

            # 阶段值缺哪补哪。老工作区的字典头早就在，ensure_system_dictionaries 不会给
            # 已存在的字典补值，只能在这里补。
            bulk_create_items(dictionary, list(PRODUCT_STAGE_LABELS), actor=actor)
            stage_by_label = {
                item.label: item
                for item in DataDictionaryItem.objects.filter(
                    dictionary=dictionary, label__in=PRODUCT_STAGE_LABELS
                )
            }
            return _create_templates(
                workspace.id, stage_by_label, getattr(actor, "id", None)
            )
    except IntegrityError:
        # 并发下另一路先写完（撞 srt 的两条唯一约束）：当作已存在
        logger.info(
            "stage review templates already seeded concurrently (workspace=%s)",
            workspace.id,
        )
        return 0


def _create_templates(workspace_id, stage_by_label, actor_id):
    """两遍建树：先顶层节点（根评审，以及没有根的阶段里的活动），再子节点。

    bulk_create 绕过 save()，所以 stage / workspace / sort_order / created_by 都要显式给
    （save() 里「stage 跟随父节点」「sort_order 追加到末尾」那两段不会跑）。id 是 uuid4
    默认值、``__init__`` 时就有，父实例入库前就能拿来当子节点的 parent_id。
    """
    top_level = {}
    roots = []
    children = []
    for row in iter_template_rows():
        stage = stage_by_label.get(row["stage_label"])
        if stage is None:
            # 阶段值不在字典里（被人删过）。这一支整棵跳过，不 raise —— 预置失败不该拖垮建工作区。
            logger.warning(
                "stage review template skipped, stage label missing: %s", row["stage_label"]
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
