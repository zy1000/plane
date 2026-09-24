"""PMS-101 第二期第二步：把评审实例、裁剪格子（含 origin_stage）与生效快照里的阶段，从模式
阶段映射到项目阶段。

映射规则（每条都不丢行）：

1. ``(project, source_stage=旧模式阶段)`` 命中的项目阶段（0395 回填 / 项目创建时拷出来的）；
2. 再按 ``(project, stage_type, name)`` 找同类型同名的项目阶段（顺手把它的 ``source_stage``
   补上，后续「可选节点」才走模式勾选）；
3. 都没有就在该项目**自动补建**一条项目阶段：拷自模式阶段，``source_stage`` 指向它，
   ``sort_order`` 追加，占比留空（不撞叶子 ≤100）。软删 / 模板项目下的评审同样映射 ——
   0395 没给它们回填项目阶段，这里补建是唯一来源。

快照 ``effective_snapshot`` 里的 ``stage_id / origin_stage_id`` 是字符串不是 FK，可能指向
早已硬删的模式阶段：只按已建立的映射改写，查不到就删键，让 ``_snapshot_stage`` 走
「item.origin_stage or item.stage」回退，不为快照补建阶段。

活动记录（``ReviewTailoringActivity.extra`` / ``StageReviewActivity.*_identifier``）里残留的
模式阶段 id **不改写**：前端读的是 ``*_label``，它们是审计文本。

**不支持反向**：项目自建阶段上的评审没法反向映射，自动补建的阶段也没有可靠的撤销判据
（用户可能已经在上面填了日期 / 负责人）。回滚请恢复备份。
"""

import uuid
from collections import defaultdict

from django.db import migrations

BATCH_SIZE = 2000
SORT_ORDER_STEP = 10000


def backfill(apps, schema_editor):
    Project = apps.get_model("db", "Project")
    ProjectStage = apps.get_model("db", "ProjectStage")
    DevModeStage = apps.get_model("db", "DevModeStage")
    StageReview = apps.get_model("db", "StageReview")
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    ReviewTailoring = apps.get_model("db", "ReviewTailoring")

    # 历史模型是裸 Manager：软删项目 / 软删阶段全部纳入。RESTRICT 保证被引用的模式阶段还在。
    dev_stage = {
        row[0]: row[1:]
        for row in DevModeStage.objects.values_list("id", "stage_type_id", "name")
    }
    project_ws = dict(Project.objects.values_list("id", "workspace_id"))
    by_source, by_type_name, max_sort = {}, {}, defaultdict(float)
    for ps_id, project_id, source_id, type_id, name, sort_order in ProjectStage.objects.values_list(
        "id", "project_id", "source_stage_id", "stage_type_id", "name", "sort_order"
    ):
        if source_id is not None:
            by_source[(project_id, source_id)] = ps_id
        by_type_name.setdefault((project_id, type_id, name), ps_id)
        max_sort[project_id] = max(max_sort[project_id], sort_order)

    created, source_patch = [], []

    def resolve(project_id, dev_id):
        key = (project_id, dev_id)
        if key in by_source:
            return by_source[key]
        spec = dev_stage.get(dev_id)
        if spec is None:
            raise RuntimeError(
                f"模式阶段 {dev_id} 不存在但仍被项目 {project_id} 的评审 / 格子引用，"
                "RESTRICT 下不该发生，请先检查数据。"
            )
        type_id, name = spec
        key2 = (project_id, type_id, name)
        if key2 in by_type_name:
            ps_id = by_type_name[key2]
            source_patch.append((ps_id, dev_id))
            by_source[key] = ps_id
            return ps_id
        max_sort[project_id] += SORT_ORDER_STEP
        stage = ProjectStage(
            id=uuid.uuid4(),
            project_id=project_id,
            workspace_id=project_ws[project_id],
            stage_type_id=type_id,
            name=name,
            workload_ratio=None,
            sort_order=max_sort[project_id],
            source_stage_id=dev_id,
        )
        created.append(stage)
        by_source[key] = stage.id
        by_type_name[key2] = stage.id
        return stage.id

    # 1) 评审实例
    review_pending = [
        StageReview(id=review_id, project_stage_id=resolve(project_id, stage_id))
        for review_id, project_id, stage_id in StageReview.objects.values_list(
            "id", "project_id", "stage_id"
        )
    ]
    # 2) 格子（含 origin）
    item_pending = [
        ReviewTailoringItem(
            id=item_id,
            project_stage_id=resolve(project_id, stage_id),
            origin_project_stage_id=resolve(project_id, origin_id) if origin_id else None,
        )
        for item_id, project_id, stage_id, origin_id in ReviewTailoringItem.objects.values_list(
            "id", "tailoring__project_id", "stage_id", "origin_stage_id"
        )
    ]

    # 3) 先落补建的阶段（FK 目标要先存在），再写两张表，再补写 source_stage
    if created:
        ProjectStage.objects.bulk_create(created, batch_size=500)
    for start in range(0, len(review_pending), BATCH_SIZE):
        StageReview.objects.bulk_update(review_pending[start : start + BATCH_SIZE], ["project_stage"])
    for start in range(0, len(item_pending), BATCH_SIZE):
        ReviewTailoringItem.objects.bulk_update(
            item_pending[start : start + BATCH_SIZE], ["project_stage", "origin_project_stage"]
        )
    for ps_id, dev_id in source_patch:
        ProjectStage.objects.filter(id=ps_id, source_stage_id__isnull=True).update(source_stage_id=dev_id)

    # 4) 快照改写：只用已建立的映射，查不到就删键
    for tailoring in ReviewTailoring.objects.exclude(effective_snapshot={}).only(
        "id", "project_id", "effective_snapshot"
    ):
        snapshot = tailoring.effective_snapshot or {}
        changed = False
        for record in snapshot.values():
            if not isinstance(record, dict):
                continue
            for key in ("stage_id", "origin_stage_id"):
                value = record.get(key)
                if not value:
                    continue
                try:
                    mapped = by_source.get((tailoring.project_id, uuid.UUID(str(value))))
                except ValueError:
                    mapped = None
                if mapped is None:
                    record.pop(key, None)
                else:
                    record[key] = str(mapped)
                changed = True
        if changed:
            tailoring.effective_snapshot = snapshot
            tailoring.save(update_fields=["effective_snapshot"])

    _assert_complete(apps)


def _assert_complete(apps):
    StageReview = apps.get_model("db", "StageReview")
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    missing_reviews = StageReview.objects.filter(project_stage__isnull=True).count()
    missing_items = ReviewTailoringItem.objects.filter(project_stage__isnull=True).count()
    if missing_reviews or missing_items:
        raise RuntimeError(
            f"回填后仍有 {missing_reviews} 条评审 / {missing_items} 个格子没有项目阶段，0400 的 NOT NULL 会失败。"
        )
    seen, duplicates = set(), []
    for key in ReviewTailoringItem.objects.filter(deleted_at__isnull=True).values_list(
        "tailoring_id", "product_id", "project_stage_id", "template_id"
    ):
        if key in seen:
            duplicates.append(key)
        seen.add(key)
    if duplicates:
        raise RuntimeError(
            "回填后裁剪格子出现重复的 (裁剪表, 产品, 项目阶段, 模板节点)："
            f"{duplicates[:10]}（共 {len(duplicates)} 组），请先人工清理。"
        )


class Migration(migrations.Migration):
    dependencies = [("db", "0398_review_project_stage_columns")]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
