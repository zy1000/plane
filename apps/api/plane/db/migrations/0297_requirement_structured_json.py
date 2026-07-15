# Generated for requirement structured storage simplification (EAV -> row + JSON)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0296_requirement_template_type"),
    ]

    operations = [
        # Row: drop the table_field FK (and its check constraint), switch to a
        # plain table_field_key UUID, and fold all field values into a JSON column.
        migrations.RemoveConstraint(
            model_name="requirementstructuredrow",
            name="requirement_structured_row_parent_table_pair",
        ),
        migrations.RemoveField(
            model_name="requirementstructuredrow",
            name="table_field",
        ),
        migrations.AddField(
            model_name="requirementstructuredrow",
            name="table_field_key",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="requirementstructuredrow",
            name="values",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddConstraint(
            model_name="requirementstructuredrow",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("parent_row__isnull", True), ("table_field_key__isnull", True)),
                    models.Q(("parent_row__isnull", False), ("table_field_key__isnull", False)),
                    _connector="OR",
                ),
                name="requirement_structured_row_parent_table_pair",
            ),
        ),
        # Drop the EAV value table (values now live on the row as JSON).
        migrations.DeleteModel(name="RequirementStructuredValue"),
        # Drop the per-revision field table (schema now stored as JSON on the revision).
        migrations.DeleteModel(name="RequirementStructuredField"),
        # Drop the template field table (schema now stored as JSON on the template).
        migrations.DeleteModel(name="RequirementTemplateField"),
        # Drop the diff entry table (diff is now computed on demand).
        migrations.DeleteModel(name="RequirementStructuredDiffEntry"),
        # Schema JSON columns.
        migrations.AddField(
            model_name="requirementfieldtemplate",
            name="schema",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="requirementstructuredrevision",
            name="schema",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
