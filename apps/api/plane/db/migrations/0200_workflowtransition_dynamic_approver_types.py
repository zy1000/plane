from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0199_migrate_issue_state_to_issue_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="workflowtransition",
            name="dynamic_approver_types",
            field=models.JSONField(blank=True, default=list, verbose_name="动态审批人类型"),
        ),
    ]
