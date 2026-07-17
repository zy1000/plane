from django.db import migrations


# workspace.role.import_to_project 没有实际作用：真正的“导入工作区角色模板到项目角色”
# 由项目级接口 ProjectRoleImportAPIView 承载并复用 project.role.create，
# 该 key 未被任何视图引用，故直接下线。
IMPORT_TO_PROJECT_KEY = "workspace.role.import_to_project"

WORKSPACE_ROLE_TYPE = "workspace"


def _remove_permissions_from_roles(RoleModel, permission_keys_to_remove, filters=None):
    permission_key_set = set(permission_keys_to_remove)
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue
        next_permission_keys = [key for key in permission_keys if key not in permission_key_set]
        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def forward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(
        WorkspaceRole,
        [IMPORT_TO_PROJECT_KEY],
        {"type": WORKSPACE_ROLE_TYPE},
    )
    Permission.objects.filter(key=IMPORT_TO_PROJECT_KEY).delete()


def backward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")

    # 角色绑定无法精确还原，仅恢复 Permission 定义。
    Permission.objects.update_or_create(
        key=IMPORT_TO_PROJECT_KEY,
        defaults={
            "name": "将工作区角色模板导入项目角色",
            "description": "将工作区角色模板导入项目角色",
            "scope": "workspace",
            "module": "role",
            "action": "import_to_project",
            "category": "角色模板",
            "sort_order": 6,
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0288_fix_workspace_permission_consistency"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
