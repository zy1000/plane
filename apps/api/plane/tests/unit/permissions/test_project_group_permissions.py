import pytest
from django.core.exceptions import ValidationError

from plane.app.permissions.base import _get_user_project_permission_keys
from plane.db.models import (
    ProjectGroupRole,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    WorkspaceGroup,
    WorkspaceGroupMember,
    WorkspaceMember,
)
from plane.tests.factories import ProjectFactory, UserFactory, WorkspaceFactory
from plane.utils.project_access import build_project_member_role_sources
from plane.utils.workflow.transition import resolve_role_member_ids


@pytest.mark.unit
@pytest.mark.django_db
class TestProjectGroupPermissions:
    def test_unions_direct_and_team_roles_for_active_project_members(self):
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)
        user = UserFactory()
        workspace_member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=15,
        )
        project_member = ProjectMember.objects.create(
            workspace=workspace,
            project=project,
            member=user,
            role=15,
        )
        direct_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Direct role",
            permissions={"permission_keys": ["project.member.view"]},
        )
        team_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Team role",
            permissions={"permission_keys": ["project.work_item.create"]},
        )
        ProjectMemberRole.objects.create(
            workspace=workspace,
            project=project,
            member=project_member,
            role=direct_role,
        )
        group = WorkspaceGroup.objects.create(workspace=workspace, name="Engineering")
        WorkspaceGroupMember.objects.create(group=group, member=workspace_member)
        ProjectGroupRole.objects.create(group=group, role=team_role)

        permission_keys = _get_user_project_permission_keys(user, workspace.slug, str(project.id))

        assert permission_keys == {"project.member.view", "project.work_item.create"}
        sources = build_project_member_role_sources([project_member])[project_member.id]
        assert {(source["type"], source["role"]["name"]) for source in sources} == {
            ("direct_role", "Direct role"),
            ("group_role", "Team role"),
        }
        assert resolve_role_member_ids(project.id, [team_role.id]) == [str(user.id)]

    def test_team_role_requires_active_membership_in_both_scopes(self):
        workspace = WorkspaceFactory()
        project = ProjectFactory(workspace=workspace)
        user = UserFactory()
        workspace_member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=15,
        )
        project_member = ProjectMember.objects.create(
            workspace=workspace,
            project=project,
            member=user,
            role=15,
        )
        role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Team role",
            permissions={"permission_keys": ["project.member.view"]},
        )
        group = WorkspaceGroup.objects.create(workspace=workspace, name="Engineering")
        group_member = WorkspaceGroupMember.objects.create(group=group, member=workspace_member)
        ProjectGroupRole.objects.create(group=group, role=role)

        group_member.delete()
        assert _get_user_project_permission_keys(user, workspace.slug, str(project.id)) == set()

        group_member = WorkspaceGroupMember.objects.create(group=group, member=workspace_member)
        project_member.is_active = False
        project_member.save(update_fields=["is_active"])
        assert _get_user_project_permission_keys(user, workspace.slug, str(project.id)) == set()
        assert resolve_role_member_ids(project.id, [role.id]) == []
        group_member.delete()

    def test_rejects_group_from_another_workspace(self):
        project = ProjectFactory()
        role = ProjectRole.objects.create(
            workspace=project.workspace,
            project=project,
            name="Project role",
        )
        other_group = WorkspaceGroup.objects.create(
            workspace=WorkspaceFactory(),
            name="Other workspace team",
        )

        with pytest.raises(ValidationError):
            ProjectGroupRole.objects.create(group=other_group, role=role)
