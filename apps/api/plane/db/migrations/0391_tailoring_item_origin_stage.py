"""批次 5：裁剪格子记「挪来之前的阶段」，评审活动可以在项目模式的阶段之间移动。"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0390_stage_swap")]

    operations = [
        migrations.AddField(
            model_name="reviewtailoringitem",
            name="origin_stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="moved_tailoring_items",
                to="db.devmodestage",
                verbose_name="移动前的模式阶段",
            ),
        ),
    ]
