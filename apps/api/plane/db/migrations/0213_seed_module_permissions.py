from django.db import migrations


PERMISSION_ROWS = """
modules.view|查看模块列表与详情|project|modules|view|模块|1|1
modules.create|创建模块|project|modules|create|模块|2|1
modules.edit|编辑模块|project|modules|edit|模块|3|1
modules.delete|删除模块|project|modules|delete|模块|4|1
modules.issue.manage|添加、调整、移除模块工作项|project|modules.issue|manage|模块|5|1
modules.archive|归档/恢复模块|project|modules|archive|模块|6|1
""".strip().splitlines()


def parse_permission_rows():
    permissions = []
    for row in PERMISSION_ROWS:
        key, name, scope, module, action, category, sort_order, is_active_str = row.split(
            "|"
        )
        permissions.append(
            {
                "key": key,
                "name": name,
                "description": name,
                "scope": scope,
                "module": module,
                "action": action,
                "category": category,
                "sort_order": int(sort_order),
                "is_active": is_active_str.strip() == "1",
            }
        )
    return permissions


def seed_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")

    for permission in parse_permission_rows():
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["description"],
                "scope": permission["scope"],
                "module": permission["module"],
                "action": permission["action"],
                "category": permission["category"],
                "sort_order": permission["sort_order"],
                "is_active": permission["is_active"],
            },
        )


def unseed_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(
        key__in=[permission["key"] for permission in parse_permission_rows()]
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0212_create_release_models_and_migrate_data"),
    ]

    operations = [
        migrations.RunPython(seed_permissions, unseed_permissions),
    ]
