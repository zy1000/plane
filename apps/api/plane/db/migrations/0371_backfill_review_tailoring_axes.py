"""把轴表从现有格子回填出来。

``0370`` 建了两张轴表却没回填 —— 当时的假设是 ``0369`` 刚把存量裁剪表清空过，轴表天生
就该是空的。但在这两个迁移之间还跑过一版「纵轴自动铺满全部模板」的代码：那一版没有轴
表，加产品时直接铺格子。于是这批表落到了**有格子、没有轴**的状态，再加同一个产品时
``add_products`` 看轴表以为是新列，铺出来的格子当场撞上
``rti_unique_tailoring_product_template_active``。

回填规则：
- 横轴 = 格子里出现过的产品
- 纵轴 = 格子的模板节点回溯到它的顶层（评审活动记到它所属的评审上，因为纵轴只存顶层）

写成幂等的（只补缺的那部分），重复执行不会再撞唯一约束。
"""

from django.db import migrations


def backfill_axes(apps, schema_editor):
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    ReviewTailoringProduct = apps.get_model("db", "ReviewTailoringProduct")
    ReviewTailoringTemplate = apps.get_model("db", "ReviewTailoringTemplate")
    StageReviewTemplate = apps.get_model("db", "StageReviewTemplate")

    cells = list(
        ReviewTailoringItem.objects.filter(deleted_at__isnull=True).values_list(
            "tailoring_id", "product_id", "template_id"
        )
    )
    if not cells:
        return

    # --- 横轴 ---
    wanted_columns = {(tailoring_id, product_id) for tailoring_id, product_id, _ in cells}
    existing_columns = set(
        ReviewTailoringProduct.objects.filter(deleted_at__isnull=True).values_list(
            "tailoring_id", "product_id"
        )
    )
    missing_columns = sorted(wanted_columns - existing_columns)
    if missing_columns:
        ReviewTailoringProduct.objects.bulk_create(
            [
                ReviewTailoringProduct(tailoring_id=tailoring_id, product_id=product_id)
                for tailoring_id, product_id in missing_columns
            ],
            batch_size=500,
        )

    # --- 纵轴：子活动回溯到它的顶层评审 ---
    parent_of = dict(StageReviewTemplate.objects.values_list("id", "parent_id"))
    wanted_rows = {
        (tailoring_id, parent_of.get(template_id) or template_id)
        for tailoring_id, _, template_id in cells
    }
    existing_rows = set(
        ReviewTailoringTemplate.objects.filter(deleted_at__isnull=True).values_list(
            "tailoring_id", "template_id"
        )
    )
    missing_rows = sorted(wanted_rows - existing_rows)
    if missing_rows:
        ReviewTailoringTemplate.objects.bulk_create(
            [
                ReviewTailoringTemplate(
                    tailoring_id=tailoring_id, template_id=template_id
                )
                for tailoring_id, template_id in missing_rows
            ],
            batch_size=500,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0370_review_tailoring_axes"),
    ]

    operations = [
        migrations.RunPython(backfill_axes, migrations.RunPython.noop),
    ]
