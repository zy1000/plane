from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status

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


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectGroupsAPI:
    def test_team_view_and_edit_permissions(self, api_client):
        owner = UserFactory()
        workspace = WorkspaceFactory(owner=owner)
        project = ProjectFactory(workspace=workspace, created_by=owner)
        WorkspaceMember.objects.create(workspace=workspace, member=owner, role=20)
        ProjectMember.objects.create(project=project, member=owner, role=20)

        group = WorkspaceGroup.objects.create(workspace=workspace, name="Engineering")
        target_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Developer",
        )
        replacement_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Reviewer",
        )

        viewer = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=viewer, role=15)
        viewer_project_member = ProjectMember.objects.create(project=project, member=viewer, role=15)
        viewer_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Team viewer",
            permissions={"permission_keys": ["project.group_grant.view"]},
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=viewer_project_member,
            role=viewer_role,
        )

        editor = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=editor, role=15)
        editor_project_member = ProjectMember.objects.create(project=project, member=editor, role=15)
        editor_role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Team editor",
            permissions={"permission_keys": ["project.group_grant.edit"]},
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=editor_project_member,
            role=editor_role,
        )

        group_roles_url = reverse(
            "project-group-roles",
            kwargs={"slug": workspace.slug, "project_id": project.id, "group_id": group.id},
        )
        groups_url = reverse(
            "project-groups",
            kwargs={"slug": workspace.slug, "project_id": project.id},
        )
        project_roles_url = reverse(
            "project-role",
            kwargs={"slug": workspace.slug, "project_id": project.id},
        )

        api_client.force_authenticate(viewer)
        assert api_client.get(groups_url).status_code == status.HTTP_200_OK
        assert (
            api_client.post(group_roles_url, {"role": str(target_role.id)}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )

        api_client.force_authenticate(editor)
        assert api_client.get(project_roles_url).status_code == status.HTTP_200_OK
        create_response = api_client.post(group_roles_url, {"role": str(target_role.id)}, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED

        group_role_detail_url = reverse(
            "project-group-roles",
            kwargs={
                "slug": workspace.slug,
                "project_id": project.id,
                "group_id": group.id,
                "pk": create_response.data["id"],
            },
        )
        update_response = api_client.patch(
            group_role_detail_url,
            {"role": str(replacement_role.id)},
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["role"] == str(replacement_role.id)

        assert api_client.delete(group_role_detail_url).status_code == status.HTTP_204_NO_CONTENT

    def test_lists_teams_members_and_manages_project_roles(self, api_client):
        owner = UserFactory()
        workspace = WorkspaceFactory(owner=owner)
        project = ProjectFactory(workspace=workspace, created_by=owner)
        WorkspaceMember.objects.create(workspace=workspace, member=owner, role=20)
        ProjectMember.objects.create(project=project, member=owner, role=20)

        teammate = UserFactory()
        teammate_workspace_member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=teammate,
            role=15,
        )
        ProjectMember.objects.create(project=project, member=teammate, role=15)
        group = WorkspaceGroup.objects.create(workspace=workspace, name="Engineering")
        WorkspaceGroupMember.objects.create(group=group, member=teammate_workspace_member)
        role = ProjectRole.objects.create(
            workspace=workspace,
            project=project,
            name="Developer",
        )
        api_client.force_authenticate(owner)

        list_response = api_client.get(
            reverse("project-groups", kwargs={"slug": workspace.slug, "project_id": project.id})
        )
        assert list_response.status_code == status.HTTP_200_OK
        assert list_response.data[0]["name"] == "Engineering"
        assert list_response.data[0]["member_count"] == 1
        assert list_response.data[0]["project_member_count"] == 1

        members_response = api_client.get(
            reverse(
                "project-group-members",
                kwargs={"slug": workspace.slug, "project_id": project.id, "group_id": group.id},
            )
        )
        assert members_response.status_code == status.HTTP_200_OK
        assert members_response.data[0]["member"]["id"] == str(teammate.id)
        assert members_response.data[0]["is_project_member"] is True

        create_response = api_client.post(
            reverse(
                "project-group-roles",
                kwargs={"slug": workspace.slug, "project_id": project.id, "group_id": group.id},
            ),
            {"role": str(role.id)},
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["role_detail"]["name"] == "Developer"
        assert ProjectGroupRole.objects.filter(group=group, role=role).exists()

    @patch("plane.app.views.project.member.project_add_user_email.delay")
    def test_invites_project_member_without_direct_role(self, email_task, api_client):
        owner = UserFactory()
        workspace = WorkspaceFactory(owner=owner)
        project = ProjectFactory(workspace=workspace, created_by=owner)
        WorkspaceMember.objects.create(workspace=workspace, member=owner, role=20)
        ProjectMember.objects.create(project=project, member=owner, role=20)
        invited_user = UserFactory()
        WorkspaceMember.objects.create(workspace=workspace, member=invited_user, role=15)
        api_client.force_authenticate(owner)

        response = api_client.post(
            reverse("project-member", kwargs={"slug": workspace.slug, "project_id": project.id}),
            {
                "members": [
                    {
                        "member_id": str(invited_user.id),
                        "role": 15,
                        "role_ids": [],
                    }
                ]
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data[0]["custom_role_ids"] == []
        assert ProjectMember.objects.filter(project=project, member=invited_user, is_active=True).exists()
        email_task.assert_called_once()
