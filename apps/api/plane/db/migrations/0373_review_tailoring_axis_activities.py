"""纵轴从「只存顶层评审、活动读时跟着展开」改成「评审与活动各占一行、各自独立」。

老表里跟着父评审展开进来的活动只有格子、没有纵轴行。不补的话，下次开始修订时
``sync_items`` 会把它们当成掉出纵轴的格子硬删掉。所以按格子里出现过、纵轴上却没有的
模板节点，给每张表补齐纵轴行。只增不删，反向迁移什么也不做。
"""

from django.db import migrations


def add_activity_axis_rows(apps, schema_editor):
    ReviewTailoringItem = apps.get_model("db", "ReviewTailoringItem")
    ReviewTailoringTemplate = apps.get_model("db", "ReviewTailoringTemplate")

    existing = set(
        ReviewTailoringTemplate.objects.filter(deleted_at__isnull=True).values_list(
            "tailoring_id", "template_id"
        )
    )
    # 同一 (表, 节点) 取最早那条格子的创建人当纵轴行的创建人
    owners = {}
    cells = (
        ReviewTailoringItem.objects.filter(deleted_at__isnull=True)
        .order_by("created_at")
        .values_list("tailoring_id", "template_id", "created_by_id")
    )
    for tailoring_id, template_id, created_by_id in cells:
        key = (tailoring_id, template_id)
        if key in existing or key in owners:
            continue
        owners[key] = created_by_id

    ReviewTailoringTemplate.objects.bulk_create(
        [
            ReviewTailoringTemplate(
                tailoring_id=tailoring_id,
                template_id=template_id,
                created_by_id=created_by_id,
                updated_by_id=created_by_id,
            )
            for (tailoring_id, template_id), created_by_id in owners.items()
        ],
        batch_size=500,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0372_rename_review_tailoring_permissions"),
    ]

    operations = [
        migrations.RunPython(add_activity_axis_rows, migrations.RunPython.noop),
    ]
