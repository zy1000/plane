# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count, Q, OuterRef, Prefetch, Subquery, IntegerField
from django.utils import timezone
from django.db.models.functions import Coalesce

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_workspace_member,
)
from plane.app.permissions.base import _get_user_workspace_permission_keys

# Module imports
from plane.app.serializers import (
    ProjectMemberRoleSerializer,
    WorkspaceMemberAdminSerializer,
    WorkspaceMemberMeSerializer,
    WorkspaceMemberCustomRolesSerializer,
    WorkspaceMemberGroupsSerializer,
    WorkspaceMyAccessSerializer,
    WorkSpaceMemberSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    DraftIssue,
    Project,
    ProjectMember,
    WorkspaceMember,
    WorkspaceMemberRole,
    Workspace,
    WorkspaceGroupMember,
    WorkspaceGroupRole,
    WorkspaceRole,
)
from plane.utils.cache import invalidate_cache
from plane.utils.workspace_access import build_workspace_my_access

from .. import BaseViewSet


WORKSPACE_MEMBER_LOOKUP_PERMISSIONS = (
    PermissionKey.WORKSPACE_MEMBER_VIEW,
    PermissionKey.WORKSPACE_MEMBER_INVITE,
    PermissionKey.WORKSPACE_MEMBER_EDIT,
    PermissionKey.WORKSPACE_MEMBER_REMOVE,
    PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER,
)

WORKSPACE_MEMBER_ADMIN_DETAIL_PERMISSIONS = {
    PermissionKey.WORKSPACE_MEMBER_INVITE.value,
    PermissionKey.WORKSPACE_MEMBER_EDIT.value,
    PermissionKey.WORKSPACE_MEMBER_REMOVE.value,
}

ACTIVE_WORKSPACE_MEMBER_ROLES_PREFETCH = Prefetch(
    "member_roles",
    queryset=WorkspaceMemberRole.objects.filter(
        deleted_at__isnull=True,
        role__deleted_at__isnull=True,
        role__legacy_role__isnull=True,
        role__type=WorkspaceRole.RoleType.WORKSPACE,
    ).select_related("role"),
    to_attr="active_member_roles",
)


