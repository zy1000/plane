"""批次 4 第三步：两列改 NOT NULL，评审实例换掉旧的字典值外键，重建索引与唯一约束。

``StageReview`` 上先删旧 ``stage``（指向 ``product_stage`` 字典值）再把 ``dev_stage``
改名成 ``stage`` —— 顺序不能反，两列同名会撞。改完之后 ``product_stage`` 字典就只剩
产品档案「当前阶段」这一个消费方了。

裁剪格子的唯一约束从 ``(tailoring, product, template)`` 变成
``(tailoring, product, stage, template)``：同一个模板节点在两个同类型的模式阶段下各占
一行，不算重复。
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0389_backfill_dev_stage")]

    operations = [
        # --- 裁剪格子 ---------------------------------------------------
        migrations.AlterField(
            model_name="reviewtailoringitem",
            name="stage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="tailoring_items",
                to="db.devmodestage",
                verbose_name="模式阶段",
            ),
        ),
        migrations.AlterModelOptions(
            name="reviewtailoringitem",
            options={
                "ordering": (
                    "stage__sort_order",
                    "template__sort_order",
                    "product__name",
                    "id",
                ),
                "verbose_name": "Review Tailoring Item",
                "verbose_name_plural": "Review Tailoring Items",
            },
        ),
        migrations.AddIndex(
            model_name="reviewtailoringitem",
            index=models.Index(
                fields=["tailoring", "product", "stage"], name="rti_tailoring_product"
            ),
        ),
        migrations.AddConstraint(
            model_name="reviewtailoringitem",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tailoring", "product", "stage", "template"),
                name="rti_unique_tailoring_product_template_active",
            ),
        ),
        # --- 评审实例：旧列走人，新列顶上 -------------------------------
        migrations.RemoveField(model_name="stagereview", name="stage"),
        migrations.RenameField(
            model_name="stagereview", old_name="dev_stage", new_name="stage"
        ),
        migrations.AlterField(
            model_name="stagereview",
            name="stage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="stage_reviews",
                to="db.devmodestage",
                verbose_name="评审阶段",
            ),
        ),
        migrations.AddIndex(
            model_name="stagereview",
            index=models.Index(
                fields=["project", "product", "stage"], name="sr_project_product_stage"
            ),
        ),
    ]
