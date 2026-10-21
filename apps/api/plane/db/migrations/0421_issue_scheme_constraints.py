"""工作项方案批次 3（一）：约束从按 project 换成按 scheme，方案列改 NOT NULL。

读写已经全部切到 scheme（docs/issue-scheme/issue-scheme-execution-plan.md 批次 3）。
本迁移之后 project 列仍在、值不变；删列在 0422，中间可以用 SQL 对照
``<表>.project_id = issue_schemes.project_id``。

方案列改 NOT NULL 前 0419 已校验过没有空值；这里再查一次，有空值直接中止，别让 ALTER 报一个看不懂的错。
"""

import django.db.models.deletion
from django.db import migrations, models

TABLES = ("issue_types", "type_extra_fields", "states", "workflows", "workflow_transitions")


def assert_no_null_scheme(apps, schema_editor):
    missing = {}
    with schema_editor.connection.cursor() as cursor:
        for table in TABLES:
            cursor.execute(f"SELECT count(*) FROM {table} WHERE scheme_id IS NULL")
            missing[table] = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM projects WHERE issue_scheme_id IS NULL")
        missing["projects"] = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM dev_modes WHERE issue_scheme_id IS NULL")
        missing["dev_modes"] = cursor.fetchone()[0]
        for table in TABLES:
            cursor.execute(
                f"SELECT count(*) FROM {table} t JOIN issue_schemes s ON s.id = t.scheme_id "
                f"WHERE s.project_id IS DISTINCT FROM t.project_id"
            )
            mismatched = cursor.fetchone()[0]
            if mismatched:
                missing[f"{table}(scheme 不归本行项目)"] = mismatched
    bad = {k: v for k, v in missing.items() if v}
    if bad:
        raise RuntimeError(f"方案列有空值或与 project 不一致，中止：{bad}")


def scheme_fk(related_name):
    return models.ForeignKey(
        on_delete=django.db.models.deletion.CASCADE, related_name=related_name, to="db.issuescheme"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0420_issue_type_system_key"),
    ]

    operations = [
        migrations.RunPython(assert_no_null_scheme, migrations.RunPython.noop),
        # ---- 旧约束（按 project） ----
        migrations.RemoveConstraint(model_name="issuetype", name="issue_type_unique_project_name_when_deleted_at_null"),
        migrations.RemoveConstraint(model_name="issuetype", name="issue_type_unique_project_system_key"),
        migrations.RemoveConstraint(model_name="state", name="state_unique_name_project_when_deleted_at_null"),
        migrations.RemoveConstraint(model_name="typeextrafield", name="type_extra_field_unique_name_active"),
        migrations.RemoveConstraint(model_name="workflow", name="workflow_unique_active_per_project_issue_type"),
        # ---- 方案列 NOT NULL ----
        migrations.AlterField(model_name="issuetype", name="scheme", field=scheme_fk("issue_types")),
        migrations.AlterField(model_name="typeextrafield", name="scheme", field=scheme_fk("extra_fields")),
        migrations.AlterField(model_name="state", name="scheme", field=scheme_fk("states")),
        migrations.AlterField(model_name="workflow", name="scheme", field=scheme_fk("workflows")),
        migrations.AlterField(model_name="workflowtransition", name="scheme", field=scheme_fk("workflow_transitions")),
        migrations.AlterField(
            model_name="devmode",
            name="issue_scheme",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="dev_modes",
                to="db.issuescheme",
                verbose_name="工作项方案",
            ),
        ),
        migrations.AlterField(
            model_name="project",
            name="issue_scheme",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects",
                to="db.issuescheme",
                verbose_name="工作项方案",
            ),
        ),
        # ---- 新约束（按 scheme） ----
        migrations.AlterUniqueTogether(name="issuetype", unique_together={("scheme", "name", "deleted_at")}),
        migrations.AlterUniqueTogether(name="state", unique_together={("name", "issue_type", "scheme", "deleted_at")}),
        migrations.AddConstraint(
            model_name="issuetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("scheme", "name"),
                name="issue_type_unique_scheme_name_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="issuetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("system_key__isnull", False)),
                fields=("scheme", "system_key"),
                name="issue_type_unique_scheme_system_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="state",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("name", "issue_type", "scheme"),
                name="state_unique_name_scheme_when_deleted_at_null",
            ),
        ),
        migrations.AddConstraint(
            model_name="typeextrafield",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("scheme", "issue_type", "name"),
                name="type_extra_field_unique_scheme_name_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="workflow",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("is_active", True)),
                fields=("scheme", "issue_type"),
                name="workflow_unique_active_per_scheme_issue_type",
            ),
        ),
    ]
