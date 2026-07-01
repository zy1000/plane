# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest
from rest_framework import status

from plane.db.models import Project, ProjectMember, ProjectMemberRole, ProjectRole, User, WorkspaceMember


@pytest.mark.contract
class TestProjectStatisticPermission:
    @staticmethod
    def get_project_statistic_url(workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/project/statistic/"

    @staticmethod
    def get_project_overview_statistic_url(workspace_slug: str) -> str:
        return f"/api/workspaces/{workspace_slug}/project/overview-statistic/"

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
    def bind_project_permission(project, project_member, permission_key: str):
        role = ProjectRole.objects.create(
            project=project,
            name=f"Role {uuid.uuid4().hex[:8]}",
            permissions={"permission_keys": [permission_key]},
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=project_member,
            role=role,
        )
        return role

    @pytest.mark.django_db
    def test_overview_statistic_requires_project_overview_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        owner_user = self.create_project_owner_user(workspace)
        project = Project.objects.create(
            name="Overview Statistic Permission Project",
            identifier=f"OSP{uuid.uuid4().hex[:4]}",
            workspace=workspace,
            created_by=owner_user,
            updated_by=owner_user,
            project_lead=owner_user,
        )
        ProjectMember.objects.create(
            project=project,
            member=create_user,
            role=5,
            is_active=True,
        )

        response = session_client.get(
            self.get_project_overview_statistic_url(workspace.slug),
            {"project_id": str(project.id)},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json() == {"error": "您没有所需的项目权限。"}

    @pytest.mark.django_db
    def test_overview_statistic_allows_project_member_with_overview_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        owner_user = self.create_project_owner_user(workspace)
        project = Project.objects.create(
            name="Overview Statistic Allowed Project",
            identifier=f"OSA{uuid.uuid4().hex[:4]}",
            workspace=workspace,
            created_by=owner_user,
            updated_by=owner_user,
            project_lead=owner_user,
        )
        project_member = ProjectMember.objects.create(
            project=project,
            member=create_user,
            role=5,
            is_active=True,
        )
        self.bind_project_permission(project, project_member, "project.analytics.view")

        response = session_client.get(
            self.get_project_overview_statistic_url(workspace.slug),
            {"project_id": str(project.id)},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "work_item_stats" in data
        assert "cycles" in data
        assert "releases" in data
        assert "test_plans" in data
        assert "case_reviews" in data

    @pytest.mark.django_db
    def test_overview_statistic_forbids_non_project_member(
        self,
        session_client,
        workspace,
    ):
        owner_user = self.create_project_owner_user(workspace)
        outsider_user = User.objects.create_user(
            email=f"outsider-{uuid.uuid4().hex[:8]}@example.com",
            username=f"outsider_{uuid.uuid4().hex[:8]}",
        )
        WorkspaceMember.objects.create(
            workspace=workspace,
            member=outsider_user,
            role=5,
            is_active=True,
        )
        project = Project.objects.create(
            name="Overview Statistic Forbidden Project",
            identifier=f"OSF{uuid.uuid4().hex[:4]}",
            workspace=workspace,
            created_by=owner_user,
            updated_by=owner_user,
            project_lead=owner_user,
        )
        session_client.force_authenticate(user=outsider_user)

        response = session_client.get(
            self.get_project_overview_statistic_url(workspace.slug),
            {"project_id": str(project.id)},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.json() == {"error": "您没有所需的项目权限。"}

    @pytest.mark.django_db
    def test_statistic_requires_project_overview_permission(
        self,
        session_client,
        workspace,
        create_user,
    ):
        owner_user = self.create_project_owner_user(workspace)
        project = Project.objects.create(
            name="Full Statistic Permission Project",
            identifier=f"FSP{uuid.uuid4().hex[:4]}",
            workspace=workspace,
            created_by=owner_user,
            updated_by=owner_user,
            project_lead=owner_user,
        )
        ProjectMember.objects.create(
            project=project,
            member=create_user,
            role=5,
            is_active=True,
        )

        response = session_client.get(
            self.get_project_statistic_url(workspace.slug),
            {"project_id": str(project.id)},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
