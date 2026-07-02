from django.db import migrations


PROJECT_ISSUE_PAGE_VIEW_PERMISSIONS = [
    {
        "key": "project.work_items.view",
        "name": "查看工作项页面",
        "module": "project.work_items",
        "action": "view",
        "sort_order": 1,
    },
    {
        "key": "project.requirements.view",
        "name": "查看需求页面",
        "module": "project.requirements",
        "action": "view",
        "sort_order": 2,
    },
    {
        "key": "project.defects.view",
        "name": "查看缺陷页面",
        "module": "project.defects",
        "action": "view",
        "sort_order": 3,
    },
]

PROJECT_ISSUE_PAGE_VIEW_PERMISSION_KEYS = [
    permission["key"] for permission in PROJECT_ISSUE_PAGE_VIEW_PERMISSIONS
]


def _upsert_permissions(Permission):
    for permission in PROJECT_ISSUE_PAGE_VIEW_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "项目页面",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )


def _grant_permissions_to_existing_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        merged = list(
            dict.fromkeys(existing_keys + PROJECT_ISSUE_PAGE_VIEW_PERMISSION_KEYS)
        )
        if merged != existing_keys:
            permissions["permission_keys"] = merged
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_permissions_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    keys_to_remove = set(PROJECT_ISSUE_PAGE_VIEW_PERMISSION_KEYS)
    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list):
            continue

        filtered = [key for key in existing_keys if key not in keys_to_remove]
        if filtered != existing_keys:
            permissions["permission_keys"] = filtered
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_project_issue_page_view_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_permissions(Permission)
    _grant_permissions_to_existing_roles(ProjectRole)
    _grant_permissions_to_existing_roles(
        WorkspaceRole, {"type": "project_template"}
    )


def unseed_project_issue_page_view_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_permissions_from_roles(ProjectRole)
    _remove_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=PROJECT_ISSUE_PAGE_VIEW_PERMISSION_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0281_issuetransitionrecord_approval_reason"),
    ]

    operations = [
        migrations.RunPython(
            seed_project_issue_page_view_permissions,
            unseed_project_issue_page_view_permissions,
        ),
    ]
