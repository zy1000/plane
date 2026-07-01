from django.db import migrations


REPORT_PERMISSIONS = [
    {
        "key": "qa.report.view",
        "name": "查看测试报告",
        "module": "qa.report",
        "action": "view",
        "sort_order": 15,
    },
    {
        "key": "qa.report.create",
        "name": "创建测试报告",
        "module": "qa.report",
        "action": "create",
        "sort_order": 16,
    },
    {
        "key": "qa.report.edit",
        "name": "编辑测试报告",
        "module": "qa.report",
        "action": "edit",
        "sort_order": 17,
    },
    {
        "key": "qa.report.delete",
        "name": "删除测试报告",
        "module": "qa.report",
        "action": "delete",
        "sort_order": 18,
    },
    {
        "key": "qa.report.export",
        "name": "导出测试报告",
        "module": "qa.report",
        "action": "export",
        "sort_order": 19,
    },
]

REPORT_PERMISSION_KEYS = [permission["key"] for permission in REPORT_PERMISSIONS]
LEGACY_PLAN_TO_REPORT_PERMISSION_KEYS = {
    "qa.plan.view": ["qa.report.view", "qa.report.export"],
    "qa.plan.create": ["qa.report.create"],
    "qa.plan.edit": ["qa.report.edit"],
    "qa.plan.delete": ["qa.report.delete"],
}


def _upsert_report_permissions(Permission):
    for permission in REPORT_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "测试",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )


def _grant_report_permissions_from_plan_permissions(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list) or not permission_keys:
            continue

        next_permission_keys = list(permission_keys)
        for plan_key, report_keys in LEGACY_PLAN_TO_REPORT_PERMISSION_KEYS.items():
            if plan_key not in permission_keys:
                continue
            for report_key in report_keys:
                if report_key not in next_permission_keys:
                    next_permission_keys.append(report_key)

        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_report_permissions_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    report_permission_key_set = set(REPORT_PERMISSION_KEYS)
    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        permission_keys = permissions.get("permission_keys")
        if not isinstance(permission_keys, list):
            continue

        next_permission_keys = [key for key in permission_keys if key not in report_permission_key_set]
        if next_permission_keys != permission_keys:
            permissions["permission_keys"] = next_permission_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_qa_report_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_report_permissions(Permission)
    _grant_report_permissions_from_plan_permissions(ProjectRole)
    _grant_report_permissions_from_plan_permissions(WorkspaceRole, {"type": "project_template"})


def unseed_qa_report_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_report_permissions_from_roles(ProjectRole)
    _remove_report_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=REPORT_PERMISSION_KEYS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0277_project_overview_announcement_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_qa_report_permissions, unseed_qa_report_permissions),
    ]
