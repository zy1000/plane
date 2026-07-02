from django.db import migrations


INTAKE_VIEW_PERMISSION_KEY = "intake.view"


def _grant_permission_to_existing_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        if INTAKE_VIEW_PERMISSION_KEY in existing_keys:
            continue

        permissions["permission_keys"] = [*existing_keys, INTAKE_VIEW_PERMISSION_KEY]
        role.permissions = permissions
        role.save(update_fields=["permissions"])


def _remove_permission_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list):
            continue

        filtered = [key for key in existing_keys if key != INTAKE_VIEW_PERMISSION_KEY]
        if filtered != existing_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def activate_intake_view_permission(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    Permission.objects.update_or_create(
        key=INTAKE_VIEW_PERMISSION_KEY,
        defaults={
            "name": "查看需求收集列表与详情",
            "description": "查看需求收集列表与详情",
            "scope": "project",
            "module": "intake",
            "action": "view",
            "category": "项目页面",
            "sort_order": 1,
            "is_active": True,
        },
    )
    _grant_permission_to_existing_roles(ProjectRole)
    _grant_permission_to_existing_roles(WorkspaceRole, {"type": "project_template"})


def deactivate_intake_view_permission(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permission_from_roles(ProjectRole)
    _remove_permission_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key=INTAKE_VIEW_PERMISSION_KEY).update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0282_seed_project_issue_page_view_permissions"),
    ]

    operations = [
        migrations.RunPython(
            activate_intake_view_permission,
            deactivate_intake_view_permission,
        ),
    ]
