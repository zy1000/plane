from django.db import migrations


# 模板中心（需求标准库 + 用例模板库）的工作区级权限。
# 与 permission_bootstrap.PERMISSION_OVERRIDES 里的定义保持一致，改一处要同步另一处。
TEMPLATE_PERMISSIONS = [
    {
        "key": "workspace.requirement_library.view",
        "name": "查看需求标准库",
        "description": "查看标准库列表与库内条目",
        "module": "requirement_library",
        "action": "view",
        "category": "需求标准库",
        "sort_order": 1,
    },
    {
        "key": "workspace.requirement_library.manage",
        "name": "维护需求标准库",
        "description": "新建/编辑/删除标准库，维护库内条目与模块树",
        "module": "requirement_library",
        "action": "manage",
        "category": "需求标准库",
        "sort_order": 2,
    },
    {
        "key": "workspace.requirement_library.import_export",
        "name": "导入/导出标准库条目",
        "description": "Excel 导出库内条目；导入还需要「维护需求标准库」",
        "module": "requirement_library",
        "action": "import_export",
        "category": "需求标准库",
        "sort_order": 3,
    },
    {
        "key": "workspace.case_template.view",
        "name": "查看用例模板库",
        "description": "查看模板库列表与模板用例，并从模板导入到项目用例库",
        "module": "case_template",
        "action": "view",
        "category": "用例模板库",
        "sort_order": 1,
    },
    {
        "key": "workspace.case_template.manage",
        "name": "维护用例模板库",
        "description": "新建/编辑/删除模板库，维护模板用例与模块、标签",
        "module": "case_template",
        "action": "manage",
        "category": "用例模板库",
        "sort_order": 2,
    },
    {
        "key": "workspace.case_template.import_export",
        "name": "导入/导出模板用例",
        "description": "导出模板用例；导入还需要「维护用例模板库」",
        "module": "case_template",
        "action": "import_export",
        "category": "用例模板库",
        "sort_order": 3,
    },
]

ALL_KEYS = [item["key"] for item in TEMPLATE_PERMISSIONS]

WORKSPACE_ROLE_TYPE = "workspace"

# 回填口径（2026-09-07 用户拍板「只给管理员」）：只有管理员类角色拿到新 key。
# 判定用「删除工作区」——它是管理员独有的一项，比 settings.edit 干净
# （实测某工作区的「成员」角色也持有 settings.edit）。
# 工作区 owner / 实例管理员在 _get_user_workspace_permission_keys 里直通全部
# workspace key，不需要也不受回填影响。
ADMIN_MARKER_KEY = "workspace.settings.delete"


def _role_permission_keys(role):
    permissions = role.permissions if isinstance(role.permissions, dict) else {}
    permission_keys = permissions.get("permission_keys")
    return permission_keys if isinstance(permission_keys, list) else None


def forward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    for item in TEMPLATE_PERMISSIONS:
        defaults = {key: value for key, value in item.items() if key != "key"}
        Permission.objects.update_or_create(
            key=item["key"],
            defaults={
                **defaults,
                "scope": "workspace",
                "is_active": True,
                # 软删过的同名行要复活，否则唯一键会挡住插入
                "deleted_at": None,
            },
        )

    for role in WorkspaceRole.objects.filter(type=WORKSPACE_ROLE_TYPE):
        permission_keys = _role_permission_keys(role)
        if permission_keys is None or ADMIN_MARKER_KEY not in permission_keys:
            continue
        next_permission_keys = list(permission_keys)
        for key in ALL_KEYS:
            if key not in next_permission_keys:
                next_permission_keys.append(key)
        if next_permission_keys != permission_keys:
            permissions = role.permissions if isinstance(role.permissions, dict) else {}
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def backward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    key_set = set(ALL_KEYS)
    for role in WorkspaceRole.objects.filter(type=WORKSPACE_ROLE_TYPE):
        permission_keys = _role_permission_keys(role)
        if permission_keys is None:
            continue
        next_permission_keys = [key for key in permission_keys if key not in key_set]
        if next_permission_keys != permission_keys:
            permissions = role.permissions if isinstance(role.permissions, dict) else {}
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])

    Permission.objects.filter(key__in=ALL_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0358_backfill_product_default_roles"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
