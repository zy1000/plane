# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""DRF 权限类。读 = 能进项目（成员 / 直通身份 / 白名单访客），写 = 对应的 key。"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from plane.app.permissions.base import (
    is_project_member,
    is_workspace_member,
    resolve_project_grant,
    workspace_context,
)
from plane.app.permissions.keys import PermissionKey


def _project_keys(request, view):
    return resolve_project_grant(request.user, view.workspace_slug, str(view.project_id or "")).keys


class ProjectBasePermission(BasePermission):
    """项目本身：读 = 工作区成员（列表按可见性过滤），建 = workspace.project.create，改 / 删看项目 key。"""

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        if request.method in SAFE_METHODS:
            return is_workspace_member(request.user, view.workspace_slug)
        if request.method == "POST":
            return PermissionKey.WORKSPACE_PROJECT_CREATE.value in workspace_context(
                request.user, view.workspace_slug
            ).keys
        if request.method == "DELETE":
            return PermissionKey.PROJECT_SETTINGS_DELETE.value in _project_keys(request, view)
        return PermissionKey.PROJECT_SETTINGS_EDIT.value in _project_keys(request, view)


class ProjectMemberPermission(BasePermission):
    """项目成员管理：读 = 工作区成员，写 = project.member.manage。"""

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        if request.method in SAFE_METHODS:
            return is_workspace_member(request.user, view.workspace_slug)
        return PermissionKey.PROJECT_MEMBER_MANAGE.value in _project_keys(request, view)


class IssueSchemeConfigPermission(BasePermission):
    """工作项配置视图（类型 / 扩展字段）：项目级路由读 = 项目成员、写 = project.issue_type.manage；
    方案级路由（模板中心维护类型库）按工作项方案权限，见 check_issue_scheme_route_permission。"""

    def has_permission(self, request, view):
        from .base import check_issue_scheme_route_permission, is_issue_scheme_route

        if request.user.is_anonymous:
            return False
        if is_issue_scheme_route(view.kwargs):
            return check_issue_scheme_route_permission(request, view.kwargs) is None
        if request.method in SAFE_METHODS:
            return is_project_member(request.user, view.workspace_slug, str(view.project_id or ""))
        return PermissionKey.PROJECT_ISSUE_TYPE_MANAGE.value in _project_keys(request, view)


class ProjectEntityPermission(BasePermission):
    """项目内的通用实体：项目成员即可，细的写权限由视图上的 key 装饰器判。"""

    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        project_identifier = getattr(view, "project_identifier", None)
        if project_identifier and not getattr(view, "project_id", None):
            from plane.db.models import Project

            project_id = (
                Project.objects.filter(workspace__slug=view.workspace_slug, identifier=project_identifier)
                .values_list("id", flat=True)
                .first()
            )
            return is_project_member(request.user, view.workspace_slug, str(project_id or ""))
        return is_project_member(request.user, view.workspace_slug, str(view.project_id or ""))


class ProjectAdminPermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        return PermissionKey.PROJECT_SETTINGS_EDIT.value in _project_keys(request, view)


class ProjectLitePermission(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_anonymous:
            return False
        return is_project_member(request.user, view.workspace_slug, str(view.project_id or ""))
