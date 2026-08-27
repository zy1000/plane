from django.db import migrations, models


class Migration(migrations.Migration):
    """项目代号的唯一 / 非空约束。

    与 0348 拆开：0348 的回填改了 FK 列（product_manager），PG 的 deferred 外键检查会挂到事务结束，
    同一事务里再 ALTER TABLE projects 会报 "cannot ALTER TABLE because it has pending trigger events"。
    每个迁移各自一个事务，拆开就绕过去了。
    """

    dependencies = [
        ("db", "0348_project_extended_fields"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="project",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("code", "workspace"),
                name="project_unique_code_workspace_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="project",
            constraint=models.CheckConstraint(
                check=models.Q(("code", ""), _negated=True),
                name="project_code_not_blank",
            ),
        ),
    ]
