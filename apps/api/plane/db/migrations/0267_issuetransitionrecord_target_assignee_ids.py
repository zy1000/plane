from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0266_workflowtransitionprincipal_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="issuetransitionrecord",
            name="target_assignee_ids",
            field=models.JSONField(
                blank=True,
                null=True,
                verbose_name="目标负责人ID列表",
            ),
        ),
    ]
