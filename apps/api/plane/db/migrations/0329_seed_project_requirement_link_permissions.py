from django.db import migrations


PROJECT_REQUIREMENT_LINK_PERMISSIONS = [
    {
        "key": "project.requirement_link.view",
        "name": "查看项目关联的产品需求",
        "module": "project.requirement_link",
        "action": "view",
        "sort_order": 110,
    },
    {
        "key": "project.requirement_link.manage",
        "name": "关联/解除关联产品需求",
        "module": "project.requirement_link",
        "action": "manage",
        "sort_order": 120,
    },
    {
        "key": "project.product_link.manage",
        "name": "管理项目关联的产品",
        "module": "project.product_link",
        "action": "manage",
        "sort_order": 130,
    },
]

VIEW_KEYS = ["project.requirement_link.view"]
MANAGE_KEYS = ["project.requirement_link.manage", "project.product_link.manage"]

ALL_KEYS = [permission["key"] for permission in PROJECT_REQUIREMENT_LINK_PERMISSIONS]

# 谁本来就能看需求页，就能看进本项目的产品需求。
VIEW_SOURCE_KEY = "project.requirements.view"
# 关联/解除关联改的是项目自己的数据，按「能改项目设置」这条线放，不跟着看的人走。
MANAGE_SOURCE_KEY = "project.settings.edit"


def _upsert_permissions(Permission):
    for permission in PROJECT_REQUIREMENT_LINK_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "需求",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )


def _grant_permissions_to_roles(
    RoleModel, source_permission_key, permission_keys_to_grant, filters=None
):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if (
            not isinstance(permission_keys, list)
            or source_permission_key not in permission_keys
        ):
            continue

        next_permission_keys = list(permission_keys)
        for key in permission_keys_to_grant:
            if key not in next_permission_keys:
                next_permission_keys.append(key)

        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_permissions_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    keys_to_remove = set(ALL_KEYS)
    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue

        filtered = [key for key in permission_keys if key not in keys_to_remove]
        if filtered != permission_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_project_requirement_link_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permissions(Permission)

    # WorkspaceRole(type="project_template") 是新项目的角色蓝本
    # （utils/project/defaults.py::create_default_role 原样复制它），
    # 两边都要写，否则今天的项目有、明天建的项目没有。
    for RoleModel, filters in ((ProjectRole, None), (WorkspaceRole, {"type": "project_template"})):
        _grant_permissions_to_roles(RoleModel, VIEW_SOURCE_KEY, VIEW_KEYS, filters)
        _grant_permissions_to_roles(RoleModel, MANAGE_SOURCE_KEY, MANAGE_KEYS, filters)


def unseed_project_requirement_link_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(ProjectRole)
    _remove_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=ALL_KEYS).delete()


class Migration(migrations.Migration):
    """项目关联产品需求的三个权限 key。

    授予策略按来源 key 推导，不做无差别下发：
    - 能看研发需求页的角色（project.requirements.view）→ 拿到 view
    - 能改项目设置的角色（project.settings.edit）→ 额外拿到两个 manage
    """

    dependencies = [("db", "0328_requirement_project_link")]

    operations = [
        migrations.RunPython(
            seed_project_requirement_link_permissions,
            unseed_project_requirement_link_permissions,
        ),
    ]
