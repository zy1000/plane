from django.db import migrations


class Migration(migrations.Migration):
    """与 0406 拆开：RunPython 读完 leader / auditor 列后再删列。"""

    dependencies = [
        ("db", "0406_stage_review_multi_owners"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="stagereview",
            name="leader",
        ),
        migrations.RemoveField(
            model_name="stagereview",
            name="auditor",
        ),
    ]
