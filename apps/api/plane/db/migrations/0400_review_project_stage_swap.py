"""PMS-101 第二期第三步：摘掉指向模式阶段的旧列，把项目阶段列改名顶上，重建索引与唯一约束。

先 ``RemoveField`` 旧列再 ``RenameField``，顺序不能反（两列同名会撞，同 0390）。
换挂之后模式阶段 ``DevModeStage`` 只剩 ``ProjectStage.source_stage``（SET_NULL）与
``DevModeStageTemplate``（CASCADE）两处引用，模式里删阶段不再被评审挡。
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0399_backfill_review_project_stage")]

    operations = [
        # --- 裁剪格子 ---------------------------------------------------
        migrations.RemoveField(model_name="reviewtailoringitem", name="stage"),
        migrations.RemoveField(model_name="reviewtailoringitem", name="origin_stage"),
        migrations.RenameField(
            model_name="reviewtailoringitem", old_name="project_stage", new_name="stage"
        ),
        migrations.RenameField(
            model_name="reviewtailoringitem",
            old_name="origin_project_stage",
            new_name="origin_stage",
        ),
        migrations.AlterField(
            model_name="reviewtailoringitem",
            name="stage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="tailoring_items",
                to="db.projectstage",
                verbose_name="项目阶段",
            ),
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
        # --- 评审实例 ---------------------------------------------------
        migrations.RemoveField(model_name="stagereview", name="stage"),
        migrations.RenameField(
            model_name="stagereview", old_name="project_stage", new_name="stage"
        ),
        migrations.AlterField(
            model_name="stagereview",
            name="stage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="stage_reviews",
                to="db.projectstage",
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
