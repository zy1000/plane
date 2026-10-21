# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third Party imports
from rest_framework.permissions import SAFE_METHODS, BasePermission

# Module import
from plane.db.models import ProjectMember
from plane.db.models.project import ROLE
from plane.app.permissions.keys import PermissionKey
from plane.app.permissions.base import (
    _get_user_project_permission_keys,
    _get_user_workspace_permission_keys,
    is_workspace_member,
)


class ProjectBasePermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        ## Safe Methods -> Handle the filtering logic in queryset
        if request.method in SAFE_METHODS:
            return is_workspace_member(request.user, view.workspace_slug)

        ## Only workspace owners or admins can create the projects
        if request.method == "POST":
            return PermissionKey.WORKSPACE_PROJECT_CREATE.value in (
                _get_user_workspace_permission_keys(request.user, view.workspace_slug)
            )

        project_member_qs = ProjectMember.objects.filter(
            workspace__slug=view.workspace_slug,
            member=request.user,
            project_id=view.project_id,
            is_active=True,
        )

        ## Only project admins or workspace admin who is part of the project can access

        return project_member_qs.filter(role=ROLE.ADMIN.value).exists()


class ProjectMemberPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        ## Safe Methods -> Handle the filtering logic in queryset
        if request.method in SAFE_METHODS:
            return ProjectMember.objects.filter(
                workspace__slug=view.workspace_slug, member=request.user, is_active=True
            ).exists()
        ## Only workspace owners or admins can create the projects
        if request.method == "POST":
            return PermissionKey.PROJECT_MEMBER_INVITE.value in (
                _get_user_project_permission_keys(
                    request.user,
                    view.workspace_slug,
                    str(view.project_id),
                )
            )

        ## Only Project Admins can update project attributes
        return ProjectMember.objects.filter(
            workspace__slug=view.workspace_slug,
            member=request.user,
            role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            project_id=view.project_id,
            is_active=True,
        ).exists()



class IssueSchemeConfigPermission(BasePermission):
    """工作项配置视图（类型 / 扩展字段）：项目级路由沿用 ProjectMemberPermission，
    方案级路由（模板中心维护模式方案）按研发模式权限，见 check_issue_scheme_route_permission。"""

    def has_permission(self, request, view):
        from .base import check_issue_scheme_route_permission, is_issue_scheme_route

        if request.user.is_anonymous:
            return False
        if is_issue_scheme_route(view.kwargs):
            return check_issue_scheme_route_permission(request, view.kwargs) is None
        return ProjectMemberPermission().has_permission(request, view)

class ProjectEntityPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        # Handle requests based on project__identifier
        if hasattr(view, "project_identifier") and view.project_identifier:
            if request.method in SAFE_METHODS:
                return ProjectMember.objects.filter(
                    workspace__slug=view.workspace_slug,
                    member=request.user,
                    project__identifier=view.project_identifier,
                    is_active=True,
                ).exists()

        ## Safe Methods -> Handle the filtering logic in queryset
        if request.method in SAFE_METHODS:
            return ProjectMember.objects.filter(
                workspace__slug=view.workspace_slug,
                member=request.user,
                project_id=view.project_id,
                is_active=True,
            ).exists()

        ## Only project members or admins can create and edit the project attributes
        return ProjectMember.objects.filter(
            workspace__slug=view.workspace_slug,
            member=request.user,
            role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            project_id=view.project_id,
            is_active=True,
        ).exists()


class ProjectAdminPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return ProjectMember.objects.filter(
            workspace__slug=view.workspace_slug,
            member=request.user,
            role=ROLE.ADMIN.value,
            project_id=view.project_id,
            is_active=True,
        ).exists()


class ProjectLitePermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False

        return ProjectMember.objects.filter(
            workspace__slug=view.workspace_slug,
            member=request.user,
            project_id=view.project_id,
            is_active=True,
        ).exists()
