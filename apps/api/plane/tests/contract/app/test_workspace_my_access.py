# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from django.urls import reverse
from rest_framework import status

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


def create_permission(key, *, scope=Permission.Scope.WORKSPACE, is_active=True):
    return Permission.objects.create(
        key=key,
        name=key.rsplit(".", 1)[-1].replace("_", " ").title(),
        description=f"Permission for {key}",
        scope=scope,
        module=key.rsplit(".", 1)[0],
        action=key.rsplit(".", 1)[-1],
        category="工作区",
        is_active=is_active,
    )


@pytest.mark.contract
@pytest.mark.django_db
class TestWorkspaceMyAccessAPI:
    def test_rejects_non_member(self, api_client):
        workspace = WorkspaceFactory()
        api_client.force_authenticate(user=UserFactory())

        response = api_client.get(
            reverse("workspace-my-access", kwargs={"slug": workspace.slug})
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_returns_roles_groups_full_catalog_and_all_sources(self, api_client):
        direct_key = "workspace.my_access.direct"
        group_key = "workspace.my_access.group"
        shared_key = "workspace.my_access.shared"
        missing_key = "workspace.my_access.missing"
        inactive_key = "workspace.my_access.inactive"
        project_key = "project.my_access.hidden"
        for key in (direct_key, group_key, shared_key, missing_key):
            create_permission(key)
        create_permission(inactive_key, is_active=False)
        create_permission(project_key, scope=Permission.Scope.PROJECT)

        workspace = WorkspaceFactory(owner=UserFactory())
        user = UserFactory()
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            member=user,
            role=20,
        )
        direct_role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Direct editor",
            description="Assigned directly",
            type=WorkspaceRole.RoleType.WORKSPACE,
            permissions={"permission_keys": [direct_key, shared_key]},
        )
        group_role = WorkspaceRole.objects.create(
            workspace=workspace,
            name="Team editor",
            description="Inherited through teams",
            type=WorkspaceRole.RoleType.WORKSPACE,
            permissions={"permission_keys": [group_key, shared_key]},
        )
        WorkspaceMemberRole.objects.create(
            workspace=workspace,
            member=member,
            role=direct_role,
        )

        groups = [
            WorkspaceGroup.objects.create(workspace=workspace, name="Alpha"),
            WorkspaceGroup.objects.create(workspace=workspace, name="Beta"),
        ]
        empty_group = WorkspaceGroup.objects.create(workspace=workspace, name="No roles")
        for group in [*groups, empty_group]:
            WorkspaceGroupMember.objects.create(group=group, member=member)
        for group in groups:
            WorkspaceGroupRole.objects.create(group=group, role=group_role)

        api_client.force_authenticate(user=user)
        response = api_client.get(
            reverse("workspace-my-access", kwargs={"slug": workspace.slug})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["membership"]["role"] == 20
        assert response.data["membership"]["is_workspace_owner"] is False
        assert [role["name"] for role in response.data["direct_roles"]] == [
            "Direct editor"
        ]
        assert [group["name"] for group in response.data["groups"]] == [
            "Alpha",
            "Beta",
            "No roles",
        ]
        assert response.data["groups"][-1]["roles"] == []

        permissions = {
            permission["key"]: permission
            for permission in response.data["permissions"]
        }
        assert permissions[direct_key]["is_granted"] is True
        assert permissions[group_key]["is_granted"] is True
        assert permissions[missing_key]["is_granted"] is False
        assert permissions[missing_key]["sources"] == []
        assert inactive_key not in permissions
        assert project_key not in permissions

        shared_sources = permissions[shared_key]["sources"]
        assert [source["type"] for source in shared_sources] == [
            "direct_role",
            "group_role",
            "group_role",
        ]
        assert [source["group"]["name"] for source in shared_sources[1:]] == [
            "Alpha",
            "Beta",
        ]
        assert all(source["type"] != "workspace_owner" for source in shared_sources)

    def test_workspace_owner_receives_every_active_workspace_permission(self, api_client):
        create_permission("workspace.my_access.owner")
        create_permission("workspace.my_access.owner_inactive", is_active=False)
        user = UserFactory()
        workspace = WorkspaceFactory(owner=user)
        WorkspaceMember.objects.create(workspace=workspace, member=user, role=20)
        api_client.force_authenticate(user=user)

        response = api_client.get(
            reverse("workspace-my-access", kwargs={"slug": workspace.slug})
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["membership"]["is_workspace_owner"] is True
        assert response.data["permissions"]
        assert all(permission["is_granted"] for permission in response.data["permissions"])
        assert all(
            permission["sources"] == [
                {"type": "workspace_owner", "role": None, "group": None}
            ]
            for permission in response.data["permissions"]
        )
        assert "workspace.my_access.owner_inactive" not in {
            permission["key"] for permission in response.data["permissions"]
        }
