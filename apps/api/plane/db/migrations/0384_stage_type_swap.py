import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """三步换列的最后一步：删掉指向字典值的旧 stage 列，把 stage_type 改名顶上。

    唯一约束与索引都建在 stage_id 上，删列会连带它们一起消失，所以先显式摘掉、改完再
    按原名装回去 —— 名字不变，别的地方引用这两个名字的地方不用动。
    """

    dependencies = [("db", "0383_backfill_stage_type")]

    operations = [
        migrations.RemoveConstraint(
            model_name="stagereviewtemplate",
            name="srt_unique_stage_title_active",
        ),
        migrations.RemoveIndex(
            model_name="stagereviewtemplate",
            name="srt_workspace_stage",
        ),
        migrations.RemoveField(
            model_name="stagereviewtemplate",
            name="stage",
        ),
        migrations.RenameField(
            model_name="stagereviewtemplate",
            old_name="stage_type",
            new_name="stage",
        ),
        migrations.AlterField(
            model_name="stagereviewtemplate",
            name="stage",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="review_templates",
                to="db.stagetype",
                verbose_name="阶段",
            ),
        ),
        migrations.AddIndex(
            model_name="stagereviewtemplate",
            index=models.Index(
                fields=["workspace", "stage"], name="srt_workspace_stage"
            ),
        ),
        migrations.AddConstraint(
            model_name="stagereviewtemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("deleted_at__isnull", True), ("parent__isnull", True)
                ),
                fields=("workspace", "stage", "title"),
                name="srt_unique_stage_title_active",
            ),
        ),
    ]
