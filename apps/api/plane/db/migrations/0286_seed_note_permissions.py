from django.db import migrations


OLD_TO_NEW_NOTE_PERMISSION_KEYS = {
    "page.view": "note.view",
    "page.create": "note.create",
    "page.edit": "note.edit",
    "page.delete": "note.delete",
    "page.archive": "note.archive",
    "page.lock": "note.lock",
    "page.access.manage": "note.access.manage",
    "page.version.view": "note.version.view",
}


NOTE_PERMISSIONS = [
    {
        "key": "note.view",
        "name": "查看笔记",
        "module": "note",
        "action": "view",
        "sort_order": 1,
    },
    {
        "key": "note.create",
        "name": "创建笔记",
        "module": "note",
        "action": "create",
        "sort_order": 2,
    },
    {
        "key": "note.edit",
        "name": "编辑笔记",
        "module": "note",
        "action": "edit",
        "sort_order": 3,
    },
    {
        "key": "note.delete",
        "name": "删除笔记",
        "module": "note",
        "action": "delete",
        "sort_order": 4,
    },
    {
        "key": "note.archive",
        "name": "归档/恢复笔记",
        "module": "note",
        "action": "archive",
        "sort_order": 5,
    },
    {
        "key": "note.lock",
        "name": "锁定/解锁笔记",
        "module": "note",
        "action": "lock",
        "sort_order": 6,
    },
    {
        "key": "note.access.manage",
        "name": "管理笔记访问权限",
        "module": "note.access",
        "action": "manage",
        "sort_order": 7,
    },
    {
        "key": "note.version.view",
        "name": "查看笔记历史版本",
        "module": "note.version",
        "action": "view",
        "sort_order": 8,
    },
]

NOTE_PERMISSION_KEYS = [permission["key"] for permission in NOTE_PERMISSIONS]


def _upsert_note_permissions(Permission):
    for permission in NOTE_PERMISSIONS:
        Permission.objects.update_or_create(
            key=permission["key"],
            defaults={
                "name": permission["name"],
                "description": permission["name"],
                "scope": "project",
                "module": permission["module"],
                "action": permission["action"],
                "category": "笔记",
                "sort_order": permission["sort_order"],
                "is_active": True,
            },
        )


def _rewrite_and_grant_note_permissions(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list) or not existing_keys:
            continue

        old_note_keys = [
            key for key in existing_keys if key in OLD_TO_NEW_NOTE_PERMISSION_KEYS
        ]
        bootstrap_keys = [] if old_note_keys else NOTE_PERMISSION_KEYS
        next_keys = [
            OLD_TO_NEW_NOTE_PERMISSION_KEYS.get(key, key)
            for key in existing_keys
            if isinstance(key, str)
        ]
        next_keys = list(dict.fromkeys(next_keys + bootstrap_keys))

        if next_keys != existing_keys:
            permissions["permission_keys"] = next_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def _remove_note_permissions_from_roles(RoleModel, filters=None):
    queryset = RoleModel.objects.all()
    if filters:
        queryset = queryset.filter(**filters)

    keys_to_remove = set(NOTE_PERMISSION_KEYS)
    for role in queryset:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        existing_keys = permissions.get("permission_keys")
        if not isinstance(existing_keys, list):
            continue

        next_keys = [key for key in existing_keys if key not in keys_to_remove]
        if next_keys != existing_keys:
            permissions["permission_keys"] = next_keys
            role.permissions = permissions
            role.save(update_fields=["permissions"])


def seed_note_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _upsert_note_permissions(Permission)
    _rewrite_and_grant_note_permissions(ProjectRole)
    _rewrite_and_grant_note_permissions(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=OLD_TO_NEW_NOTE_PERMISSION_KEYS.keys()).update(
        is_active=False
    )


def unseed_note_permissions(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    ProjectRole = apps.get_model("db", "ProjectRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    _remove_note_permissions_from_roles(ProjectRole)
    _remove_note_permissions_from_roles(WorkspaceRole, {"type": "project_template"})
    Permission.objects.filter(key__in=NOTE_PERMISSION_KEYS).delete()
    Permission.objects.filter(key__in=OLD_TO_NEW_NOTE_PERMISSION_KEYS.keys()).update(
        is_active=True
    )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0285_split_project_page_view_permission_categories"),
    ]

    operations = [
        migrations.RunPython(seed_note_permissions, unseed_note_permissions),
    ]
