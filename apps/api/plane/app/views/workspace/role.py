# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    PermissionSerializer,
    WorkspaceRolePermissionBindingSerializer,
    WorkspaceRoleSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Permission, Workspace, WorkspaceRole


class WorkspaceRoleViewSet(BaseViewSet):
    serializer_class = WorkspaceRoleSerializer
    model = WorkspaceRole
    use_read_replica = True
    search_fields = ["name", "description"]
    filterset_fields = ["type"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "created_by", "updated_by")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        workspace_role = self.get_queryset().filter(pk=pk).first()
        if not workspace_role:
            return Response({"error": "Workspace role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(workspace_role)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = self.get_serializer(data=request.data, context={"workspace": workspace})

        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_role = self.get_queryset().filter(pk=pk).first()
        if not workspace_role:
            return Response({"error": "Workspace role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            workspace_role,
            data=request.data,
            partial=True,
            context={"workspace": workspace_role.workspace},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        workspace_role = self.get_queryset().filter(pk=pk).first()
        if not workspace_role:
            return Response({"error": "Workspace role not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace_role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionViewSet(BaseViewSet):
    serializer_class = PermissionSerializer
    model = Permission
    use_read_replica = True
    filterset_fields = ["scope", "module", "category", "action", "is_active"]
    search_fields = ["key", "name", "description", "module", "category", "action"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .order_by("scope", "module", "sort_order", "key")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        permission = self.get_queryset().filter(pk=pk).first()
        if not permission:
            return Response({"error": "Permission not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(permission)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceRolePermissionAPIView(BaseAPIView):
    use_read_replica = True

    def get_role(self):
        return WorkspaceRole.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            pk=self.kwargs.get("pk"),
        ).first()

    def get_bound_permission_keys(self, role):
        if not isinstance(role.permissions, dict):
            return []

        permission_keys = role.permissions.get("permission_keys", [])
        if isinstance(permission_keys, list):
            return list(dict.fromkeys([key for key in permission_keys if isinstance(key, str)]))

        legacy_permission_keys = [
            key
            for key, value in role.permissions.items()
            if isinstance(key, str) and isinstance(value, bool) and value
        ]
        return list(dict.fromkeys(legacy_permission_keys))

    def get_permission_queryset(self, role):
        """按角色 type 只返回对应 scope 的权限。"""
        qs = Permission.objects.filter(is_active=True)
        if role.type == WorkspaceRole.RoleType.WORKSPACE:
            qs = qs.filter(scope="workspace")
        elif role.type == WorkspaceRole.RoleType.PROJECT_TEMPLATE:
            qs = qs.filter(scope="project")
        return qs.order_by("module", "sort_order", "key")

    def build_response_data(self, role):
        bound_permission_keys = self.get_bound_permission_keys(role)
        permission_serializer = PermissionSerializer(
            self.get_permission_queryset(role),
            many=True,
            context={"bound_permission_keys": bound_permission_keys},
        )
        return {
            "role": WorkspaceRoleSerializer(role).data,
            "permission_keys": bound_permission_keys,
            "permissions": permission_serializer.data,
        }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        role = self.get_role()
        if not role:
            return Response({"error": "Workspace role not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(self.build_response_data(role), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        role = self.get_role()
        if not role:
            return Response({"error": "Workspace role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = WorkspaceRolePermissionBindingSerializer(
            data=request.data,
            context={"role": role},
        )
        if serializer.is_valid():
            role = serializer.save()
            return Response(self.build_response_data(role), status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
