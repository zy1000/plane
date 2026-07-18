from django.db import migrations


ADMIN_ROLE = 20

DEFAULT_ADMIN_ROLE_NAME = "管理员"
DEFAULT_MEMBER_ROLE_NAME = "成员"

DEFAULT_ADMIN_ROLE_DESCRIPTION = (
    "系统自动创建的默认工作区管理员角色，拥有工作区全部权限。"
)
DEFAULT_MEMBER_ROLE_DESCRIPTION = (
    "系统自动创建的默认工作区成员角色，拥有除工作区管理权限外的其他权限。"
)

MEMBER_EXCLUDED_PERMISSION_KEYS = {
    "workspace.settings.edit",
    "workspace.settings.delete",
    "workspace.member.invite",
    "workspace.member.edit",
    "workspace.member.remove",
    "workspace.member.leave",
    "workspace.role.create",
    "workspace.role.edit",
    "workspace.role.delete",
    "workspace.group.create",
    "workspace.group.edit",
    "workspace.group.delete",
    "workspace.group.manage_member",
    "workspace.group.manage_role",
}


def _available_role_name(WorkspaceRole, workspace_id, base_name):
    if not WorkspaceRole.objects.filter(
        workspace_id=workspace_id,
        name=base_name,
        deleted_at__isnull=True,
    ).exists():
        return base_name

    candidate = f"{base_name}-默认"
    suffix = 2
    while WorkspaceRole.objects.filter(
        workspace_id=workspace_id,
        name=candidate,
        deleted_at__isnull=True,
    ).exists():
        candidate = f"{base_name}-默认-{suffix}"
        suffix += 1
    return candidate


def seed_default_workspace_roles(apps, schema_editor):
    Permission = apps.get_model("db", "Permission")
    Workspace = apps.get_model("db", "Workspace")
    WorkspaceMember = apps.get_model("db", "WorkspaceMember")
    WorkspaceMemberRole = apps.get_model("db", "WorkspaceMemberRole")
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    workspace_permission_keys = set(
        Permission.objects.filter(
            scope="workspace",
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("key", flat=True)
    )
    admin_permission_keys = sorted(workspace_permission_keys)
    member_permission_keys = sorted(
        workspace_permission_keys - MEMBER_EXCLUDED_PERMISSION_KEYS
    )

    for workspace in Workspace.objects.filter(
        deleted_at__isnull=True
    ).iterator(chunk_size=100):
        admin_role = WorkspaceRole.objects.create(
            workspace_id=workspace.id,
            name=_available_role_name(
                WorkspaceRole,
                workspace.id,
                DEFAULT_ADMIN_ROLE_NAME,
            ),
            description=DEFAULT_ADMIN_ROLE_DESCRIPTION,
            permissions={"permission_keys": admin_permission_keys},
            type="workspace",
        )
        member_role = WorkspaceRole.objects.create(
            workspace_id=workspace.id,
            name=_available_role_name(
                WorkspaceRole,
                workspace.id,
                DEFAULT_MEMBER_ROLE_NAME,
            ),
            description=DEFAULT_MEMBER_ROLE_DESCRIPTION,
            permissions={"permission_keys": member_permission_keys},
            type="workspace",
        )

        pending_member_roles = []
        members = WorkspaceMember.objects.filter(
            workspace_id=workspace.id,
            deleted_at__isnull=True,
        ).iterator(chunk_size=500)
        for member in members:
            role = admin_role if member.role == ADMIN_ROLE else member_role
            pending_member_roles.append(
                WorkspaceMemberRole(
                    workspace_id=workspace.id,
                    member_id=member.id,
                    role_id=role.id,
                )
            )
            if len(pending_member_roles) == 500:
                WorkspaceMemberRole.objects.bulk_create(
                    pending_member_roles,
                    ignore_conflicts=True,
                )
                pending_member_roles = []

        if pending_member_roles:
            WorkspaceMemberRole.objects.bulk_create(
                pending_member_roles,
                ignore_conflicts=True,
            )


def remove_default_workspace_roles(apps, schema_editor):
    WorkspaceRole = apps.get_model("db", "WorkspaceRole")

    WorkspaceRole.objects.filter(
        type="workspace",
        legacy_role__isnull=True,
        description__in=[
            DEFAULT_ADMIN_ROLE_DESCRIPTION,
            DEFAULT_MEMBER_ROLE_DESCRIPTION,
        ],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0292_remove_legacy_workspace_permission_roles"),
    ]

    operations = [
        migrations.RunPython(
            seed_default_workspace_roles,
            remove_default_workspace_roles,
        ),
    ]
