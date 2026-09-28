"""O阶段评审裁剪表绑定一个项目阶段。存量 O 表不回填，``stage`` 留空、仍按全部阶段展开。"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0403_remove_stage_review_flat_columns"),
    ]

    operations = [
        migrations.AddField(
            model_name="reviewtailoring",
            name="stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="review_tailorings",
                to="db.projectstage",
                verbose_name="绑定阶段",
            ),
        ),
        migrations.AddConstraint(
            model_name="reviewtailoring",
            constraint=models.CheckConstraint(
                check=models.Q(("stage__isnull", True))
                | models.Q(("tailoring_kind", "o_stage")),
                name="rt_stage_only_for_o_stage",
            ),
        ),
    ]
