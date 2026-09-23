"""批次 4 第二步：把裁剪格子与评审实例的阶段回填到项目研发模式的阶段上。

**按名字匹配**。存量项目在 ``0387`` 里全部回填成了混合模式，而混合模式的 10 个阶段是
按阶段类型逐一实例化的，名字与阶段类型名、与 ``product_stage`` 字典值三者同名，所以
正常情况下全部命中：

- 裁剪格子：``stage = 项目模式中 name == item.template.stage.name 的阶段``；
- 评审实例：有模板的同上；模板为空的手工评审按旧 ``stage.label`` 对名字。

**命中不了就抛异常中止**，不静默留空也不自动补建阶段：留空会让 ``0390`` 的 NOT NULL
炸在半路，自动补建则会往用户精心配好的模式里塞垃圾阶段。命中不了只有一个原因 —— 有人
改过混合模式的阶段名，人工把名字改回去（或手工 UPDATE 这几行）再跑。

顺带校验回填后 ``(tailoring, product, stage, template)`` 不重复：旧唯一键是
``(tailoring, product, template)``，加一列只会让键更宽，理论上不可能撞；真撞了说明库里
本来就有脏数据，早失败好过 ``0390`` 建约束时失败。
"""

from collections import defaultdict

from django.db import migrations

BATCH_SIZE = 2000


def _stage_map_by_project(apps):
    """{project_id: {阶段名: 阶段 id}}，只给用到的项目建。"""
    Project = apps.get_model("db", "Project")
    DevModeStage = apps.get_model("db", "DevModeStage")

    # 历史模型只有原生 Manager，不过滤软删 —— 软删项目下的裁剪表和评审同样要回填，
    # 因为 0390 的 NOT NULL 不认软删。
    dev_mode_by_project = dict(Project.objects.values_list("id", "dev_mode_id"))
    stages_by_mode = defaultdict(dict)
    for mode_id, stage_id, name in DevModeStage.objects.values_list(
        "dev_mode_id", "id", "name"
    ):
        stages_by_mode[mode_id][name] = stage_id
    return dev_mode_by_project, stages_by_mode


def _resolve(project_id, name, dev_mode_by_project, stages_by_mode, what):
    mode_id = dev_mode_by_project.get(project_id)
    if mode_id is None:
        raise RuntimeError(
            f"{what}：项目 {project_id} 没有研发模式，0387 应该已经回填过，请先检查。"
        )
    stage_id = stages_by_mode.get(mode_id, {}).get(name)
    if stage_id is None:
        raise RuntimeError(
            f"{what}：项目 {project_id} 的研发模式 {mode_id} 里找不到名为「{name}」的阶段。"
            "存量数据应当全部是混合模式且阶段名与阶段类型同名；"
            "出现这条说明有人改过该模式的阶段名，请把名字改回去后重跑迁移。"
        )
    return stage_id


def backfill(apps, schema_editor):
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    StageReview = apps.get_model("db", "StageReview")

    dev_mode_by_project, stages_by_mode = _stage_map_by_project(apps)

    # --- 裁剪格子 -------------------------------------------------------
    items = list(
        ReviewTailoringItem.objects.filter(stage__isnull=True).values_list(
            "id", "tailoring__project_id", "template__stage__name"
        )
    )
    pending = []
    for item_id, project_id, stage_name in items:
        stage_id = _resolve(
            project_id, stage_name, dev_mode_by_project, stages_by_mode, "裁剪格子"
        )
        pending.append(ReviewTailoringItem(id=item_id, stage_id=stage_id))
    for start in range(0, len(pending), BATCH_SIZE):
        ReviewTailoringItem.objects.bulk_update(
            pending[start : start + BATCH_SIZE], ["stage"]
        )

    # --- 评审实例 -------------------------------------------------------
    # 模板为空的手工评审按旧字典值的 label 对名字，其余按模板节点的阶段类型名
    reviews = list(
        StageReview.objects.filter(dev_stage__isnull=True).values_list(
            "id", "project_id", "template__stage__name", "stage__label"
        )
    )
    pending = []
    for review_id, project_id, template_stage_name, dictionary_label in reviews:
        name = template_stage_name or dictionary_label
        stage_id = _resolve(
            project_id, name, dev_mode_by_project, stages_by_mode, "评审实例"
        )
        pending.append(StageReview(id=review_id, dev_stage_id=stage_id))
    for start in range(0, len(pending), BATCH_SIZE):
        StageReview.objects.bulk_update(
            pending[start : start + BATCH_SIZE], ["dev_stage"]
        )

    _assert_no_duplicate_cells(apps)


def _assert_no_duplicate_cells(apps):
    """新唯一键 (tailoring, product, stage, template) 必须仍然唯一。"""
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    seen = set()
    duplicates = []
    for key in ReviewTailoringItem.objects.filter(deleted_at__isnull=True).values_list(
        "tailoring_id", "product_id", "stage_id", "template_id"
    ):
        if key in seen:
            duplicates.append(key)
        seen.add(key)
    if duplicates:
        raise RuntimeError(
            "回填后裁剪格子出现重复的 (裁剪表, 产品, 阶段, 模板节点)："
            f"{duplicates[:10]}（共 {len(duplicates)} 组）。0390 的唯一约束会失败，"
            "请先人工清理这些行。"
        )


def unbackfill(apps, schema_editor):
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    StageReview = apps.get_model("db", "StageReview")
    ReviewTailoringItem.objects.update(stage=None)
    StageReview.objects.update(dev_stage=None)


class Migration(migrations.Migration):
    dependencies = [("db", "0388_stage_columns")]

    operations = [migrations.RunPython(backfill, unbackfill)]
