"""批次 4 第一步：给裁剪格子和评审实例各加一列指向模式阶段的可空外键。

这一批把「阶段」的含义从**评审树上的阶段类型**换成**项目研发模式里的阶段**：

- ``ReviewTailoringItem`` 本来没有阶段列（靠 ``template.stage`` 折出来），这里新增
  ``stage``；
- ``StageReview.stage`` 本来指向 ``product_stage`` 字典值，这里先加一列 ``dev_stage``，
  ``0390`` 再删旧列并改名，避免同一列在一次迁移里换指向。

三处索引 / 唯一约束里带了 ``stage``，回填期间会短暂出现「同一 (表, 产品, 节点) 两行」
的中间态（其实不会，0389 是纯 UPDATE），但唯一约束本身要换列，所以先摘掉，``0390``
按新列重建。
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0387_project_dev_mode")]

    operations = [
        # --- 裁剪格子 ---------------------------------------------------
        migrations.RemoveIndex(
            model_name="reviewtailoringitem",
            name="rti_tailoring_product",
        ),
        migrations.RemoveConstraint(
            model_name="reviewtailoringitem",
            name="rti_unique_tailoring_product_template_active",
        ),
        migrations.AddField(
            model_name="reviewtailoringitem",
            name="stage",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="tailoring_items",
                to="db.devmodestage",
                verbose_name="模式阶段",
            ),
        ),
        # --- 评审实例 ---------------------------------------------------
        migrations.RemoveIndex(
            model_name="stagereview",
            name="sr_project_product_stage",
        ),
        migrations.AddField(
            model_name="stagereview",
            name="dev_stage",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="stage_reviews",
                to="db.devmodestage",
                verbose_name="评审阶段",
            ),
        ),
    ]
