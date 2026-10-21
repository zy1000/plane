"""工作项方案批次 3（二）：五张表删 project 列，改继承 SchemeBaseModel（workspace + scheme）。

不留可空的过渡态：留着就是第二个事实来源，必然有人继续按它查；批次 4 跟随上线后有项目
指向模式方案，靠这一列也退不回去。

写成可回退的三段：先改可空 → （回退时从 scheme.project_id 反填）→ 删列。回退只在批次 4
之前有意义：模式方案的行没有项目，反填后仍为空，改回 NOT NULL 会失败。
"""

import django.db.models.deletion
from django.db import migrations, models

MODELS = {
    "issuetype": "issue_types",
    "typeextrafield": "type_extra_fields",
    "state": "states",
    "workflow": "workflows",
    "workflowtransition": "workflow_transitions",
}


def refill_project(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table in MODELS.values():
            cursor.execute(
                f"UPDATE {table} t SET project_id = s.project_id FROM issue_schemes s "
                f"WHERE s.id = t.scheme_id AND t.project_id IS NULL"
            )


def nullable_project_fk():
    return models.ForeignKey(
        null=True,
        on_delete=django.db.models.deletion.CASCADE,
        related_name="project_%(class)s",
        to="db.project",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0421_issue_scheme_constraints"),
    ]

    operations = (
        [
            migrations.AlterField(model_name=model, name="project", field=nullable_project_fk())
            for model in MODELS
        ]
        + [migrations.RunPython(migrations.RunPython.noop, refill_project)]
        + [migrations.RemoveField(model_name=model, name="project") for model in MODELS]
    )
