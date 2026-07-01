from django.db import migrations


CYCLE_PLAN_PERMISSIONS = [
    {
        "key": "sprints.plan.manage",
        "name": "关联/取消关联迭代测试计划",
        "module": "sprints.plan",
        "action": "manage",
        "sort_order": 11,
    },
]


def seed_cycle_plan_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    new_keys = []
    for permission in CYCLE_PLAN_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "迭代",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )
        new_keys.append(permission["key"])

    # 已经拥有迭代相关权限的角色，升级后默认补齐新增的迭代测试计划关联权限。
    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        has_sprint_scope = any(
            isinstance(key, str) and key.startswith("sprints.")
            for key in existing_keys
        )
        if not has_sprint_scope:
            continue

        merged = list(dict.fromkeys(list(existing_keys) + new_keys))
        if merged != existing_keys:
            permissions["permission_keys"] = merged
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def unseed_cycle_plan_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    keys_to_remove = {permission["key"] for permission in CYCLE_PLAN_PERMISSIONS}

    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        filtered = [key for key in existing_keys if key not in keys_to_remove]
        if filtered != existing_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])

    Permission.objects.filter(key__in=keys_to_remove).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0279_seed_release_cycle_plan_permissions"),
    ]

    operations = [
        migrations.RunPython(
            seed_cycle_plan_permissions, unseed_cycle_plan_permissions
        ),
    ]
