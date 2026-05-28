from django.db import migrations


STALE_PERMISSION_KEYS = [
    "releases.comment.edit",
    "releases.comment.delete",
]


def drop_stale_release_comment_permissions(apps, schema_editor):
    """删除 releases.comment.edit / releases.comment.delete 两条权限。

    业务调整：发布评论不再支持编辑，删除权限改由「评论作者本人」内置约束控制，
    不再依赖项目角色权限，所以从权限表与各 ProjectRole 中一并清理。
    """
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")

    for role in ProjectRole.objects.all():
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        filtered = [key for key in existing_keys if key not in STALE_PERMISSION_KEYS]
        if filtered != existing_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])

    Permission.objects.filter(key__in=STALE_PERMISSION_KEYS).delete()


def noop_reverse(apps, schema_editor):
    """回滚为 no-op：edit/delete 权限本身在新版本里没有任何使用入口，
    历史 dump 也不会再依赖它们；如需恢复请直接重新跑 0205/0247 seed。
    """
    return


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0248_filesasset_release_comment"),
    ]

    operations = [
        migrations.RunPython(
            drop_stale_release_comment_permissions, noop_reverse
        ),
    ]
