# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Min, Prefetch
from django.utils import timezone

# Module imports
from .base import BaseViewSet, BaseAPIView
from plane.app.serializers import (
    ProjectMemberSerializer,
    ProjectMemberAdminSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberPreferenceSerializer,
)

from plane.app.permissions import WorkspaceUserPermission, PermissionKey
from plane.app.permissions.base import _get_user_project_permission_keys

from plane.db.models import Project, ProjectMember, ProjectUserProperty, WorkspaceMember
from plane.db.models.project import ProjectRole, ProjectMemberRole
from plane.bgtasks.project_add_user_email_task import project_add_user_email
from plane.utils.host import base_host
from plane.app.permissions.base import allow_permission, ROLE, allow_fine_permission


ACTIVE_MEMBER_ROLES_PREFETCH = Prefetch(
    "member_roles",
    queryset=ProjectMemberRole.objects.filter(
        deleted_at__isnull=True,
        role__deleted_at__isnull=True
    ).select_related("role"),
    to_attr="active_member_roles",
)


class ProjectMemberViewSet(BaseViewSet):
    serializer_class = ProjectMemberAdminSerializer
    model = ProjectMember

    search_fields = ["member__display_name", "member__first_name"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(member__is_bot=False)
            .filter()
            .select_related("project")
            .select_related("member")
            .select_related("workspace", "workspace__owner")
        )

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_INVITE)
    def create(self, request, slug, project_id):
        # Get the list of members to be added to the project and their roles i.e. the user_id and the role
        members = request.data.get("members", [])

        # get the project
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        # Check if the members array is empty
        if not len(members):
            return Response(
                {"error": "At least one member is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        member_ids = []
        member_role_ids = {}
        requested_role_ids = set()
        for member in members:
            member_id = member.get("member_id")
            if not member_id:
                return Response(
                    {"error": "Member is required"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            role_ids = member.get("role_ids", member.get("custom_role_ids", []))
            if not isinstance(role_ids, list):
                return Response(
                    {"error": "role_ids must be a list"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            normalized_role_ids = list(
                dict.fromkeys(str(role_id) for role_id in role_ids if role_id)
            )
            if not normalized_role_ids:
                return Response(
                    {"error": "At least one role is required for each member"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            normalized_member_id = str(member_id)
            member_ids.append(normalized_member_id)
            member_role_ids[normalized_member_id] = normalized_role_ids
            requested_role_ids.update(normalized_role_ids)

        valid_roles = list(
            ProjectRole.objects.filter(
                pk__in=requested_role_ids,
                project_id=project_id,
            )
        )
        valid_role_by_id = {str(role.id): role for role in valid_roles}
        invalid_role_ids = sorted(
            requested_role_ids.difference(valid_role_by_id.keys())
        )
        if invalid_role_ids:
            return Response(
                {"error": f"Invalid role IDs: {', '.join(invalid_role_ids)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Initialize the bulk arrays
        bulk_project_members = []
        bulk_issue_props = []

        # Create a dictionary of the member_id and their roles
        member_roles = {
            str(member.get("member_id")): member.get("role", ROLE.MEMBER.value)
            for member in members
        }

        # Update roles in the members array based on the member_roles dictionary and set is_active to True
        for project_member in ProjectMember.objects.filter(
            project_id=project_id,
            member_id__in=member_ids,
        ):
            project_member.role = member_roles[str(project_member.member_id)]
            project_member.is_active = True
            bulk_project_members.append(project_member)

        # Update the roles of the existing members
        ProjectMember.objects.bulk_update(
            bulk_project_members, ["is_active", "role"], batch_size=100
        )

        # Get the minimum sort_order for each member in the workspace
        member_sort_orders = (
            ProjectUserProperty.objects.filter(
                workspace__slug=slug,
                user_id__in=member_ids,
            )
            .values("user_id")
            .annotate(min_sort_order=Min("sort_order"))
        )
        # Convert to dictionary for easy lookup: {user_id: min_sort_order}
        sort_order_map = {
            str(item["user_id"]): item["min_sort_order"] for item in member_sort_orders
        }

        # Loop through requested members
        for member in members:
            member_id = str(member.get("member_id"))
            # Get the minimum sort_order for this member, or use default
            min_sort_order = sort_order_map.get(member_id)
            # Create a new project member
            bulk_project_members.append(
                ProjectMember(
                    member_id=member.get("member_id"),
                    role=member.get("role", ROLE.MEMBER.value),
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                )
            )
            # Create a new issue property
            bulk_issue_props.append(
                ProjectUserProperty(
                    user_id=member.get("member_id"),
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    sort_order=(
                        min_sort_order - 10000 if min_sort_order is not None else 65535
                    ),
                )
            )

        # Bulk create the project members and issue properties
        project_members = ProjectMember.objects.bulk_create(
            bulk_project_members, batch_size=10, ignore_conflicts=True
        )

        _ = ProjectUserProperty.objects.bulk_create(
            bulk_issue_props, batch_size=10, ignore_conflicts=True
        )

        project_members = ProjectMember.objects.filter(
            project_id=project_id,
            member_id__in=member_ids,
        )
        project_members_by_member_id = {
            str(project_member.member_id): project_member for project_member in project_members
        }
        project_member_ids = [project_member.id for project_member in project_members]

        for project_member in project_members:
            role_ids = member_role_ids.get(str(project_member.member_id), [])
            ProjectMemberRole.objects.filter(
                member=project_member,
                deleted_at__isnull=True,
            ).exclude(role_id__in=role_ids).delete(soft=False)

        existing_role_ids_by_project_member_id = {}
        existing_role_rows = ProjectMemberRole.objects.filter(
            member_id__in=project_member_ids,
            deleted_at__isnull=True,
            role__deleted_at__isnull=True,
        ).values_list("member_id", "role_id")
        for project_member_id, role_id in existing_role_rows:
            existing_role_ids_by_project_member_id.setdefault(project_member_id, set()).add(str(role_id))

        project_member_roles = []
        for member_id, role_ids in member_role_ids.items():
            project_member = project_members_by_member_id.get(member_id)
            if not project_member:
                continue
            existing_role_ids = existing_role_ids_by_project_member_id.get(
                project_member.id, set()
            )
            project_member_roles.extend(
                ProjectMemberRole(
                    member=project_member,
                    role=valid_role_by_id[role_id],
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for role_id in role_ids
                if role_id not in existing_role_ids
            )

        if project_member_roles:
            ProjectMemberRole.objects.bulk_create(
                project_member_roles, ignore_conflicts=True
            )

        project_members = ProjectMember.objects.filter(
            project_id=project_id,
            member_id__in=member_ids,
        ).prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
        # Send emails to notify the users
        [
            project_add_user_email.delay(
                base_host(request=request, is_app=True),
                project_member.id,
                request.user.id,
            )
            for project_member in project_members
        ]
        # Serialize the project members
        serializer = ProjectMemberRoleSerializer(project_members, many=True)
        # Return the serialized data
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def list(self, request, slug, project_id):
        # Get the list of project members for the project
        project_members = (
            ProjectMember.objects.filter(
                project_id=project_id,
                workspace__slug=slug,
                member__is_bot=False,
                is_active=True,
                member__member_workspace__workspace__slug=slug,
                member__member_workspace__is_active=True,
            )
            .select_related("project", "member", "workspace")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
        )

        serializer = ProjectMemberRoleSerializer(
            project_members, fields=("id", "member", "role"), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, slug, project_id, pk):
        requesting_project_member = ProjectMember.objects.get(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        )

        project_member = (
            ProjectMember.objects.filter(
                pk=pk,
                project_id=project_id,
                workspace__slug=slug,
                member__is_bot=False,
                is_active=True,
            )
            .select_related("project", "member", "workspace")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
            .first()
        )

        if not project_member:
            return Response(
                {"error": "Project member not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if requesting_project_member.role > ROLE.GUEST.value:
            serializer = ProjectMemberAdminSerializer(project_member)
        else:
            serializer = ProjectMemberRoleSerializer(
                project_member, fields=("id", "member", "role")
            )

        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, project_id, pk):
        project_member = ProjectMember.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, is_active=True
        )

        # Fetch the workspace role of the project member
        workspace_role = WorkspaceMember.objects.get(
            workspace__slug=slug, member=project_member.member, is_active=True
        ).role
        is_workspace_admin = workspace_role == ROLE.ADMIN.value

        # Check if the user is not editing their own role if they are not an admin
        if request.user.id == project_member.member_id and not is_workspace_admin:
            return Response(
                {"error": "You cannot update your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Check while updating user roles
        requested_project_member = ProjectMember.objects.get(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        )

        if workspace_role in [5] and int(
            request.data.get("role", project_member.role)
        ) in [15, 20]:
            return Response(
                {
                    "error": "You cannot add a user with role higher than the workspace role"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            "role" in request.data
            and int(request.data.get("role", project_member.role))
            > requested_project_member.role
            and not is_workspace_admin
        ):
            return Response(
                {"error": "You cannot update a role that is higher than your own role"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ProjectMemberSerializer(
            project_member, data=request.data, partial=True
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_REMOVE)
    def destroy(self, request, slug, project_id, pk):
        project_member = ProjectMember.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            pk=pk,
            member__is_bot=False,
            is_active=True,
        )
        # check requesting user role
        requesting_project_member = ProjectMember.objects.get(
            workspace__slug=slug,
            member=request.user,
            project_id=project_id,
            is_active=True,
        )
        # User cannot remove himself
        if str(project_member.id) == str(requesting_project_member.id):
            return Response(
                {
                    "error": "You cannot remove yourself from the workspace. Please use leave workspace"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # User cannot deactivate higher role
        if requesting_project_member.role < project_member.role:
            return Response(
                {"error": "You cannot remove a user having role higher than you"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_LEAVE)
    def leave(self, request, slug, project_id):
        project_member = ProjectMember.objects.get(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            is_active=True,
        )

        # Check if the leaving user is the only admin of the project
        if (
            project_member.role == 20
            and not ProjectMember.objects.filter(
                workspace__slug=slug, project_id=project_id, role=20, is_active=True
            ).count()
            > 1
        ):
            return Response(
                {
                    "error": "You cannot leave the project as your the only admin of the project you will have to either delete the project or create an another admin"  # noqa: E501
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Deactivate the user
        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMemberUserEndpoint(BaseAPIView):
    def get(self, request, slug, project_id):
        project_member = ProjectMember.objects.get(
            project_id=project_id,
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        )
        serializer = ProjectMemberSerializer(project_member)

        return Response(serializer.data, status=status.HTTP_200_OK)


class UserProjectRolesEndpoint(BaseAPIView):
    permission_classes = [WorkspaceUserPermission]
    use_read_replica = True

    def get(self, request, slug):
        project_members = ProjectMember.objects.filter(
            workspace__slug=slug,
            member_id=request.user.id,
            is_active=True,
            member__member_workspace__workspace__slug=slug,
            member__member_workspace__is_active=True,
        ).values("project_id", "role")

        project_members = {
            str(member["project_id"]): member["role"] for member in project_members
        }
        return Response(project_members, status=status.HTTP_200_OK)


class ProjectMemberCustomRolesAPIView(BaseAPIView):
    """管理项目成员的自定义角色（支持多角色）"""

    def get_project_member(self, slug, project_id, pk):
        return (
            ProjectMember.objects.filter(
                pk=pk,
                project_id=project_id,
                project__workspace__slug=slug,
                is_active=True,
            )
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
            .first()
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        project_member = self.get_project_member(slug, project_id, pk)
        if not project_member:
            return Response(
                {"error": "Project member not found."}, status=status.HTTP_404_NOT_FOUND
            )
        custom_role_ids = [
            str(member_role.role_id) for member_role in project_member.active_member_roles
        ]
        return Response({"custom_role_ids": custom_role_ids}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_BIND_ROLE)
    def put(self, request, slug, project_id, pk):
        project_member = self.get_project_member(slug, project_id, pk)
        if not project_member:
            return Response(
                {"error": "Project member not found."}, status=status.HTTP_404_NOT_FOUND
            )

        role_ids = request.data.get("custom_role_ids", [])
        if not isinstance(role_ids, list):
            return Response(
                {"error": "custom_role_ids 必须是列表。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 验证角色 ID 均属于该项目
        valid_roles = list(
            ProjectRole.objects.filter(
                pk__in=role_ids,
                project_id=project_id,
            )
        )
        valid_role_id_set = {str(r.id) for r in valid_roles}
        invalid_ids = [rid for rid in role_ids if str(rid) not in valid_role_id_set]
        if invalid_ids:
            return Response(
                {"error": f"无效的角色 ID：{', '.join(str(i) for i in invalid_ids)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 软删除不在新集合中的已有角色关联
        ProjectMemberRole.objects.filter(
            member=project_member,
            deleted_at__isnull=True,
        ).exclude(role_id__in=valid_role_id_set).delete(soft=False)

        # 添加新的角色关联
        existing_active_role_ids = set(
            str(rid)
            for rid in ProjectMemberRole.objects.filter(
                member=project_member,
                deleted_at__isnull=True,
                role__deleted_at__isnull=True,
            ).values_list("role_id", flat=True)
        )
        to_create = [
            ProjectMemberRole(
                member=project_member,
                role=role,
                created_by=request.user,
                updated_by=request.user,
                project_id=project_id,
                workspace=project_member.workspace,
            )
            for role in valid_roles
            if str(role.id) not in existing_active_role_ids
        ]
        if to_create:
            ProjectMemberRole.objects.bulk_create(to_create, ignore_conflicts=True)

        final_role_ids = [
            str(rid)
            for rid in ProjectMemberRole.objects.filter(
                member=project_member,
                deleted_at__isnull=True,
                role__deleted_at__isnull=True,
            ).values_list("role_id", flat=True)
        ]
        return Response({"custom_role_ids": final_role_ids}, status=status.HTTP_200_OK)


class ProjectMyPermissionKeysAPIView(BaseAPIView):
    """返回当前登录用户在指定项目内的有效 permission_keys 列表。"""

    def get(self, request, slug, project_id):
        try:
            keys = _get_user_project_permission_keys(
                request.user, slug, str(project_id)
            )
        except Exception:
            keys = set()
        return Response({"permission_keys": sorted(keys)}, status=status.HTTP_200_OK)


class ProjectMemberPreferenceEndpoint(BaseAPIView):
    def get_queryset(self, slug, project_id, member_id):
        return ProjectMember.objects.get(
            project_id=project_id,
            member_id=member_id,
            workspace__slug=slug,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, member_id):
        project_member = self.get_queryset(slug, project_id, member_id)

        serializer = ProjectMemberPreferenceSerializer(
            project_member, {"preferences": request.data}, partial=True
        )

        if serializer.is_valid():
            serializer.save()

            return Response(
                {"preferences": serializer.data["preferences"]},
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, member_id):
        project_member = self.get_queryset(slug, project_id, member_id)

        serializer = ProjectMemberPreferenceSerializer(project_member)

        return Response(serializer.data, status=status.HTTP_200_OK)
