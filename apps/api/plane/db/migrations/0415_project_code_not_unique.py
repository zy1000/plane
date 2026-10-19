"""项目代号允许在工作区内重复：简道云一个项目代号下挂多个研发项目（研发项目同步按编号建项目）。"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0414_rename_default_dev_mode"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="project",
            name="project_unique_code_workspace_when_deleted_at_null",
        ),
    ]
