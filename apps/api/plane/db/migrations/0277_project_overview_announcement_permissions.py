from django.db import migrations


OVERVIEW_PERMISSION_KEY = "project.analytics.view"
OLD_ANNOUNCEMENT_PERMISSION_KEY = "project.announcement.edit"
NEW_ANNOUNCEMENT_PERMISSION_KEYS = [
    "project.announcement.create",
    "project.announcement.delete",
]
NEW_ANNOUNCEMENT_PERMISSION_SET = set(NEW_ANNOUNCEMENT_PERMISSION_KEYS)


def _upsert_permission(Permission, key, name, module, action, sort_order, category="项目概览"):
    Permission.objects.update_or_create(
        key=key,
        defaults={
            "name": name,
            "description": name,
            "scope": "project",
            "module": module,
            "action": action,
            "category": category,
            "sort_order": sort_order,
            "is_active": True,
        },
    )


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


def seed_project_overview_announcement_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permission(
        Permission,
        OVERVIEW_PERMISSION_KEY,
        "查看项目概览",
        "project.overview",
        "view",
        1,
    )
    _upsert_permission(
        Permission,
        "project.announcement.create",
        "添加项目公告",
        "project.announcement",
        "create",
        2,
    )
    _upsert_permission(
        Permission,
        "project.announcement.delete",
        "删除项目公告",
        "project.announcement",
        "delete",
        3,
    )
    _grant_permissions_to_roles(
        ProjectRole,
        OLD_ANNOUNCEMENT_PERMISSION_KEY,
        NEW_ANNOUNCEMENT_PERMISSION_KEYS,
    )
    _grant_permissions_to_roles(
        WorkspaceRole,
        OLD_ANNOUNCEMENT_PERMISSION_KEY,
        NEW_ANNOUNCEMENT_PERMISSION_KEYS,
        {"type": "project_template"},
    )
    _remove_permissions_from_roles(ProjectRole, [OLD_ANNOUNCEMENT_PERMISSION_KEY])
    _remove_permissions_from_roles(
        WorkspaceRole,
        [OLD_ANNOUNCEMENT_PERMISSION_KEY],
        {"type": "project_template"},
    )
    Permission.objects.filter(key=OLD_ANNOUNCEMENT_PERMISSION_KEY).delete()


def unseed_project_overview_announcement_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    Permission.objects.filter(key=OVERVIEW_PERMISSION_KEY).update(
        name="查看项目统计",
        description="查看项目统计",
        module="project.analytics",
        action="view",
        category="项目分析",
        sort_order=1,
        is_active=True,
    )
    _upsert_permission(
        Permission,
        OLD_ANNOUNCEMENT_PERMISSION_KEY,
        "发布/编辑/删除项目公告",
        "project.announcement",
        "edit",
        2,
        "项目公告",
    )
    _grant_permissions_to_roles(
        ProjectRole,
        "project.announcement.create",
        [OLD_ANNOUNCEMENT_PERMISSION_KEY],
    )
    _grant_permissions_to_roles(
        ProjectRole,
        "project.announcement.delete",
        [OLD_ANNOUNCEMENT_PERMISSION_KEY],
    )
    _grant_permissions_to_roles(
        WorkspaceRole,
        "project.announcement.create",
        [OLD_ANNOUNCEMENT_PERMISSION_KEY],
        {"type": "project_template"},
    )
    _grant_permissions_to_roles(
        WorkspaceRole,
        "project.announcement.delete",
        [OLD_ANNOUNCEMENT_PERMISSION_KEY],
        {"type": "project_template"},
    )
    Permission.objects.filter(key__in=NEW_ANNOUNCEMENT_PERMISSION_KEYS).delete()

    _remove_permissions_from_roles(ProjectRole, NEW_ANNOUNCEMENT_PERMISSION_SET)
    _remove_permissions_from_roles(
        WorkspaceRole,
        NEW_ANNOUNCEMENT_PERMISSION_SET,
        {"type": "project_template"},
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0276_add_test_report"),
    ]

    operations = [
        migrations.RunPython(
            seed_project_overview_announcement_permissions,
            unseed_project_overview_announcement_permissions,
        ),
    ]
