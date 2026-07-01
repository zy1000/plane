from django.db import migrations


RELEASE_SCOPE_PERMISSIONS = [
    {
        "key": "releases.cycle.manage",
        "name": "关联/取消关联发布迭代",
        "module": "releases.cycle",
        "action": "manage",
        "sort_order": 11,
    },
    {
        "key": "releases.plan.manage",
        "name": "关联/取消关联发布测试计划",
        "module": "releases.plan",
        "action": "manage",
        "sort_order": 12,
    },
]


def seed_release_scope_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    new_keys = []
    for permission in RELEASE_SCOPE_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "发布",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )
        new_keys.append(permission["key"])

    # 已经拥有发布相关权限的角色，升级后默认补齐新增的发布范围管理权限。
    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        has_release_scope = any(
            isinstance(key, str) and key.startswith("releases.")
            for key in existing_keys
        )
        if not has_release_scope:
            continue

        merged = list(dict.fromkeys(list(existing_keys) + new_keys))
        if merged != existing_keys:
            permissions["permission_keys"] = merged
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def unseed_release_scope_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    keys_to_remove = {permission["key"] for permission in RELEASE_SCOPE_PERMISSIONS}

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
        ("db", "0278_seed_qa_report_permissions"),
    ]

    operations = [
        migrations.RunPython(
            seed_release_scope_permissions, unseed_release_scope_permissions
        ),
    ]
