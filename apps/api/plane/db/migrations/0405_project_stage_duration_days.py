"""项目阶段加「周期（天）」。

周期按自然日、首尾都算（开始 = 结束是 1 天）。起止都有的存量行回填；只有一端或都为空的
留空，等用户补上开始时间后由 ``resolve_schedule`` 推导。
"""

from django.db import migrations, models


def backfill_duration_days(apps, schema_editor):
    ProjectStage = apps.get_model("db", "ProjectStage")
    rows = []
    for stage in ProjectStage.objects.filter(
        start_date__isnull=False, end_date__isnull=False
    ).only("id", "start_date", "end_date"):
        if stage.end_date < stage.start_date:
            continue
        stage.duration_days = (stage.end_date - stage.start_date).days + 1
        rows.append(stage)
    ProjectStage.objects.bulk_update(rows, ["duration_days"], batch_size=500)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0404_review_tailoring_stage"),
    ]

    operations = [
        migrations.AddField(
            model_name="projectstage",
            name="duration_days",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="周期（天）"),
        ),
        migrations.RunPython(backfill_duration_days, migrations.RunPython.noop),
    ]
