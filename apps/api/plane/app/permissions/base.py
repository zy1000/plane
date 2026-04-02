# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import WorkspaceMember, ProjectMember, ProjectMemberRole, ProjectRole, ProjectIssueType, Project, \
    TestCaseRepository
from functools import wraps
from rest_framework.response import Response
from rest_framework import status

from enum import Enum
from typing import Optional

from .keys import PermissionKey


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
    project = Project.objects.get(pk=project_id)
    if user == project.created_by:
        return set(PermissionKey.values())

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


def resolve_project_issue_type_name(project_id: str, issue_type_id: str) -> Optional[str]:
    project_issue_type = (
        ProjectIssueType.objects.filter(
            project_id=project_id,
            issue_type_id=issue_type_id,
            deleted_at__isnull=True,
        )
        .select_related("issue_type")
        .first()
    )
    if not project_issue_type:
        return None
    return project_issue_type.issue_type.name


REQUIREMENT_TYPE_NAMES = {"史诗", "特性", "用户故事"}
DEFECT_TYPE_NAMES = {"缺陷"}
TASK_TYPE_NAMES = {"任务"}


def get_issue_permission_key(action: str, issue_type_name: Optional[str] = None) -> str:
    defect_permission_map = {
        "create": PermissionKey.ISSUE_DEFECT_CREATE,
        "edit": PermissionKey.ISSUE_DEFECT_EDIT,
        "delete": PermissionKey.ISSUE_DEFECT_DELETE,
        "archive": PermissionKey.ISSUE_DEFECT_ARCHIVE,
        "unarchive": PermissionKey.ISSUE_DEFECT_UNARCHIVE,
    }
    requirement_permission_map = {
        "create": PermissionKey.ISSUE_REQUIREMENT_CREATE,
        "edit": PermissionKey.ISSUE_REQUIREMENT_EDIT,
        "delete": PermissionKey.ISSUE_REQUIREMENT_DELETE,
        "archive": PermissionKey.ISSUE_REQUIREMENT_ARCHIVE,
        "unarchive": PermissionKey.ISSUE_REQUIREMENT_UNARCHIVE,
    }
    task_permission_map = {
        "create": PermissionKey.ISSUE_TASK_CREATE,
        "edit": PermissionKey.ISSUE_TASK_EDIT,
        "delete": PermissionKey.ISSUE_TASK_DELETE,
        "archive": PermissionKey.ISSUE_TASK_ARCHIVE,
        "unarchive": PermissionKey.ISSUE_TASK_UNARCHIVE,
    }

    if issue_type_name in DEFECT_TYPE_NAMES:
        permission_map = defect_permission_map
    elif issue_type_name in REQUIREMENT_TYPE_NAMES:
        permission_map = requirement_permission_map
    elif issue_type_name in TASK_TYPE_NAMES:
        permission_map = task_permission_map

    try:
        return permission_map[action]
    except KeyError as exc:
        raise ValueError(f"Unsupported issue permission action: {action}") from exc


def get_project_from_qa(request):
    '''测试模块目前传入的参数有一些不带project_id，所以需要从其他关系获取'''
    project_id = ''
    repository_id = (
            request.query_params.get("repository_id")
            or request.data.get("repository_id")
            or request.query_params.get("repository")
            or request.data.get("repository")
    )
    if repository_id:
        project_id = TestCaseRepository.objects.filter(pk=repository_id).values_list('project_id', flat=True).first()
    return project_id


def has_project_issue_permission(
        user,
        workspace_slug: str,
        project_id: str,
        action: str,
        issue_type_name: Optional[str] = None,
) -> bool:
    required_permission = get_issue_permission_key(action=action, issue_type_name=issue_type_name)
    user_keys = _get_user_project_permission_keys(user, workspace_slug, project_id)
    return required_permission in user_keys


def allow_fine_permission(*permission_keys: str, level: str = "PROJECT"):
    """
    基于细粒度 permission key 的鉴权装饰器。
    用法：
      @allow_fine_permission("project.role.view")                        # 项目级（默认）
      @allow_fine_permission("workspace.role.view", level="WORKSPACE")   # 工作区级
    当用户拥有任意一个指定 key 时放行。
    """

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            if level == "WORKSPACE":
                user_keys = _get_user_workspace_permission_keys(request.user, slug)
                error_msg = "You don't have the required workspace permissions."
            else:
                project_id = (
                    str(kwargs.get("project_id", ""))
                    or str(kwargs.get("pk", ""))
                    or request.query_params.get("project_id", "")
                )
                if not project_id:
                    project_id = get_project_from_qa(request)
                user_keys = _get_user_project_permission_keys(request.user, slug, project_id)
                error_msg = "您没有所需的项目权限。"
            if user_keys.intersection(permission_keys):
                return view_func(instance, request, *args, **kwargs)
            return Response({"error": error_msg}, status=status.HTTP_403_FORBIDDEN)

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
