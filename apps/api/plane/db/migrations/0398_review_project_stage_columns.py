"""PMS-101 第二期第一步：给评审实例与裁剪格子各加一列指向**项目阶段**的可空外键。

评审这条线从「项目研发模式的阶段 DevModeStage」换挂到「项目自己的阶段 ProjectStage」。
FK 换目标表不能一条 AlterField 直接换：Django 会先 DROP 旧外键约束再 ADD 新约束，新约束
建立时 Postgres 校验存量值，而列里全是模式阶段 id，立即失败。照 0388 → 0389 → 0390 的
三步：加临时列 → 回填 → 摘旧列改名。

带 ``stage`` 的索引 / 唯一约束要换列，先摘掉，``0400`` 按新列重建。
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0397_delete_milestone")]

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
            name="project_stage",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="tailoring_items",
                to="db.projectstage",
                verbose_name="项目阶段",
            ),
        ),
        migrations.AddField(
            model_name="reviewtailoringitem",
            name="origin_project_stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="moved_tailoring_items",
                to="db.projectstage",
                verbose_name="移动前的项目阶段",
            ),
        ),
        # --- 评审实例 ---------------------------------------------------
        migrations.RemoveIndex(
            model_name="stagereview",
            name="sr_project_product_stage",
        ),
        migrations.AddField(
            model_name="stagereview",
            name="project_stage",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="stage_reviews",
                to="db.projectstage",
                verbose_name="评审阶段",
            ),
        ),
    ]
