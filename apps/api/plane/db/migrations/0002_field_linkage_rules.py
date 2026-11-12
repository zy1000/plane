# 字段联动改成规则列表：每种效果由「一个来源字段」变成多条规则，每条规则可带多个条件。
#
#   {"visibility": {"field_id": A, "values": [...]}}
#     → {"visibility": {"rules": [{"conditions": [{"field_id": A, "values": [...]}]}]}}
#   {"options": {"field_id": A, "mappings": {"x": [...], "y": [...]}}}
#     → {"options": {"rules": [{"conditions": [{"field_id": A, "values": ["x"]}], "options": [...]}, ...]}}
#
# 语义不变：原来每个来源值的映射各成一条规则，多选来源命中多条时仍取并集。

from django.db import migrations


def upgrade_linkage(linkage):
    if not isinstance(linkage, dict):
        return {}
    result = {}
    visibility = linkage.get("visibility")
    if isinstance(visibility, dict):
        if "rules" in visibility:
            result["visibility"] = visibility
        elif visibility.get("field_id") and visibility.get("values"):
            result["visibility"] = {
                "rules": [{"conditions": [{"field_id": visibility["field_id"], "values": list(visibility["values"])}]}]
            }
    options = linkage.get("options")
    if isinstance(options, dict):
        if "rules" in options:
            result["options"] = options
        elif options.get("field_id") and isinstance(options.get("mappings"), dict) and options["mappings"]:
            result["options"] = {
                "rules": [
                    {"conditions": [{"field_id": options["field_id"], "values": [key]}], "options": list(targets or [])}
                    for key, targets in options["mappings"].items()
                ]
            }
    return result


def forwards(apps, schema_editor):
    for model_name in ("IssueFieldDefinition", "TypeExtraField"):
        # 软删的行一起转，恢复后不带旧结构
        manager = apps.get_model("db", model_name)._base_manager
        for pk, linkage in manager.exclude(linkage={}).values_list("pk", "linkage"):
            upgraded = upgrade_linkage(linkage)
            if upgraded != linkage:
                manager.filter(pk=pk).update(linkage=upgraded)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0001_squashed_0447_issue_type_field_layout"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
