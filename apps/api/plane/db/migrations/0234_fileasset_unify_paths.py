"""为统一 MinIO 上传路径方案扩展 FileAsset。

新增 cycle / release / plan_case_record 外键，作为重构 Cycle/Release/PlanCaseRecord
附件到 FileAsset 体系的承载字段。entity_type 字段无需迁移：在模型层
TextChoices 增加新选项即可，DB 列已是 CharField(max_length=255)。
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0233_backfill_default_bug_extra_field_values"),
    ]

    operations = [
        migrations.AddField(
            model_name="fileasset",
            name="cycle",
            field=models.ForeignKey(
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="assets",
                to="db.cycle",
            ),
        ),
        migrations.AddField(
            model_name="fileasset",
            name="release",
            field=models.ForeignKey(
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="assets",
                to="db.release",
            ),
        ),
        migrations.AddField(
            model_name="fileasset",
            name="plan_case_record",
            field=models.ForeignKey(
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="assets",
                to="db.plancaserecord",
            ),
        ),
    ]
