"""项目阶段的两个权限 key，并退役原里程碑的 7 个 key（PMS-101）。

角色分配折算：持有 ``milestone.view`` 的角色给 ``project.stage.view``，持有
``milestone.create`` 或 ``milestone.edit`` 的给 ``project.stage.manage``；然后从
ProjectRole 与 WorkspaceRole(project_template) 的 permission_keys 里剔掉 7 个 milestone.*，
最后删 Permission 行。``PermissionKey`` 枚举里的 MILESTONE_* 必须与本迁移同一提交删除 ——
``permission_bootstrap.ensure_static_permissions`` 是 additive 的，post_migrate 会按枚举
把删掉的行补回来。
"""

from django.db import migrations

PROJECT_STAGE_PERMISSIONS = [
    {
        "key": "project.stage.view",
        "name": "查看项目阶段",
        "description": "查看本项目的阶段列表、子阶段、负责人与进度",
        "module": "project.stage",
        "action": "view",
        "sort_order": 1,
    },
    {
        "key": "project.stage.manage",
        "name": "维护项目阶段",
        "description": "新建/编辑/删除阶段与子阶段，改状态与负责人，从研发模式带出阶段",
        "module": "project.stage",
        "action": "manage",
        "sort_order": 2,
    },
]

VIEW_KEYS = ["project.stage.view"]
MANAGE_KEYS = ["project.stage.manage"]
ALL_KEYS = [permission["key"] for permission in PROJECT_STAGE_PERMISSIONS]

MILESTONE_KEYS = [
    "milestone.view",
    "milestone.create",
    "milestone.edit",
    "milestone.delete",
    "milestone.issue.view",
    "milestone.issue.add",
    "milestone.issue.remove",
]


def _upsert_permissions(Permission):
    for permission in PROJECT_STAGE_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["description"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "项目阶段",
                "sort_order": permission["sort_order"],
                "is_active": True,
                "deleted_at": None,
            },
        )


def _role_queryset(RoleModel, filters):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)
    return queryset


def _grant_permissions_to_roles(RoleModel, source_keys, keys_to_grant, filters=None):
    for role in _role_queryset(RoleModel, filters):
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue
        if not any(key in permission_keys for key in source_keys):
            continue
        next_keys = list(permission_keys)
        for key in keys_to_grant:
            if key not in next_keys:
                next_keys.append(key)
        if next_keys != permission_keys:
            permissions["permission_keys"] = next_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_permissions_from_roles(RoleModel, keys_to_remove, filters=None):
    keys_to_remove = set(keys_to_remove)
    for role in _role_queryset(RoleModel, filters):
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue
        filtered = [key for key in permission_keys if key not in keys_to_remove]
        if filtered != permission_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_project_stage_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permissions(Permission)

    for RoleModel, filters in (
        (ProjectRole, None),
        (WorkspaceRole, {"type": "project_template"}),
    ):
        _grant_permissions_to_roles(RoleModel, ["milestone.view"], VIEW_KEYS, filters)
        _grant_permissions_to_roles(
            RoleModel, ["milestone.create", "milestone.edit"], MANAGE_KEYS, filters
        )
        _remove_permissions_from_roles(RoleModel, MILESTONE_KEYS, filters)

    Permission.objects.filter(key__in=MILESTONE_KEYS).delete()


def unseed_project_stage_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(ProjectRole, ALL_KEYS)
    _remove_permissions_from_roles(WorkspaceRole, ALL_KEYS, {"type": "project_template"})
    Permission.objects.filter(key__in=ALL_KEYS).delete()
    # milestone.* 的行与角色分配不恢复：模块已删，0205 的种子也不会再跑


class Migration(migrations.Migration):

    dependencies = [("db", "0395_project_stage")]

    operations = [
        migrations.RunPython(
            seed_project_stage_permissions, unseed_project_stage_permissions
        ),
    ]
