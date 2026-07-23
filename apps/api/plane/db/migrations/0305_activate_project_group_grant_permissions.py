from django.db import migrations


PROJECT_GROUP_GRANT_PERMISSIONS = (
    (
        "project.group_grant.view",
        "查看团队",
        "view",
        1,
    ),
    (
        "project.group_grant.edit",
        "编辑团队角色",
        "edit",
        2,
    ),
)

LEGACY_PROJECT_GROUP_GRANT_PERMISSION_KEYS = (
    "project.group_grant.create",
    "project.group_grant.delete",
)


def replace_legacy_project_group_grant_permissions(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue

        has_legacy_permission = any(
            key in permission_keys for key in LEGACY_PROJECT_GROUP_GRANT_PERMISSION_KEYS
        )
        next_permission_keys = [
            key for key in permission_keys if key not in LEGACY_PROJECT_GROUP_GRANT_PERMISSION_KEYS
        ]
        if has_legacy_permission and "project.group_grant.edit" not in next_permission_keys:
            next_permission_keys.append("project.group_grant.edit")

        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def activate_project_group_grant_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    for key, name, action, sort_order in PROJECT_GROUP_GRANT_PERMISSIONS:
        Permission.objects.update_or_create(
            key=key,
            defaults={
                "name": name,
                "description": name,
                "scope": "project",
                "module": "project.group_grant",
                "action": action,
                "category": "团队",
                "sort_order": sort_order,
                "is_active": True,
            },
        )

    replace_legacy_project_group_grant_permissions(ProjectRole)
    replace_legacy_project_group_grant_permissions(
        WorkspaceRole,
        {"type": "project_template"},
    )
    Permission.objects.filter(key__in=LEGACY_PROJECT_GROUP_GRANT_PERMISSION_KEYS).delete()


def deactivate_project_group_grant_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Permission.objects.filter(
        key__in=[permission[0] for permission in PROJECT_GROUP_GRANT_PERMISSIONS]
    ).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0304_requirementapprover"),
    ]

    operations = [
        migrations.RunPython(
            activate_project_group_grant_permissions,
            deactivate_project_group_grant_permissions,
        ),
    ]
