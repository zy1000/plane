# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import WorkspaceMember, ProjectMember, ProjectMemberRole, ProjectRole
from functools import wraps
from rest_framework.response import Response
from rest_framework import status

from enum import Enum


class ROLE(Enum):
    ADMIN = 20
    MEMBER = 15
    GUEST = 5


def _get_user_workspace_permission_keys(user, workspace_slug: str) -> set:
    """
    计算用户在某工作区内的有效 permission_keys 集合。
    目前仅从 WorkspaceRole(type=workspace) 取键，后续可扩展为合并多角色。
    此函数是第二阶段细粒度鉴权的基础，首阶段暂不强制使用。
    """
    from plane.db.models import WorkspaceRole

    workspace_member = WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        is_active=True,
    ).select_related("workspace").first()

    if not workspace_member:
        return set()

    roles = WorkspaceRole.objects.filter(
        workspace=workspace_member.workspace,
        type=WorkspaceRole.RoleType.WORKSPACE,
    )
    keys: set = set()
    for role in roles:
        perms = role.permissions if isinstance(role.permissions, dict) else {}
        for k in perms.get("permission_keys", []):
            if isinstance(k, str):
                keys.add(k)
    return keys


def _get_user_project_permission_keys(user, workspace_slug: str, project_id: str) -> set:
    """
    计算用户在某项目内的有效 permission_keys 集合。
    目前仅从直接绑定的 ProjectRole 取键，后续可合并组角色。
    此函数是第二阶段细粒度鉴权的基础，首阶段暂不强制使用。
    """

    project_member = ProjectMember.objects.filter(
        member=user,
        workspace__slug=workspace_slug,
        project_id=project_id,
        is_active=True,
    ).first()

    if not project_member:
        return set()

    role_ids = ProjectMemberRole.objects.filter(
        member=project_member,
    ).values_list("role_id", flat=True)

    roles = ProjectRole.objects.filter(pk__in=role_ids)
    keys: set = set()
    for role in roles:
        perms = role.permissions if isinstance(role.permissions, dict) else {}
        for k in perms.get("permission_keys", []):
            if isinstance(k, str):
                keys.add(k)
    return keys


def allow_workspace_permission(*permission_keys: str):
    """
    基于细粒度 permission key 的工作区鉴权装饰器（第二阶段专用）。
    用法：@allow_workspace_permission("workspace.role.view", "workspace.role.edit")
    当用户拥有任意一个指定 key 时放行。
    """

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            user_keys = _get_user_workspace_permission_keys(request.user, slug)
            if user_keys.intersection(permission_keys):
                return view_func(instance, request, *args, **kwargs)
            return Response(
                {"error": "You don't have the required workspace permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator


def allow_project_permission(*permission_keys: str):
    """
    基于细粒度 permission key 的项目鉴权装饰器（第二阶段专用）。
    用法：@allow_project_permission("project.role.view")
    当用户拥有任意一个指定 key 时放行。
    """

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            project_id = str(kwargs.get("project_id", ""))
            user_keys = _get_user_project_permission_keys(request.user, slug, project_id)
            if user_keys.intersection(permission_keys):
                return view_func(instance, request, *args, **kwargs)
            return Response(
                {"error": "您没有所需的项目权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator


def allow_permission(allowed_roles, level="PROJECT", creator=False, model=None):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            # Check for creator if required
            if creator and model:
                obj = model.objects.filter(id=kwargs["pk"], created_by=request.user).exists()
                if obj:
                    return view_func(instance, request, *args, **kwargs)

            # Convert allowed_roles to their values if they are enum members
            allowed_role_values = [role.value if isinstance(role, ROLE) else role for role in allowed_roles]

            # Check role permissions
            if level == "WORKSPACE":
                if WorkspaceMember.objects.filter(
                        member=request.user,
                        workspace__slug=kwargs["slug"],
                        role__in=allowed_role_values,
                        is_active=True,
                ).exists():
                    return view_func(instance, request, *args, **kwargs)
            else:
                is_user_has_allowed_role = ProjectMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    project_id=kwargs["project_id"],
                    role__in=allowed_role_values,
                    is_active=True,
                ).exists()

                # Return if the user has the allowed role else if they are workspace admin and part of the project regardless of the role # noqa: E501
                if is_user_has_allowed_role:
                    return view_func(instance, request, *args, **kwargs)
                elif (
                        ProjectMember.objects.filter(
                            member=request.user,
                            workspace__slug=kwargs["slug"],
                            project_id=kwargs["project_id"],
                            is_active=True,
                        ).exists()
                        and WorkspaceMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    role=ROLE.ADMIN.value,
                    is_active=True,
                ).exists()
                ):
                    return view_func(instance, request, *args, **kwargs)

            # Return permission denied if no conditions are met
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator
