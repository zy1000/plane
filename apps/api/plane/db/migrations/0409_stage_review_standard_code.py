"""评审模板与评审实例加「标准编号」，并给存量回填。

- 模板：每个工作区的活跃节点按阶段分组、阶段内按树序（顶层节点按 sort_order / created_at /
  id，每个顶层节点后面紧跟它的子节点）编号 ``{阶段类型编码}-{两位序号}``。有汇总评审的阶段
  根评审是 01、活动顺延；没有汇总评审的阶段活动从 01 起。未改动过的预置树得到的编号与
  ``seed_data/stage_review_templates.py::iter_template_rows`` 生成的一致。父节点已软删的
  孤儿按顶层处理；软删节点不编号（留空串）。
- 评审实例：按 ``template_id`` 从模板抄一份（快照，口径同三个角色字段）；手工评审没有模板，留空。

唯一约束放在下一个迁移（0410）里加：同一事务里先 UPDATE 再建唯一索引，Postgres 容易撞
pending trigger events。反向只删列，不还原。
"""

from collections import defaultdict

from django.db import migrations, models
from django.db.models import OuterRef, Subquery


def _code(stage_code, seq):
    return f"{stage_code}-{seq:02d}"


def backfill(apps, schema_editor):
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")
    StageReview = apps.get_model("db", "StageReview")

    # 历史模型是裸 Manager，没有软删过滤，必须显式带 deleted_at
    nodes = list(
        StageReviewTemplate.objects.filter(deleted_at__isnull=True)
        .select_related("stage")
        .order_by("workspace_id", "sort_order", "created_at", "id")
    )
    by_workspace = defaultdict(list)
    for node in nodes:
        by_workspace[node.workspace_id].append(node)

    changed = []
    for workspace_nodes in by_workspace.values():
        active_ids = {node.id for node in workspace_nodes}
        children = defaultdict(list)
        tops_by_stage = defaultdict(list)  # 插入顺序即 sort_order 顺序
        for node in workspace_nodes:
            if node.parent_id and node.parent_id in active_ids:
                children[node.parent_id].append(node)
            else:
                tops_by_stage[node.stage_id].append(node)
        # 防御：已经有编号的（理论上没有）保留并占位，新编的跳过它们
        used = {node.standard_code for node in workspace_nodes if node.standard_code}
        for tops in tops_by_stage.values():
            seq = 0
            for top in tops:
                for node in (top, *children[top.id]):
                    if node.standard_code:
                        continue
                    seq += 1
                    code = _code(node.stage.code, seq)
                    while code in used:
                        seq += 1
                        code = _code(node.stage.code, seq)
                    node.standard_code = code
                    used.add(code)
                    changed.append(node)

    StageReviewTemplate.objects.bulk_update(changed, ["standard_code"], batch_size=500)

    StageReview.objects.filter(template_id__isnull=False).update(
        standard_code=Subquery(
            StageReviewTemplate.objects.filter(pk=OuterRef("template_id")).values(
                "standard_code"
            )[:1]
        )
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0408_remove_product_code_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="stagereviewtemplate",
            name="standard_code",
            field=models.CharField(default="", max_length=80, verbose_name="标准编号"),
        ),
        migrations.AddField(
            model_name="stagereview",
            name="standard_code",
            field=models.CharField(
                blank=True, default="", max_length=80, verbose_name="标准编号"
            ),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