class WorkSpaceMemberViewSet(BaseViewSet):
    serializer_class = WorkspaceMemberAdminSerializer
    model = WorkspaceMember

    search_fields = ["member__display_name", "member__first_name"]
    use_read_replica = True

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "member", "member__avatar_asset")
            .prefetch_related("custom_roles", ACTIVE_WORKSPACE_MEMBER_ROLES_PREFETCH)
        )

    def _get_group_role_ids_by_member(self, workspace_members):
        if not workspace_members:
            return {}

        workspace_id = workspace_members[0].workspace_id
        member_ids = [workspace_member.id for workspace_member in workspace_members]
        group_role_ids_by_member = {member_id: [] for member_id in member_ids}
        group_role_rows = (
            WorkspaceGroupRole.objects.filter(
                group__group_members__member_id__in=member_ids,
                group__workspace_id=workspace_id,
                group__group_members__deleted_at__isnull=True,
                deleted_at__isnull=True,
                role__workspace_id=workspace_id,
                role__deleted_at__isnull=True,
                role__type=WorkspaceRole.RoleType.WORKSPACE,
            )
            .values_list("group__group_members__member_id", "role_id")
            .distinct()
        )
        for member_id, role_id in group_role_rows:
            group_role_ids_by_member[member_id].append(str(role_id))
        return group_role_ids_by_member

    def _get_group_ids_by_member(self, workspace_members):
        if not workspace_members:
            return {}

        workspace_id = workspace_members[0].workspace_id
        member_ids = [workspace_member.id for workspace_member in workspace_members]
        group_ids_by_member = {member_id: [] for member_id in member_ids}
        group_rows = (
            WorkspaceGroupMember.objects.filter(
                member_id__in=member_ids,
                group__workspace_id=workspace_id,
                group__deleted_at__isnull=True,
                deleted_at__isnull=True,
            )
            .values_list("member_id", "group_id")
            .distinct()
        )
        for member_id, group_id in group_rows:
            group_ids_by_member[member_id].append(str(group_id))
        return group_ids_by_member

    def _can_view_admin_details(self, request, slug):
        permission_keys = getattr(
            request, "_plane_workspace_permission_keys", None
        )
        if permission_keys is None:
            permission_keys = _get_user_workspace_permission_keys(request.user, slug)
        return bool(
            permission_keys.intersection(
                WORKSPACE_MEMBER_ADMIN_DETAIL_PERMISSIONS
            )
        )

    @allow_fine_permission(*WORKSPACE_MEMBER_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def list(self, request, slug):
        workspace_members = list(self.get_queryset())
        serializer_class = (
            WorkspaceMemberAdminSerializer
            if self._can_view_admin_details(request, slug)
            else WorkSpaceMemberSerializer
        )
        serializer = serializer_class(
            workspace_members,
            fields=("id", "member", "role", "custom_role_ids", "group_role_ids", "group_ids"),
            many=True,
            context={
                "group_role_ids_by_member": self._get_group_role_ids_by_member(
                    workspace_members
                ),
                "group_ids_by_member": self._get_group_ids_by_member(workspace_members),
            },
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*WORKSPACE_MEMBER_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        try:
            # Get the specific workspace member by pk
            member = self.get_queryset().get(pk=pk)
        except WorkspaceMember.DoesNotExist:
            return Response(
                {"error": "Workspace member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer_class = (
            WorkspaceMemberAdminSerializer
            if self._can_view_admin_details(request, slug)
            else WorkSpaceMemberSerializer
        )
        serializer = serializer_class(
            member,
            fields=("id", "member", "role", "custom_role_ids", "group_role_ids", "group_ids"),
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_EDIT, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        workspace_member = WorkspaceMember.objects.get(
            pk=pk, workspace__slug=slug, member__is_bot=False, is_active=True
        )
        if workspace_member.workspace.owner_id == workspace_member.member_id:
            return Response(
                {"error": "The workspace owner cannot be modified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkSpaceMemberSerializer(workspace_member, data=request.data, partial=True)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_REMOVE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Check the user role who is deleting the user
        workspace_member = WorkspaceMember.objects.get(
            workspace__slug=slug, pk=pk, member__is_bot=False, is_active=True
        )

        if workspace_member.member_id == request.user.id:
            return Response(
                {"error": "You cannot remove yourself from the workspace. Please use leave workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if workspace_member.workspace.owner_id == workspace_member.member_id:
            return Response(
                {"error": "The workspace owner cannot be removed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            Project.objects.annotate(
                total_members=Count("project_projectmember"),
                member_with_role=Count(
                    "project_projectmember",
                    filter=Q(
                        project_projectmember__member_id=workspace_member.member_id,
                        project_projectmember__role=20,
                    ),
                ),
            )
            .filter(total_members=1, member_with_role=1, workspace__slug=slug)
            .exists()
        ):
            return Response(
                {
                    "error": "User is a part of some projects where they are the only admin, they should either leave that project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        workspace_member.is_active = False
        workspace_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        url_params=True,
        user=False,
        multiple=True,
    )
    @invalidate_cache(path="/api/users/me/settings/")
    @invalidate_cache(path="api/users/me/workspaces/", user=False, multiple=True)
    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_LEAVE, level="WORKSPACE")
    def leave(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)

        if workspace_member.workspace.owner_id == request.user.id:
            return Response(
                {"error": "Transfer workspace ownership before leaving."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            Project.objects.annotate(
                total_members=Count("project_projectmember"),
                member_with_role=Count(
                    "project_projectmember",
                    filter=Q(
                        project_projectmember__member_id=request.user.id,
                        project_projectmember__role=20,
                    ),
                ),
            )
            .filter(total_members=1, member_with_role=1, workspace__slug=slug)
            .exists()
        ):
            return Response(
                {
                    "error": "You are a part of some projects where you are the only admin, you should either leave the project or promote another user to admin."  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # # Deactivate the users from the projects where the user is part of
        _ = ProjectMember.objects.filter(
            workspace__slug=slug, member_id=workspace_member.member_id, is_active=True
        ).update(is_active=False, updated_at=timezone.now())

        # # Deactivate the user
        workspace_member.is_active = False
        workspace_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserViewsEndpoint(BaseAPIView):
    @allow_workspace_member
    def post(self, request, slug):
        workspace_member = WorkspaceMember.objects.get(workspace__slug=slug, member=request.user, is_active=True)
        workspace_member.view_props = request.data.get("view_props", {})
        workspace_member.save()

        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceMemberUserEndpoint(BaseAPIView):
    use_read_replica = True

    @allow_workspace_member
    def get(self, request, slug):
        draft_issue_count = (
            DraftIssue.objects.filter(created_by=request.user, workspace_id=OuterRef("workspace_id"))
            .values("workspace_id")
            .annotate(count=Count("id"))
            .values("count")
        )

        workspace_member = (
            WorkspaceMember.objects.filter(member=request.user, workspace__slug=slug, is_active=True)
            .annotate(draft_issue_count=Coalesce(Subquery(draft_issue_count, output_field=IntegerField()), 0))
            .prefetch_related(ACTIVE_WORKSPACE_MEMBER_ROLES_PREFETCH)
            .first()
        )
        if not workspace_member:
            return Response(
                {"error": "Workspace member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = WorkspaceMemberMeSerializer(workspace_member)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceMemberCustomRolesAPIView(BaseAPIView):
    def get_member(self, slug, pk):
        return (
            WorkspaceMember.objects.filter(
                pk=pk,
                workspace__slug=slug,
                is_active=True,
                deleted_at__isnull=True,
            )
            .select_related("workspace")
            .prefetch_related(ACTIVE_WORKSPACE_MEMBER_ROLES_PREFETCH)
            .first()
        )

    @allow_fine_permission(*WORKSPACE_MEMBER_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def get(self, request, slug, pk):
        workspace_member = self.get_member(slug, pk)
        if not workspace_member:
            return Response(
                {"error": "Workspace member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            {"custom_role_ids": [str(role.role_id) for role in workspace_member.active_member_roles]},
            status=status.HTTP_200_OK,
        )

    @transaction.atomic
    @allow_fine_permission(PermissionKey.WORKSPACE_MEMBER_EDIT, level="WORKSPACE")
    def put(self, request, slug, pk):
        workspace_member = self.get_member(slug, pk)
        if not workspace_member:
            return Response(
                {"error": "Workspace member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if workspace_member.workspace.owner_id == workspace_member.member_id:
            return Response(
                {"error": "The workspace owner cannot be modified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = WorkspaceMemberCustomRolesSerializer(
            data=request.data,
            context={
                "workspace": workspace_member.workspace,
                "member": workspace_member,
                "actor": request.user,
            },
        )
        if serializer.is_valid():
            return Response(serializer.save(), status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceMemberGroupsAPIView(BaseAPIView):
    def get_member(self, slug, pk):
        return (
            WorkspaceMember.objects.filter(
                pk=pk,
                workspace__slug=slug,
                is_active=True,
                deleted_at__isnull=True,
            )
            .select_related("workspace")
            .first()
        )

    @allow_fine_permission(*WORKSPACE_MEMBER_LOOKUP_PERMISSIONS, level="WORKSPACE")
    def get(self, request, slug, pk):
        workspace_member = self.get_member(slug, pk)
        if not workspace_member:
            return Response(
                {"error": "Workspace member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        group_ids = [
            str(group_id)
            for group_id in WorkspaceGroupMember.objects.filter(
                member=workspace_member,
                group__workspace=workspace_member.workspace,
                group__deleted_at__isnull=True,
                deleted_at__isnull=True,
            )
            .values_list("group_id", flat=True)
            .distinct()
        ]
        return Response({"group_ids": group_ids}, status=status.HTTP_200_OK)

    @transaction.atomic
    @allow_fine_permission(PermissionKey.WORKSPACE_GROUP_MANAGE_MEMBER, level="WORKSPACE")
    def put(self, request, slug, pk):
        workspace_member = self.get_member(slug, pk)
        if not workspace_member:
            return Response(
                {"error": "Workspace member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = WorkspaceMemberGroupsSerializer(
            data=request.data,
            context={
                "workspace": workspace_member.workspace,
                "member": workspace_member,
                "actor": request.user,
            },
        )
        if serializer.is_valid():
            return Response(serializer.save(), status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceMyPermissionKeysAPIView(BaseAPIView):
    @allow_workspace_member
    def get(self, request, slug):
        return Response(
            {
                "permission_keys": sorted(
                    _get_user_workspace_permission_keys(request.user, slug)
                )
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceMyAccessAPIView(BaseAPIView):
    use_read_replica = True

    @allow_workspace_member
    def get(self, request, slug):
        workspace = Workspace.objects.filter(
            slug=slug,
            deleted_at__isnull=True,
        ).first()
        if not workspace:
            return Response(
                {"error": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = WorkspaceMyAccessSerializer(
            build_workspace_my_access(workspace, request.user)
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceProjectMemberEndpoint(BaseAPIView):
    serializer_class = ProjectMemberRoleSerializer
    model = ProjectMember

    @allow_workspace_member
    def get(self, request, slug):
        # Fetch all project IDs where the user is involved
        project_ids = (
            ProjectMember.objects.filter(member=request.user, is_active=True)
            .values_list("project_id", flat=True)
            .distinct()
        )

        # Get all the project members in which the user is involved
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug, project_id__in=project_ids, is_active=True
        ).select_related("project", "member", "workspace")
        project_members = ProjectMemberRoleSerializer(project_members, many=True).data

        project_members_dict = dict()

        # Construct a dictionary with project_id as key and project_members as value
        for project_member in project_members:
            project_id = project_member.pop("project")
            if str(project_id) not in project_members_dict:
                project_members_dict[str(project_id)] = []
            project_members_dict[str(project_id)].append(project_member)

        return Response(project_members_dict, status=status.HTTP_200_OK)
