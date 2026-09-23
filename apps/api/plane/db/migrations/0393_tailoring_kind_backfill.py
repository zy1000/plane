"""按纵轴内容推断存量裁剪表的类型。

纵轴非空且全部节点都是 O 系列（o_stage_review / o_stage_activity）→ ``o_stage``；
其余（纵轴为空、纯过程、混合）都留在 0392 给的默认值 ``process``。混合的存量表不清理，
之后新增节点才按类型校验。

kind 写字面量而不 import 业务常量：迁移要冻结当时的口径。
``apps.get_model()`` 拿到的历史模型没有软删 manager，必须显式过滤 ``deleted_at``。
反向什么也不做，列本身由 0392 反向删掉。
"""

from collections import defaultdict

from django.db import migrations

O_STAGE_KINDS = ("o_stage_review", "o_stage_activity")


def infer_tailoring_kind(apps, schema_editor):
    ReviewTailoring = apps.get_model("db", "ReviewTailoring")
    ReviewTailoringTemplate = apps.get_model("db", "ReviewTailoringTemplate")

    kinds_by_tailoring = defaultdict(set)
    for tailoring_id, kind in ReviewTailoringTemplate.objects.filter(
        deleted_at__isnull=True
    ).values_list("tailoring_id", "template__kind"):
        kinds_by_tailoring[tailoring_id].add(kind)

    o_stage_ids = [
        tailoring_id
        for tailoring_id, kinds in kinds_by_tailoring.items()
        if kinds and kinds <= set(O_STAGE_KINDS)
    ]
    if o_stage_ids:
        ReviewTailoring.objects.filter(id__in=o_stage_ids).update(
            tailoring_kind="o_stage"
        )


class Migration(migrations.Migration):
    dependencies = [("db", "0392_tailoring_kind_schema")]

    operations = [
        migrations.RunPython(infer_tailoring_kind, migrations.RunPython.noop),
    ]
