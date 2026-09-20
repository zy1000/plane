from django.db import migrations


class Migration(migrations.Migration):
    """与 0374 拆开：RunPython 读完 through 表后再删 M2M，避免 Postgres pending trigger 问题。"""

    dependencies = [
        ("db", "0374_plan_case_assignee_fk"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="plancase",
            name="assignees",
        ),
    ]
