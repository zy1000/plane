from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0280_seed_cycle_plan_permission"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuetransitionrecord",
            name="approval_reason",
            field=models.TextField(
                blank=True,
                default="",
                verbose_name="状态变更原因",
            ),
        ),
    ]
