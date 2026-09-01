from django.db import migrations


class Migration(migrations.Migration):
    """与 0351 拆开：RunPython 往 through 表插行后再改 test_plan_cases 表结构，避免 Postgres pending trigger 问题。"""

    dependencies = [
        ("db", "0351_plan_case_assignees"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="plancase",
            name="assignee",
        ),
    ]
