from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    """评审模板标准编号工作区内唯一（活跃行）。0409 回填完再加，避免同事务里先改行后建索引。"""

    dependencies = [
        ("db", "0409_stage_review_standard_code"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="stagereviewtemplate",
            constraint=models.UniqueConstraint(
                condition=Q(deleted_at__isnull=True),
                fields=("workspace", "standard_code"),
                name="srt_unique_workspace_code_active",
            ),
        ),
    ]
