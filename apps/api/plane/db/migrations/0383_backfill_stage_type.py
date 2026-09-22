# 存量回填：每个工作区建 10 个预置阶段类型，评审模板按阶段名认领自己的类型。
#
# 规格与运行时共用同一份（plane/db/seed_data/stage_review_templates.py 是零 import 的纯
# 常量模块，迁移期 import 安全），理由与纪律写在该模块的 docstring 里。
from django.db import migrations

from plane.db.seed_data.stage_review_templates import SORT_ORDER_STEP, STAGE_TYPE_SPECS


def backfill_stage_types(apps, schema_editor):
    """建类型 + 回填模板的 stage_type。

    模板原先指向 product_stage 字典值，按 **名字** 认领对应的阶段类型。用户改过字典值
    名字的工作区会出现「模板的阶段名不在预置名单里」—— 那些名字补建成自定义类型
    （is_system=False），保证每个模板节点都认领得到。回填仍然不允许留空：兜底还查一遍，
    有漏的直接中止，让问题当场暴露而不是变成一张读不懂的模板树。
    """
    Workspace = apps.get_model("db", "Workspace")
    StageType = apps.get_model("db", "StageType")
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")

    preset_names = {name for _code, name in STAGE_TYPE_SPECS}

    for workspace_id in (
        Workspace.objects.filter(deleted_at__isnull=True)
        .values_list("id", flat=True)
        .iterator()
    ):
        # 1. 10 个预置类型
        StageType.objects.bulk_create(
            [
                StageType(
                    workspace_id=workspace_id,
                    code=code,
                    name=name,
                    is_system=True,
                    sort_order=(index + 1) * SORT_ORDER_STEP,
                )
                for index, (code, name) in enumerate(STAGE_TYPE_SPECS)
            ]
        )

        # 2. 该工作区模板实际用到、但不在预置名单里的阶段名（用户改过字典值）
        used = (
            StageReviewTemplate.objects.filter(workspace_id=workspace_id)
            .values_list("stage__label", flat=True)
            .distinct()
        )
        extra = sorted({label for label in used if label and label not in preset_names})
        if extra:
            StageType.objects.bulk_create(
                [
                    StageType(
                        workspace_id=workspace_id,
                        # 预置占 M 系列，自定义回填走 C 系列，两边不会撞
                        code=f"C{(index + 1) * 10:03d}",
                        name=name,
                        is_system=False,
                        sort_order=(len(STAGE_TYPE_SPECS) + index + 1) * SORT_ORDER_STEP,
                    )
                    for index, name in enumerate(extra)
                ]
            )

        # 3. 按名字认领
        type_by_name = dict(
            StageType.objects.filter(workspace_id=workspace_id).values_list("name", "id")
        )
        for name, stage_type_id in type_by_name.items():
            StageReviewTemplate.objects.filter(
                workspace_id=workspace_id, stage__label=name
            ).update(stage_type_id=stage_type_id)

    missing = StageReviewTemplate.objects.filter(stage_type__isnull=True).count()
    if missing:
        raise RuntimeError(
            f"{missing} 个评审模板节点没能认领到阶段类型，回填中止。"
            "请检查这些节点的 stage 是否指向已被删除的字典值。"
        )


def unbackfill_stage_types(apps, schema_editor):
    """反向：清空指针并删掉建出来的类型。旧的 stage 列 0384 才删，这里回滚即可复原。"""
    StageType = apps.get_model("db", "StageType")
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")
    StageReviewTemplate.objects.update(stage_type_id=None)
    StageType.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("db", "0382_stage_type")]

    operations = [
        migrations.RunPython(
            backfill_stage_types, unbackfill_stage_types, elidable=True
        ),
    ]
