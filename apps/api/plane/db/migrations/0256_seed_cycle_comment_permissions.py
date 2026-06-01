from django.db import migrations


CYCLE_COMMENT_PERMISSIONS = [
    {
        "key": "sprints.comment.create",
        "name": "创建迭代评论",
        "action": "create",
        "sort_order": 7,
    },
]


def seed_cycle_comment_permissions(apps, schema_editor):
    """新增 sprints.comment.create 权限并补齐到已有的 ProjectRole 中。"""
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    new_keys = []
    for permission in CYCLE_COMMENT_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": "sprints.comment",
                "action": permission["action"],
                "category": "迭代",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )
        new_keys.append(permission["key"])

    # 把新增 key 补齐到已有的、本来就拥有 sprints.* 权限的 ProjectRole 中，
    # 让既有项目成员可以直接使用迭代评论能力。
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


def unseed_cycle_comment_permissions(apps, schema_editor):
    """反向：移除新增权限定义，并把 ProjectRole 中的对应 key 清掉。"""
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    keys_to_remove = {permission["key"] for permission in CYCLE_COMMENT_PERMISSIONS}

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
        ("db", "0255_filesasset_cycle_comment"),
    ]

    operations = [
        migrations.RunPython(
            seed_cycle_comment_permissions,
            unseed_cycle_comment_permissions,
        ),
    ]
