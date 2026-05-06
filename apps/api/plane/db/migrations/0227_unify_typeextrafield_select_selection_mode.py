# Generated migration: 统一 select / multi_select 字段类型

from django.db import migrations, models


def migrate_multi_select_to_select(apps, schema_editor):
    """将旧的 multi_select 行迁移为 select + options.selection_mode='multiple'。"""
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    queryset = TypeExtraField.objects.filter(field_type="multi_select")
    for field in queryset:
        options = field.options if isinstance(field.options, dict) else {}
        options["selection_mode"] = "multiple"
        field.options = options
        field.field_type = "select"
        field.save(update_fields=["options", "field_type"])


def reverse_select_multi_to_multi_select(apps, schema_editor):
    """反向迁移：把 select + selection_mode=multiple 拆回 multi_select，便于回滚。"""
    TypeExtraField = apps.get_model("db", "TypeExtraField")
    queryset = TypeExtraField.objects.filter(field_type="select")
    for field in queryset:
        options = field.options if isinstance(field.options, dict) else {}
        if options.get("selection_mode") == "multiple":
            options.pop("selection_mode", None)
            field.options = options
            field.field_type = "multi_select"
            field.save(update_fields=["options", "field_type"])


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0226_typeextrafield_type_extra_field_unique_name_active"),
    ]

    operations = [
        migrations.RunPython(
            migrate_multi_select_to_select,
            reverse_select_multi_to_multi_select,
        ),
        migrations.AlterField(
            model_name="typeextrafield",
            name="field_type",
            field=models.CharField(
                choices=[
                    ("text", "Text"),
                    ("number", "Number"),
                    ("date", "Date"),
                    ("boolean", "Boolean"),
                    ("select", "Select"),
                    ("user", "User"),
                ],
                default="text",
                max_length=30,
            ),
        ),
    ]
