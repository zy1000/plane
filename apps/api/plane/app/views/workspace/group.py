# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers import (
    WorkspaceGroupSerializer,
    WorkspaceGroupMemberSerializer,
    WorkspaceGroupRoleSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Workspace, WorkspaceGroup, WorkspaceGroupMember, WorkspaceGroupRole


WORKSPACE_GROUP_LOOKUP_PERMISSIONS = (
    PermissionKey.WORKSPACE_GROUP_VIEW,
    PermissionKey.WORKSPACE_GROUP_CREATE,
    PermissionKey.WORKSPACE_GROUP_EDIT,
    PermissionKey.WORKSPACE_GROUP_DELETE,
    PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER,
    PermissionKey.WORKSPACE_GROUP_MANAGE_ROLE,
)


class WorkspaceGroupViewSet(BaseViewSet):
    serializer_class = WorkspaceGroupSerializer
    model = WorkspaceGroup
    use_read_replica = True
    search_fields = ["name", "description"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "created_by", "updated_by")
            .annotate(
                # Count() 走 SQL JOIN，不会经过 SoftDeletionManager，需显式排除软删除
                member_count=Count(
                    "group_members",
                    filter=Q(group_members__deleted_at__isnull=True),
                    distinct=True,
                ),
                role_count=Count(
                    "group_roles",
                    filter=Q(group_roles__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
        )

    @allow_fine_permission(*WORKSPACE_GROUP_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*WORKSPACE_GROUP_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        workspace_group = self.get_queryset().filter(pk=pk).first()
        if not workspace_group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(workspace_group)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_CREATE, level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = self.get_serializer(data=request.data, context={"workspace": workspace})

        if serializer.is_valid():
            serializer.save(workspace=workspace)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_EDIT, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_group = self.get_queryset().filter(pk=pk).first()
        if not workspace_group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            workspace_group,
            data=request.data,
            partial=True,
            context={"workspace": workspace_group.workspace},
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_DELETE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        workspace_group = self.get_queryset().filter(pk=pk).first()
        if not workspace_group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace_group.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceGroupMemberViewSet(BaseViewSet):
    serializer_class = WorkspaceGroupMemberSerializer
    model = WorkspaceGroupMember
    use_read_replica = True

    def get_group(self):
        return WorkspaceGroup.objects.filter(
            id=self.kwargs.get("group_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(
                group__workspace__slug=self.kwargs.get("slug"),
                group_id=self.kwargs.get("group_id"),
            )
            .select_related("group", "member", "member__member", "member__member__avatar_asset")
        )

    @allow_fine_permission(
        PermissionKey.WORKSPACE_GROUP_VIEW,
        PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER,
        level="WORKSPACE",
    )
    def list(self, request, slug, group_id):
        group = self.get_group()
        if not group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER, level="WORKSPACE")
    def create(self, request, slug, group_id):
        group = self.get_group()
        if not group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(data=request.data, context={"group": group})
        if serializer.is_valid():
            serializer.save(group=group)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER, level="WORKSPACE")
    def destroy(self, request, slug, group_id, pk):
        workspace_group_member = self.get_queryset().filter(pk=pk).first()
        if not workspace_group_member:
            return Response({"error": "Workspace group member not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace_group_member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceGroupRoleViewSet(BaseViewSet):
    serializer_class = WorkspaceGroupRoleSerializer
    model = WorkspaceGroupRole
    use_read_replica = True

    def get_group(self):
        return WorkspaceGroup.objects.filter(
            id=self.kwargs.get("group_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(
                group__workspace__slug=self.kwargs.get("slug"),
                group_id=self.kwargs.get("group_id"),
            )
            .select_related("group", "role", "role__workspace")
        )

    @allow_fine_permission(
        PermissionKey.WORKSPACE_GROUP_VIEW,
        PermissionKey.WORKSPACE_GROUP_MANAGE_ROLE,
        level="WORKSPACE",
    )
    def list(self, request, slug, group_id):
        group = self.get_group()
        if not group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_MANAGE_ROLE, level="WORKSPACE")
    def create(self, request, slug, group_id):
        group = self.get_group()
        if not group:
            return Response({"error": "Workspace group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(data=request.data, context={"group": group})
        if serializer.is_valid():
            serializer.save(group=group)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_MANAGE_ROLE, level="WORKSPACE")
    def destroy(self, request, slug, group_id, pk):
        workspace_group_role = self.get_queryset().filter(pk=pk).first()
        if not workspace_group_role:
            return Response({"error": "Workspace group role not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace_group_role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
