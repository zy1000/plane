from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def clear_legacy_overdue_records(apps, schema_editor):
    CycleOverdueRecord = apps.get_model("db", "CycleOverdueRecord")
    ReleaseOverdueRecord = apps.get_model("db", "ReleaseOverdueRecord")

    CycleOverdueRecord.objects.all().delete()
    ReleaseOverdueRecord.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0271_cycle_test_handoff_date_and_overdue_phase"),
    ]

    operations = [
        migrations.AddField(
            model_name="cycleoverduerecord",
            name="snapshot_owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="%(class)s_snapshot_owner",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="cycleoverduerecord",
            name="snapshot_status",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="releaseoverduerecord",
            name="snapshot_owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="%(class)s_snapshot_owner",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="releaseoverduerecord",
            name="snapshot_status",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.RunPython(
            clear_legacy_overdue_records,
            migrations.RunPython.noop,
        ),
    ]
