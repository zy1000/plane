from django.db import migrations


# 评审模板库的工作区级权限。
# 与 permission_bootstrap.PERMISSION_OVERRIDES 里的定义保持一致，改一处要同步另一处。
REVIEW_TEMPLATE_PERMISSIONS = [
    {
        "key": "workspace.review_template.view",
        "name": "查看评审模板库",
        "description": "查看各研发阶段的评审与评审活动模板",
        "module": "review_template",
        "action": "view",
        "category": "评审模板库",
        "sort_order": 1,
    },
    {
        "key": "workspace.review_template.manage",
        "name": "维护评审模板库",
        "description": "新建/编辑/删除评审与评审活动模板，调整排序与启用状态",
        "module": "review_template",
        "action": "manage",
        "category": "评审模板库",
        "sort_order": 2,
    },
]

ALL_KEYS = [item["key"] for item in REVIEW_TEMPLATE_PERMISSIONS]

WORKSPACE_ROLE_TYPE = "workspace"

# 回填口径同 0359：只给管理员类角色。判定用「删除工作区」——它是管理员独有的一项。
ADMIN_MARKER_KEY = "workspace.settings.delete"


def _role_permission_keys(role):
    permissions = role.permissions if isinstance(role.permissions, dict) else {}
    permission_keys = permissions.get("permission_keys")
    return permission_keys if isinstance(permission_keys, list) else None


def forward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    for item in REVIEW_TEMPLATE_PERMISSIONS:
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
        ("db", "0362_seed_stage_review_templates"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
