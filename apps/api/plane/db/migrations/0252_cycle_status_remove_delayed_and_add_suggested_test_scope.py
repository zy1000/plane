from django.db import migrations, models


def migrate_cycle_delayed_to_in_progress(apps, schema_editor):
    Cycle = apps.get_model("db", "Cycle")
    Cycle.objects.filter(status="已延期").update(status="进行中")


def noop_reverse_migration(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0251_releaseactivity_extra"),
    ]

    operations = [
        migrations.RunPython(
            migrate_cycle_delayed_to_in_progress,
            reverse_code=noop_reverse_migration,
        ),
        migrations.AlterField(
            model_name="cycle",
            name="status",
            field=models.CharField(
                blank=True,
                choices=[
                    ("未开始", "Not Started"),
                    ("进行中", "In Progress"),
                    ("已完成", "Completed"),
                    ("已取消", "Cancelled"),
                ],
                default="未开始",
                null=True,
                verbose_name="TestCase Status",
            ),
        ),
        migrations.AddField(
            model_name="cycle",
            name="suggested_test_scope",
            field=models.TextField(
                blank=True,
                null=True,
                verbose_name="Suggested Test Scope",
            ),
        ),
    ]
