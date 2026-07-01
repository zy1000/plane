# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import status

from plane.app.permissions import PermissionKey
from plane.db.models import Project, ProjectMember, ProjectMemberRole, ProjectRole, User, WorkspaceMember
from plane.db.models.project import ProjectAnnouncement


@pytest.mark.contract
class TestProjectAnnouncementPermission:
    @staticmethod
    def get_project_announcement_url(workspace_slug: str, project_id: uuid.UUID) -> str:
        return f"/api/workspaces/{workspace_slug}/projects/{project_id}/announcement/"

    @staticmethod
    def create_project_owner_user(workspace):
        owner_user = User.objects.create_user(
            email=f"owner-{uuid.uuid4().hex[:8]}@example.com",
            username=f"owner_{uuid.uuid4().hex[:8]}",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=owner_user,
            role=20,
            is_active=True,
        )
        return owner_user

    @staticmethod
    def create_project_with_member(workspace, member_user):
        owner_user = TestProjectAnnouncementPermission.create_project_owner_user(workspace)
        project = Project.objects.create(
            name=f"Announcement Permission {uuid.uuid4().hex[:6]}",
            identifier=f"AP{uuid.uuid4().hex[:6]}",
            workspace=workspace,
            created_by=owner_user,
            updated_by=owner_user,
            project_lead=owner_user,
        )
        project_member = ProjectMember.objects.create(
            project=project,
            member=member_user,
            role=5,
            is_active=True,
        )
        return project, project_member

    @staticmethod
    def bind_project_permission(project, project_member, permission_key: PermissionKey):
        role = ProjectRole.objects.create(
            project=project,
            name=f"Role {uuid.uuid4().hex[:8]}",
            permissions={"permission_keys": [permission_key.value]},
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=project_member,
            role=role,
        )
        return role

    @pytest.mark.django_db
    def test_create_announcement_requires_project_announcement_create_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project, project_member = self.create_project_with_member(workspace, create_user)
        self.bind_project_permission(project, project_member, PermissionKey.PROJECT_ANNOUNCEMENT_DELETE)

        response = session_client.post(
            self.get_project_announcement_url(workspace.slug, project.id),
            {"name": "New announcement", "description": "<p>Body</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json() == {"error": "您没有所需的项目权限。"}

    @pytest.mark.django_db
    def test_create_announcement_allows_project_announcement_create_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project, project_member = self.create_project_with_member(workspace, create_user)
        self.bind_project_permission(project, project_member, PermissionKey.PROJECT_ANNOUNCEMENT_CREATE)

        response = session_client.post(
            self.get_project_announcement_url(workspace.slug, project.id),
            {"name": "New announcement", "description": "<p>Body</p>"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["name"] == "New announcement"

    @pytest.mark.django_db
    def test_delete_announcement_requires_project_announcement_delete_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project, project_member = self.create_project_with_member(workspace, create_user)
        announcement = ProjectAnnouncement.objects.create(project=project, name="Announcement")
        self.bind_project_permission(project, project_member, PermissionKey.PROJECT_ANNOUNCEMENT_CREATE)

        response = session_client.delete(
            self.get_project_announcement_url(workspace.slug, project.id),
            {"ids": [str(announcement.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json() == {"error": "您没有所需的项目权限。"}

    @pytest.mark.django_db
    def test_delete_announcement_allows_project_announcement_delete_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        project, project_member = self.create_project_with_member(workspace, create_user)
        announcement = ProjectAnnouncement.objects.create(project=project, name="Announcement")
        self.bind_project_permission(project, project_member, PermissionKey.PROJECT_ANNOUNCEMENT_DELETE)

        response = session_client.delete(
            self.get_project_announcement_url(workspace.slug, project.id),
            {"ids": [str(announcement.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProjectAnnouncement.objects.filter(id=announcement.id).exists()
