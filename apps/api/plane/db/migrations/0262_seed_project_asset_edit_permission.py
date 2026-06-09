from django.db import migrations


PROJECT_ASSET_EDIT_PERMISSION = {
    "key": "project.asset.edit",
    "name": "编辑项目资产",
    "scope": "project",
    "module": "project.asset",
    "action": "edit",
    "category": "项目资产",
    "sort_order": 3,
    "is_active": True,
}


def seed_project_asset_edit_permission(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    Permission.objects.update_or_create(
        key=PROJECT_ASSET_EDIT_PERMISSION["key"],
        defaults={
            "name": PROJECT_ASSET_EDIT_PERMISSION["name"],
            "description": PROJECT_ASSET_EDIT_PERMISSION["name"],
            "scope": PROJECT_ASSET_EDIT_PERMISSION["scope"],
            "module": PROJECT_ASSET_EDIT_PERMISSION["module"],
            "action": PROJECT_ASSET_EDIT_PERMISSION["action"],
            "category": PROJECT_ASSET_EDIT_PERMISSION["category"],
            "sort_order": PROJECT_ASSET_EDIT_PERMISSION["sort_order"],
            "is_active": PROJECT_ASSET_EDIT_PERMISSION["is_active"],
        },
    )

    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        has_project_asset_scope = any(
            isinstance(key, str) and key.startswith("project.asset.")
            for key in existing_keys
        )
        if not has_project_asset_scope:
            continue

        merged = list(
            dict.fromkeys(list(existing_keys) + [PROJECT_ASSET_EDIT_PERMISSION["key"]])
        )
        if merged != existing_keys:
            permissions["permission_keys"] = merged
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def unseed_project_asset_edit_permission(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        filtered_keys = [
            key for key in existing_keys if key != PROJECT_ASSET_EDIT_PERMISSION["key"]
        ]
        if filtered_keys != existing_keys:
            permissions["permission_keys"] = filtered_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])

    Permission.objects.filter(key=PROJECT_ASSET_EDIT_PERMISSION["key"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0261_project_product_type"),
    ]

    operations = [
        migrations.RunPython(
            seed_project_asset_edit_permission,
            unseed_project_asset_edit_permission,
        ),
    ]
