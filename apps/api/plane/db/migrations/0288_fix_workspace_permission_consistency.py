from django.db import migrations


# 语义冗余：workspace.role.assign_group 与 workspace.group.manage_role 指向同一操作
# （给工作区用户组绑定默认角色模板，唯一入口是 WorkspaceGroupRoleViewSet），
# 统一保留归属更贴合 URL 结构的 workspace.group.manage_role。
OLD_ASSIGN_GROUP_KEY = "workspace.role.assign_group"
NEW_MANAGE_ROLE_KEY = "workspace.group.manage_role"

# 对称性缺口：项目侧有 project.member.leave，工作区侧缺少对应的“主动退出工作区”。
MEMBER_LEAVE_KEY = "workspace.member.leave"

WORKSPACE_ROLE_TYPE = "workspace"


def _grant_permissions_to_roles(RoleModel, source_permission_key, permission_keys_to_grant, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list) or source_permission_key not in permission_keys:
            continue

        next_permission_keys = list(permission_keys)
        for key in permission_keys_to_grant:
            if key not in next_permission_keys:
                next_permission_keys.append(key)

        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


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

    # 1) 补充 workspace.member.leave，字段与同组 workspace.member.* 保持一致（module=member / category=成员）。
    Permission.objects.update_or_create(
        key=MEMBER_LEAVE_KEY,
        defaults={
            "name": "主动退出工作区",
            "description": "主动退出工作区",
            "scope": "workspace",
            "module": "member",
            "action": "leave",
            "category": "成员",
            "sort_order": 5,
            "is_active": True,
        },
    )

    # 2) 先把持有旧 key 的工作区角色迁移到 workspace.group.manage_role，避免丢失既有授权意图。
    _grant_permissions_to_roles(
        WorkspaceRole,
        OLD_ASSIGN_GROUP_KEY,
        [NEW_MANAGE_ROLE_KEY],
        {"type": WORKSPACE_ROLE_TYPE},
    )
    _remove_permissions_from_roles(
        WorkspaceRole,
        [OLD_ASSIGN_GROUP_KEY],
        {"type": WORKSPACE_ROLE_TYPE},
    )
    Permission.objects.filter(key=OLD_ASSIGN_GROUP_KEY).delete()


def backward(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    # 还原 workspace.role.assign_group 定义（角色绑定无法精确区分来源，不做反向迁移）。
    Permission.objects.update_or_create(
        key=OLD_ASSIGN_GROUP_KEY,
        defaults={
            "name": "为工作区组绑定默认角色模板",
            "description": "为工作区组绑定默认角色模板",
            "scope": "workspace",
            "module": "role",
            "action": "assign_group",
            "category": "角色模板",
            "sort_order": 5,
            "is_active": True,
        },
    )

    _remove_permissions_from_roles(
        WorkspaceRole,
        [MEMBER_LEAVE_KEY],
        {"type": WORKSPACE_ROLE_TYPE},
    )
    Permission.objects.filter(key=MEMBER_LEAVE_KEY).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0287_fix_case_module_unique_constraints"),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
