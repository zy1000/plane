from django.db import migrations


# 与 permission_bootstrap.PERMISSION_OVERRIDES 里的定义保持一致，改一处要同步另一处。
NAMES = {
    "project.review_tailoring.view": ("查看裁剪表", "查看评审裁剪"),
    "project.review_tailoring.manage": ("维护裁剪表", "维护评审裁剪"),
}


def _rename(apps, new):
    Permission = apps.get_model("db", "Permission")
    for key, (new_name, old_name) in NAMES.items():
        Permission.objects.filter(key=key).update(
            name=new_name if new else old_name,
            category="裁剪表" if new else "评审裁剪",
        )


def rename_permissions(apps, schema_editor):
    _rename(apps, new=True)


def restore_permissions(apps, schema_editor):
    _rename(apps, new=False)


class Migration(migrations.Migration):
    """菜单「评审裁剪」改名「裁剪表」，角色编辑器里的权限名称跟着改。

    bootstrap 只补缺失的行、不改已有行，所以已落库的名称要靠这条迁移更新。
    """

    dependencies = [("db", "0371_backfill_review_tailoring_axes")]

    operations = [
        migrations.RunPython(rename_permissions, restore_permissions),
    ]
