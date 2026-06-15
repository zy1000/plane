from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0270_sync_default_bug_workflow_rules"),
    ]

    operations = [
        migrations.AddField(
            model_name="cycle",
            name="test_handoff_date",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Test Handoff Date"),
        ),
        migrations.AddField(
            model_name="cycleoverduerecord",
            name="phase",
            field=models.CharField(
                choices=[("dev", "研发延期"), ("test", "测试延期")],
                default="test",
                max_length=8,
            ),
            preserve_default=False,
        ),
        migrations.RemoveConstraint(
            model_name="cycleoverduerecord",
            name="cycle_overdue_record_unique_active",
        ),
        migrations.AddConstraint(
            model_name="cycleoverduerecord",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("ended_at__isnull", True)),
                fields=("cycle", "phase"),
                name="cycle_overdue_record_unique_active_per_phase",
            ),
        ),
    ]
