# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.response import Response
from rest_framework import serializers as drf_serializers
from rest_framework import status
from django.db import transaction
from django.db.models import Min, Prefetch

# Module imports
from .base import BaseViewSet, BaseAPIView
from plane.app.serializers import (
    ProjectMemberSerializer,
    ProjectMemberAdminSerializer,
    ProjectMemberRoleSerializer,
    ProjectMemberPreferenceSerializer,
)

from plane.app.permissions import allow_project_member, WorkspaceUserPermission, PermissionKey
from plane.app.permissions.base import resolve_project_grant
from plane.app.serializers.user import UserLiteSerializer
from plane.utils.job_role import (
    bulk_set_project_member_job_roles,
    member_job_role_map,
    set_member_job_roles,
    validate_job_role_ids,
)
from plane.utils.permission_groups import PermissionGroupError, resolve_project_group_ids
from plane.utils.project.member import copy_workspace_job_roles

from plane.db.models import Project, ProjectMember, ProjectUserProperty, WorkspaceMember
from plane.db.models.project import ProjectMemberRole
from plane.bgtasks.project_add_user_email_task import project_add_user_email
from plane.utils.host import base_host
from plane.utils.project_access import build_project_member_role_sources
from plane.app.permissions.base import allow_fine_permission


ACTIVE_MEMBER_ROLES_PREFETCH = Prefetch(
    "member_roles",
    queryset=ProjectMemberRole.objects.filter(
        deleted_at__isnull=True,
        role__deleted_at__isnull=True
    ).select_related("role"),
    to_attr="active_member_roles",
)


def _member_list_context(project_members):
    project_members = list(project_members)
    return {
        "role_sources_by_member_id": build_project_member_role_sources(project_members),
        "job_role_ids_by_member_id": member_job_role_map([pm.id for pm in project_members], project=True),
    }


