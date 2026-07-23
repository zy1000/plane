# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers import (
    ProjectGroupMemberOptionSerializer,
    ProjectGroupRoleSerializer,
    ProjectGroupSummarySerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import (
    Project,
    ProjectGroupRole,
    ProjectMember,
    WorkspaceGroup,
    WorkspaceGroupMember,
)


PROJECT_GROUP_LOOKUP_PERMISSIONS = (
    PermissionKey.PROJECT_GROUP_GRANT_VIEW,
    PermissionKey.PROJECT_GROUP_GRANT_EDIT,
)


class ProjectGroupViewSet(BaseViewSet):
    serializer_class = ProjectGroupSummarySerializer
    model = WorkspaceGroup
    use_read_replica = True

    def get_project(self):
        return Project.objects.filter(
            pk=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_group(self):
        return WorkspaceGroup.objects.filter(
            pk=self.kwargs.get("group_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_queryset(self):
        project_id = self.kwargs.get("project_id")
        grants = ProjectGroupRole.objects.filter(
            project_id=project_id,
            deleted_at__isnull=True,
            role__deleted_at__isnull=True,
        ).select_related("role", "group")
        return (
            WorkspaceGroup.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                deleted_at__isnull=True,
            )
            .annotate(
                member_count=Count(
                    "group_members",
                    filter=Q(
                        group_members__deleted_at__isnull=True,
                        group_members__member__deleted_at__isnull=True,
                        group_members__member__is_active=True,
                    ),
                    distinct=True,
                ),
                project_member_count=Count(
                    "group_members",
                    filter=Q(
                        group_members__deleted_at__isnull=True,
                        group_members__member__deleted_at__isnull=True,
                        group_members__member__is_active=True,
                        group_members__member__member__member_project__project_id=project_id,
                        group_members__member__member__member_project__is_active=True,
                        group_members__member__member__member_project__deleted_at__isnull=True,
                    ),
                    distinct=True,
                ),
            )
            .prefetch_related(
                Prefetch(
                    "project_group_roles",
                    queryset=grants,
                    to_attr="active_project_grants",
                )
            )
            .order_by("name")
        )

    @allow_fine_permission(*PROJECT_GROUP_LOOKUP_PERMISSIONS)
    def list(self, request, slug, project_id):
        if not self.get_project():
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        groups = list(self.get_queryset())
        for group in groups:
            group.grants = group.active_project_grants
        return Response(self.get_serializer(groups, many=True).data, status=status.HTTP_200_OK)

    @allow_fine_permission(*PROJECT_GROUP_LOOKUP_PERMISSIONS)
    def members(self, request, slug, project_id, group_id):
        project = self.get_project()
        group = self.get_group()
        if not project or not group or group.workspace_id != project.workspace_id:
            return Response({"error": "Project group not found."}, status=status.HTTP_404_NOT_FOUND)

        active_project_members = ProjectMember.objects.filter(
            project=project,
            member_id=OuterRef("member__member_id"),
            is_active=True,
            deleted_at__isnull=True,
        )
        memberships = (
            WorkspaceGroupMember.objects.filter(
                group=group,
                deleted_at__isnull=True,
                member__deleted_at__isnull=True,
                member__is_active=True,
                member__member__is_bot=False,
            )
            .select_related("member", "member__member", "member__member__avatar_asset")
            .annotate(is_project_member=Exists(active_project_members))
            .order_by("member__member__display_name", "member__member__email")
        )
        payload = [
            {
                "id": membership.id,
                "workspace_member_id": membership.member_id,
                "member": membership.member.member,
                "is_project_member": membership.is_project_member,
            }
            for membership in memberships
        ]
        serializer = ProjectGroupMemberOptionSerializer(payload, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProjectGroupRoleViewSet(BaseViewSet):
    serializer_class = ProjectGroupRoleSerializer
    model = ProjectGroupRole

    def get_project(self):
        return Project.objects.filter(
            pk=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_group(self):
        return WorkspaceGroup.objects.filter(
            pk=self.kwargs.get("group_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).first()

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                project_id=self.kwargs.get("project_id"),
                project__workspace__slug=self.kwargs.get("slug"),
                group_id=self.kwargs.get("group_id"),
            )
            .select_related("project", "group", "role")
        )

    @allow_fine_permission(PermissionKey.PROJECT_GROUP_GRANT_EDIT)
    def create(self, request, slug, project_id, group_id):
        project = self.get_project()
        group = self.get_group()
        if not project or not group or group.workspace_id != project.workspace_id:
            return Response({"error": "Project group not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            data=request.data,
            context={"project": project, "group": group},
        )
        if serializer.is_valid():
            serializer.save(project=project, group=group)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.PROJECT_GROUP_GRANT_EDIT)
    def partial_update(self, request, slug, project_id, group_id, pk):
        grant = self.get_queryset().filter(pk=pk).first()
        if not grant:
            return Response({"error": "Project group role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            grant,
            data=request.data,
            partial=True,
            context={"project": grant.project, "group": grant.group},
        )
        if serializer.is_valid():
            serializer.save(project=grant.project, group=grant.group)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.PROJECT_GROUP_GRANT_EDIT)
    def destroy(self, request, slug, project_id, group_id, pk):
        grant = self.get_queryset().filter(pk=pk).first()
        if not grant:
            return Response({"error": "Project group role not found."}, status=status.HTTP_404_NOT_FOUND)
        grant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
