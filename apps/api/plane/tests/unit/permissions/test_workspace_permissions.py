import pytest

from plane.app.permissions.base import _get_user_workspace_permission_keys
from plane.db.models import (
    Permission,
    WorkspaceGroup,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


def ensure_permission(key: str) -> Permission:
    module, action = key.rsplit(".", 1)
    return Permission.objects.get_or_create(
        key=key,
        defaults={
            "name": key,
            "scope": Permission.Scope.WORKSPACE,
            "module": module,
            "action": action,
        },
    )[0]


@pytest.mark.unit
@pytest.mark.django_db
class TestWorkspacePermissions:
    def test_legacy_member_role_does_not_provision_permission_roles(self):
        workspace = WorkspaceFactory()
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=UserFactory(),
            role=20,
        )

        assert not WorkspaceRole.objects.filter(
            workspace=workspace,
            legacy_role__isnull=False,
        ).exists()
        assert not WorkspaceMemberRole.objects.filter(
            member=member,
            role__legacy_role__isnull=False,
        ).exists()

    def test_legacy_admin_role_does_not_grant_permissions(self):
        workspace = WorkspaceFactory()
        user = UserFactory()
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=20,
        )

        assert _get_user_workspace_permission_keys(user, workspace.slug) == set()

    def test_resolver_unions_direct_and_group_role_permissions(self):
        direct_key = "workspace.settings.edit"
        group_key = "workspace.group.edit"
        ensure_permission(direct_key)
        ensure_permission(group_key)

        workspace = WorkspaceFactory()
        user = UserFactory()
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=5,
        )
        direct_role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Direct editor",
            type=WorkspaceRole.RoleType.WORKSPACE,
            permissions={"permission_keys": [direct_key]},
        )
        group_role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Group editor",
            type=WorkspaceRole.RoleType.WORKSPACE,
            permissions={"permission_keys": [group_key]},
        )
        WorkspaceMemberRole.objects.create(
            workspace=workspace,
            member=member,
            role=direct_role,
        )
        group = WorkspaceGroup.objects.create(workspace=workspace, name="Editors")
        WorkspaceGroupMember.objects.create(group=group, member=member)
        WorkspaceGroupRole.objects.create(group=group, role=group_role)

        permission_keys = _get_user_workspace_permission_keys(user, workspace.slug)

        assert direct_key in permission_keys
        assert group_key in permission_keys

    def test_resolver_ignores_inactive_and_wrong_scope_permissions(self):
        inactive_key = "workspace.settings.delete"
        ensure_permission(inactive_key)
        Permission.objects.filter(key=inactive_key).update(is_active=False)

        workspace = WorkspaceFactory()
        user = UserFactory()
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=5,
        )
        role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Invalid keys",
            type=WorkspaceRole.RoleType.WORKSPACE,
            permissions={
                "permission_keys": [inactive_key, "project.work_item.create"]
            },
        )
        WorkspaceMemberRole.objects.create(
            workspace=workspace,
            member=member,
            role=role,
        )

        permission_keys = _get_user_workspace_permission_keys(user, workspace.slug)

        assert inactive_key not in permission_keys
        assert "project.work_item.create" not in permission_keys

    def test_changing_legacy_role_preserves_custom_role_only(self):
        workspace = WorkspaceFactory()
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=UserFactory(),
            role=5,
        )
        custom_role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Custom role",
            type=WorkspaceRole.RoleType.WORKSPACE,
        )
        WorkspaceMemberRole.objects.create(
            workspace=workspace,
            member=member,
            role=custom_role,
        )

        member.role = 15
        member.save()

        assert WorkspaceMemberRole.objects.filter(member=member, role=custom_role).exists()
        assert set(
            WorkspaceMemberRole.objects.filter(
                member=member,
                role__legacy_role__isnull=False,
            ).values_list("role__legacy_role", flat=True)
        ) == set()
