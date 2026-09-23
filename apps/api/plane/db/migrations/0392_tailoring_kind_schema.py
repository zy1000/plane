"""裁剪表加「裁剪类型」列：过程评审裁剪 / O阶段评审裁剪。默认过程，回填在 0393。"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0391_tailoring_item_origin_stage")]

    operations = [
        migrations.AddField(
            model_name="reviewtailoring",
            name="tailoring_kind",
            field=models.CharField(
                choices=[("process", "过程评审裁剪"), ("o_stage", "O阶段评审裁剪")],
                db_index=True,
                default="process",
                max_length=20,
                verbose_name="裁剪类型",
            ),
        ),
    ]