def _set_member_groups(project, project_member, group_ids, actor):
    """整份替换一个项目成员的权限组。group_ids 已解析成本项目的权限组 id。"""
    wanted = {str(value) for value in group_ids}
    ProjectMemberRole.objects.filter(member=project_member).exclude(role_id__in=wanted).delete(soft=False)
    existing = {str(value) for value in ProjectMemberRole.objects.filter(member=project_member).values_list("role_id", flat=True)}
    ProjectMemberRole.objects.bulk_create(
        [
            ProjectMemberRole(
                member=project_member,
                role_id=role_id,
                project=project,
                workspace_id=project.workspace_id,
                created_by=actor,
                updated_by=actor,
            )
            for role_id in wanted - existing
        ],
        ignore_conflicts=True,
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
            .select_related("project", "member", "workspace", "workspace__owner")
        )

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_MANAGE)
    def create(self, request, slug, project_id):
        """添加成员（效果图「添加成员」弹窗）：members=[{member_id, role_ids?, job_role_ids?}]。

        role_ids 是权限组，可以给模板 id（自动生成本项目的引用行）；「项目成员」每人都有，不用传。
        job_role_ids 不传时默认带上此人在工作区的角色。
        """
        members = request.data.get("members", [])
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        if not len(members):
            return Response({"error": "At least one member is required"}, status=status.HTTP_400_BAD_REQUEST)

        member_ids, group_ids_by_member, job_roles_by_member = [], {}, {}
        for member in members:
            member_id = member.get("member_id")
            if not member_id:
                return Response({"error": "Member is required"}, status=status.HTTP_400_BAD_REQUEST)
            group_ids = member.get("role_ids", member.get("custom_role_ids", []))
            job_role_ids = member.get("job_role_ids")
            if not isinstance(group_ids, list) or (job_role_ids is not None and not isinstance(job_role_ids, list)):
                return Response({"error": "role_ids / job_role_ids must be lists"}, status=status.HTTP_400_BAD_REQUEST)
            member_ids.append(str(member_id))
            try:
                group_ids_by_member[str(member_id)] = resolve_project_group_ids(project, group_ids)
            except PermissionGroupError as exc:
                return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
            if job_role_ids is not None:
                valid, invalid = validate_job_role_ids(project.workspace_id, job_role_ids)
                if invalid:
                    return Response({"error": "角色不存在。"}, status=status.HTTP_400_BAD_REQUEST)
                job_roles_by_member[str(member_id)] = valid

        if len(member_ids) != len(set(member_ids)):
            return Response({"error": "Duplicate members are not allowed"}, status=status.HTTP_400_BAD_REQUEST)

        valid_workspace_member_ids = {
            str(member_id)
            for member_id in WorkspaceMember.objects.filter(
                workspace=project.workspace, member_id__in=member_ids, is_active=True, deleted_at__isnull=True
            ).values_list("member_id", flat=True)
        }
        invalid_member_ids = sorted(set(member_ids) - valid_workspace_member_ids)
        if invalid_member_ids:
            return Response(
                {"error": f"Invalid workspace member IDs: {', '.join(invalid_member_ids)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 已有（含停用的）成员重新启用，其余新建
        existing = {str(pm.member_id): pm for pm in ProjectMember.objects.filter(project=project, member_id__in=member_ids)}
        for project_member in existing.values():
            if not project_member.is_active:
                project_member.is_active = True
                project_member.save(update_fields=["is_active"])
        sort_order_map = {
            str(item["user_id"]): item["min_sort_order"]
            for item in ProjectUserProperty.objects.filter(workspace__slug=slug, user_id__in=member_ids)
            .values("user_id")
            .annotate(min_sort_order=Min("sort_order"))
        }
        new_ids = [member_id for member_id in member_ids if member_id not in existing]
        ProjectMember.objects.bulk_create(
            [ProjectMember(member_id=member_id, project=project, workspace_id=project.workspace_id) for member_id in new_ids],
            ignore_conflicts=True,
        )
        ProjectUserProperty.objects.bulk_create(
            [
                ProjectUserProperty(
                    user_id=member_id,
                    project=project,
                    workspace_id=project.workspace_id,
                    sort_order=(sort_order_map[member_id] - 10000) if sort_order_map.get(member_id) is not None else 65535,
                )
                for member_id in new_ids
            ],
            ignore_conflicts=True,
        )

        project_members = {str(pm.member_id): pm for pm in ProjectMember.objects.filter(project=project, member_id__in=member_ids)}
        defaults = [member_id for member_id in member_ids if member_id not in job_roles_by_member]
        copy_workspace_job_roles(project, defaults)
        for member_id, project_member in project_members.items():
            _set_member_groups(project, project_member, group_ids_by_member.get(member_id, []), request.user)
            if member_id in job_roles_by_member:
                set_member_job_roles(project_member, job_roles_by_member[member_id], project=True)

        project_members = (
            ProjectMember.objects.filter(project=project, member_id__in=member_ids)
            .select_related("member")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
        )
        for project_member in project_members:
            if str(project_member.member_id) in new_ids:
                project_add_user_email.delay(base_host(request=request, is_app=True), project_member.id, request.user.id)
        serializer = ProjectMemberRoleSerializer(project_members, many=True, context=_member_list_context(project_members))
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_project_member
    def list(self, request, slug, project_id):
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
            project_members,
            fields=(
                "id",
                "member",
                "created_at",
                "custom_role_ids",
                "job_role_ids",
                "inherited_role_ids",
                "role_template_ids",
                "role_sources",
            ),
            many=True,
            context=_member_list_context(project_members),
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_project_member
    def retrieve(self, request, slug, project_id, pk):
        project_member = (
            ProjectMember.objects.filter(
                pk=pk, project_id=project_id, workspace__slug=slug, member__is_bot=False, is_active=True
            )
            .select_related("project", "member", "workspace")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
            .first()
        )
        if not project_member:
            return Response({"error": "Project member not found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectMemberRoleSerializer(project_member, context=_member_list_context([project_member]))
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_MANAGE)
    def partial_update(self, request, slug, project_id, pk):
        """成员表行内改权限组（role_ids）与角色（job_role_ids）。"""
        project_member = (
            ProjectMember.objects.filter(pk=pk, workspace__slug=slug, project_id=project_id, is_active=True)
            .select_related("project")
            .first()
        )
        if project_member is None:
            return Response({"error": "Project member not found"}, status=status.HTTP_404_NOT_FOUND)
        project = project_member.project
        if "role_ids" in request.data or "custom_role_ids" in request.data:
            try:
                group_ids = resolve_project_group_ids(
                    project, request.data.get("role_ids", request.data.get("custom_role_ids")) or []
                )
            except PermissionGroupError as exc:
                return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
            _set_member_groups(project, project_member, group_ids, request.user)
        if "job_role_ids" in request.data:
            valid, invalid = validate_job_role_ids(project.workspace_id, request.data.get("job_role_ids") or [])
            if invalid:
                return Response({"error": "角色不存在。"}, status=status.HTTP_400_BAD_REQUEST)
            set_member_job_roles(project_member, valid, project=True)
        project_member = ProjectMember.objects.prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH).get(pk=project_member.pk)
        serializer = ProjectMemberRoleSerializer(project_member, context=_member_list_context([project_member]))
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_MANAGE)
    def destroy(self, request, slug, project_id, pk):
        project_member = (
            ProjectMember.objects.filter(
                workspace__slug=slug, project_id=project_id, pk=pk, member__is_bot=False, is_active=True
            )
            .select_related("project")
            .first()
        )
        if project_member is None:
            return Response({"error": "Project member not found"}, status=status.HTTP_404_NOT_FOUND)
        if project_member.member_id == request.user.id:
            return Response(
                {"error": "You cannot remove yourself from the project. Please use leave project"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if project_member.member_id == project_member.project.project_lead_id:
            return Response({"error": "不能移除项目负责人，请先更换负责人。"}, status=status.HTTP_400_BAD_REQUEST)
        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_project_member
    def leave(self, request, slug, project_id):
        project_member = (
            ProjectMember.objects.filter(workspace__slug=slug, project_id=project_id, member=request.user, is_active=True)
            .select_related("project")
            .first()
        )
        if project_member is None:
            return Response({"error": "You are not a member of this project."}, status=status.HTTP_400_BAD_REQUEST)
        if project_member.project.project_lead_id == request.user.id:
            return Response({"error": "项目负责人不能退出项目，请先更换负责人。"}, status=status.HTTP_400_BAD_REQUEST)
        project_member.is_active = False
        project_member.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMemberUserEndpoint(BaseAPIView):
    """当前用户在项目里的身份与有效权限。白名单访客 / 直通身份不是成员的人也返回（id 为空）。"""

    def get(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).select_related("workspace").first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        grant = resolve_project_grant(request.user, slug, project_id, project=project)
        if not grant.is_member:
            return Response({"error": "You are not a member of this project."}, status=status.HTTP_403_FORBIDDEN)
        project_member = (
            ProjectMember.objects.select_related("project", "member", "workspace")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
            .filter(project=project, member=request.user, is_active=True)
            .first()
        )
        extra = {
            "permission_keys": sorted(grant.keys),
            "type_limits": grant.type_limits(),
            "is_passthrough": grant.passthrough,
        }
        if project_member is None:
            return Response(
                {
                    "id": None,
                    "member": UserLiteSerializer(request.user).data,
                    "project": {"id": str(project.id), "name": project.name, "identifier": project.identifier},
                    "custom_role_ids": [],
                    "job_role_ids": [],
                    "role_sources": [],
                    "inherited_role_ids": [],
                    "role_template_ids": [],
                    "preferences": {},
                    "view_props": {},
                    "default_props": {},
                    **extra,
                },
                status=status.HTTP_200_OK,
            )
        context = _member_list_context([project_member])
        context.update({"permission_keys": grant.keys, "type_limits": extra["type_limits"]})
        data = ProjectMemberSerializer(project_member, context=context).data
        data["is_passthrough"] = grant.passthrough
        return Response(data, status=status.HTTP_200_OK)


class UserProjectRolesEndpoint(BaseAPIView):
    """当前用户在工作区里能进哪些项目：{项目 id: {"accessible": true, "member": 是不是成员表里的人}}。
    能进 = 成员 ∪ 负责 ∪ 白名单（utils/visibility.py）；「member」给侧栏「我的项目」用。"""

    permission_classes = [WorkspaceUserPermission]
    use_read_replica = True

    def get(self, request, slug):
        from plane.utils.visibility import visible_project_ids

        member_ids = {
            str(value)
            for value in ProjectMember.objects.filter(
                workspace__slug=slug, member_id=request.user.id, is_active=True
            ).values_list("project_id", flat=True)
        }
        return Response(
            {
                project_id: {"accessible": True, "member": project_id in member_ids}
                for project_id in visible_project_ids(request.user, slug)
            },
            status=status.HTTP_200_OK,
        )


class ProjectMemberCustomRolesAPIView(BaseAPIView):
    """成员的权限组（custom_role_ids）与角色（job_role_ids）。"""

    def get_project_member(self, slug, project_id, pk):
        return (
            ProjectMember.objects.filter(pk=pk, project_id=project_id, project__workspace__slug=slug, is_active=True)
            .select_related("project")
            .prefetch_related(ACTIVE_MEMBER_ROLES_PREFETCH)
            .first()
        )

    def _payload(self, project_member):
        return {
            "custom_role_ids": [str(r.role_id) for r in ProjectMemberRole.objects.filter(member=project_member)],
            "job_role_ids": [str(v) for v in project_member.job_role_links.values_list("job_role_id", flat=True)],
        }

    @allow_project_member
    def get(self, request, slug, project_id, pk):
        project_member = self.get_project_member(slug, project_id, pk)
        if not project_member:
            return Response({"error": "Project member not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._payload(project_member), status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_MANAGE)
    def put(self, request, slug, project_id, pk):
        project_member = self.get_project_member(slug, project_id, pk)
        if not project_member:
            return Response({"error": "Project member not found."}, status=status.HTTP_404_NOT_FOUND)
        project = project_member.project
        if "custom_role_ids" in request.data:
            role_ids = request.data.get("custom_role_ids") or []
            if not isinstance(role_ids, list):
                return Response({"error": "custom_role_ids 必须是列表。"}, status=status.HTTP_400_BAD_REQUEST)
            try:
                group_ids = resolve_project_group_ids(project, role_ids)
            except PermissionGroupError as exc:
                return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
            _set_member_groups(project, project_member, group_ids, request.user)
        if "job_role_ids" in request.data:
            valid, invalid = validate_job_role_ids(project.workspace_id, request.data.get("job_role_ids") or [])
            if invalid:
                return Response({"error": "角色不存在。"}, status=status.HTTP_400_BAD_REQUEST)
            set_member_job_roles(project_member, valid, project=True)
        return Response(self._payload(project_member), status=status.HTTP_200_OK)


class ProjectMemberBulkJobRolesAPIView(BaseAPIView):
    """成员表批量设置角色：member_ids（用户 id）+ job_role_ids，mode=append 追加 / replace 替换原有角色。"""

    @allow_fine_permission(PermissionKey.PROJECT_MEMBER_MANAGE)
    def post(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        mode = request.data.get("mode", "append")
        id_list = drf_serializers.ListField(child=drf_serializers.UUIDField())
        try:
            member_ids = id_list.run_validation(request.data.get("member_ids"))
            job_role_ids = id_list.run_validation(request.data.get("job_role_ids"))
        except drf_serializers.ValidationError:
            return Response({"error": "member_ids / job_role_ids 必须是 id 列表。"}, status=status.HTTP_400_BAD_REQUEST)
        if mode not in ("append", "replace") or not member_ids or (mode == "append" and not job_role_ids):
            return Response({"error": "参数不完整。"}, status=status.HTTP_400_BAD_REQUEST)
        valid, invalid = validate_job_role_ids(project.workspace_id, job_role_ids)
        if invalid:
            return Response({"error": "角色不存在。"}, status=status.HTTP_400_BAD_REQUEST)
        project_members = ProjectMember.objects.filter(project=project, member_id__in=member_ids, is_active=True)
        with transaction.atomic():
            result = bulk_set_project_member_job_roles(project_members, valid, append=mode == "append")
        return Response(result, status=status.HTTP_200_OK)


class ProjectMyPermissionKeysAPIView(BaseAPIView):
    """当前用户在项目内的有效 key 与类型限定。"""

    def get(self, request, slug, project_id):
        grant = resolve_project_grant(request.user, slug, str(project_id))
        return Response(
            {
                "permission_keys": sorted(grant.keys),
                "type_limits": grant.type_limits(),
                "is_member": grant.is_member,
            },
            status=status.HTTP_200_OK,
        )


class ProjectMemberPreferenceEndpoint(BaseAPIView):
    def get_queryset(self, slug, project_id, member_id):
        return ProjectMember.objects.get(
            project_id=project_id,
            member_id=member_id,
            workspace__slug=slug,
        )

    @allow_project_member
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

    @allow_project_member
    def get(self, request, slug, project_id, member_id):
        project_member = self.get_queryset(slug, project_id, member_id)

        serializer = ProjectMemberPreferenceSerializer(project_member)

        return Response(serializer.data, status=status.HTTP_200_OK)
