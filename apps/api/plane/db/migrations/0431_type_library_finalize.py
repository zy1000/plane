# 工作项类型库（第三步）：研发模式视图已在 0430 挪到 IssueView.dev_mode，删掉旧的 issue_scheme 列；
# 0430 已把每个工作区的多个模式方案合并成一个类型库，此时才能加「每工作区一个类型库」的唯一约束。

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0430_type_library_consolidate"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="issueview",
            name="issue_scheme",
        ),
        migrations.AddConstraint(
            model_name="issuescheme",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("project__isnull", True)),
                fields=("workspace",),
                name="issue_scheme_one_library_per_workspace",
            ),
        ),
    ]
