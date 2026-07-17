from django.db import migrations


SYSTEM_ROLE_NAMES = {
    20: "系统管理员",
    15: "系统成员",
    5: "系统访客",
}

SYSTEM_ROLE_DESCRIPTIONS = {
    20: "兼容原工作区管理员角色，由系统维护。",
    15: "兼容原工作区成员角色，由系统维护。",
    5: "兼容原工作区访客角色，由系统维护。",
}

ADMIN_PERMISSION_KEYS = {
    "workspace.settings.view",
    "workspace.settings.edit",
    "workspace.settings.delete",
    "workspace.member.view",
    "workspace.member.invite",
    "workspace.member.edit",
    "workspace.member.remove",
    "workspace.member.leave",
    "workspace.role.view",
    "workspace.role.create",
    "workspace.role.edit",
    "workspace.role.delete",
    "workspace.group.view",
    "workspace.group.create",
    "workspace.group.edit",
    "workspace.group.delete",
    "workspace.group.manage_member",
    "workspace.group.manage_role",
    "workspace.project.view",
    "workspace.project.create",
    "workspace.user_profile.view",
    "workspace.user_profile.export",
    "workspace.analytics.view",
    "workspace.analytics.manage_saved_view",
    "workspace.analytics.export",
}

MEMBER_PERMISSION_KEYS = {
    "workspace.settings.view",
    "workspace.member.view",
    "workspace.member.invite",
    "workspace.member.leave",
    "workspace.role.view",
    "workspace.group.view",
    "workspace.project.view",
    "workspace.project.create",
    "workspace.user_profile.view",
    "workspace.user_profile.export",
    "workspace.analytics.view",
    "workspace.analytics.manage_saved_view",
    "workspace.analytics.export",
}

GUEST_PERMISSION_KEYS = {
    "workspace.member.view",
    "workspace.member.leave",
    "workspace.role.view",
    "workspace.group.view",
    "workspace.project.view",
}

SYSTEM_ROLE_PERMISSION_KEYS = {
    20: ADMIN_PERMISSION_KEYS,
    15: MEMBER_PERMISSION_KEYS,
    5: GUEST_PERMISSION_KEYS,
}


def _available_role_name(WorkspaceRole, workspace_id, legacy_role):
    base_name = SYSTEM_ROLE_NAMES[legacy_role]
    if not WorkspaceRole.objects.filter(
        workspace_id=workspace_id,
        name=base_name,
        deleted_at__isnull=True,
    ).exists():
        return base_name

    candidate = f"{base_name}-{legacy_role}"
    suffix = 2
    while WorkspaceRole.objects.filter(
        workspace_id=workspace_id,
        name=candidate,
        deleted_at__isnull=True,
    ).exists():
        candidate = f"{base_name}-{legacy_role}-{suffix}"
        suffix += 1
    return candidate


def seed_workspace_system_roles(apps, schema_editor):
    Workspace = apps.get_model("db", "Workspace")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")
    WorkspaceMemberRole = apps.get_model("db", "WorkspaceMemberRole")

    for workspace in Workspace.objects.filter(deleted_at__isnull=True).iterator(
        chunk_size=100
    ):
        roles_by_legacy_role = {}
        for legacy_role in (20, 15, 5):
            role = WorkspaceRole.objects.filter(
                workspace_id=workspace.id,
                legacy_role=legacy_role,
                deleted_at__isnull=True,
            ).first()
            defaults = {
                "description": SYSTEM_ROLE_DESCRIPTIONS[legacy_role],
                "permissions": {
                    "permission_keys": sorted(
                        SYSTEM_ROLE_PERMISSION_KEYS[legacy_role]
                    )
                },
                "type": "workspace",
            }
            if role is None:
                role = WorkspaceRole.objects.create(
                    workspace_id=workspace.id,
                    name=_available_role_name(
                        WorkspaceRole, workspace.id, legacy_role
                    ),
                    legacy_role=legacy_role,
                    **defaults,
                )
            else:
                WorkspaceRole.objects.filter(pk=role.pk).update(**defaults)
            roles_by_legacy_role[legacy_role] = role

        pending_links = []
        members = WorkspaceMember.objects.filter(
            workspace_id=workspace.id,
            is_active=True,
            deleted_at__isnull=True,
        ).iterator(chunk_size=500)
        for member in members:
            role = roles_by_legacy_role.get(member.role) or roles_by_legacy_role[5]
            pending_links.append(
                WorkspaceMemberRole(
                    workspace_id=workspace.id,
                    member_id=member.id,
                    role_id=role.id,
                )
            )
            if len(pending_links) == 500:
                WorkspaceMemberRole.objects.bulk_create(
                    pending_links,
                    ignore_conflicts=True,
                )
                pending_links = []
        if pending_links:
            WorkspaceMemberRole.objects.bulk_create(
                pending_links,
                ignore_conflicts=True,
            )


def remove_workspace_system_roles(apps, schema_editor):
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")
    WorkspaceMemberRole = apps.get_model("db", "WorkspaceMemberRole")
    system_role_ids = WorkspaceRole.objects.filter(
        legacy_role__isnull=False
    ).values_list("id", flat=True)
    WorkspaceMemberRole.objects.filter(role_id__in=system_role_ids).delete()
    WorkspaceRole.objects.filter(legacy_role__isnull=False).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0290_workspace_member_permissions"),
    ]

    operations = [
        migrations.RunPython(
            seed_workspace_system_roles,
            remove_workspace_system_roles,
        ),
    ]
