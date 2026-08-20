# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.db.models import (
    Permission,
    Workspace,
    WorkspaceMember,
    WorkspaceMemberRole,
    WorkspaceRole,
    ProjectMember,
    ProjectRole,
    IssueType,
    Project,
    TestCaseRepository,
)
from plane.db.models.issue_type import (
    ISSUE_TYPE_PERMISSION_ACTIONS,
    build_issue_type_permission_key,
)
from plane.utils.project_access import get_user_project_role_ids
from plane.license.models import Instance, InstanceAdmin
from functools import wraps
from rest_framework.response import Response
from rest_framework import status

from enum import Enum
from typing import Iterable, Optional

from .keys import PermissionKey


class ROLE(Enum):
    ADMIN = 20
    MEMBER = 15
    GUEST = 5


def _get_user_workspace_permission_keys(user, workspace_slug: str) -> set:
    """Return direct-role and group-role workspace permissions for a user."""
    if not user or getattr(user, "is_anonymous", True):
        return set()

    workspace = Workspace.objects.filter(slug=workspace_slug).first()
    if not workspace:
        return set()

    if workspace.owner_id == user.id or _is_instance_admin(user):
        return set(
            Permission.objects.filter(
                scope="workspace",
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("key", flat=True)
        )

    workspace_member = WorkspaceMember.objects.filter(
        member=user,
        workspace=workspace,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    if not workspace_member:
        return set()

    direct_role_ids = WorkspaceMemberRole.objects.filter(
        member=workspace_member,
        workspace=workspace,
        deleted_at__isnull=True,
        role__deleted_at__isnull=True,
        role__legacy_role__isnull=True,
        role__type=WorkspaceRole.RoleType.WORKSPACE,
    ).values_list("role_id", flat=True)
    group_role_ids = WorkspaceRole.objects.filter(
        workspace=workspace,
        type=WorkspaceRole.RoleType.WORKSPACE,
        legacy_role__isnull=True,
        deleted_at__isnull=True,
        role_groups__deleted_at__isnull=True,
        role_groups__group__workspace=workspace,
        role_groups__group__deleted_at__isnull=True,
        role_groups__group__group_members__deleted_at__isnull=True,
        role_groups__group__group_members__member=workspace_member,
    ).values_list("id", flat=True)

    raw_keys = set()
    roles = WorkspaceRole.objects.filter(
        id__in=set(direct_role_ids) | set(group_role_ids),
        workspace=workspace,
        type=WorkspaceRole.RoleType.WORKSPACE,
        legacy_role__isnull=True,
        deleted_at__isnull=True,
    )
    for role in roles:
        permissions = role.permissions if isinstance(role.permissions, dict) else {}
        raw_keys.update(
            key
            for key in permissions.get("permission_keys", [])
            if isinstance(key, str)
        )

    return set(
        Permission.objects.filter(
            key__in=raw_keys,
            scope="workspace",
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("key", flat=True)
    )


def _is_instance_admin(user) -> bool:
    instance = Instance.objects.first()
    if not instance:
        return False
    return InstanceAdmin.objects.filter(instance=instance, user=user).exists()


def is_workspace_member(user, workspace_slug: str) -> bool:
    if not user or getattr(user, "is_anonymous", True):
        return False
    workspace = Workspace.objects.filter(slug=workspace_slug).first()
    if not workspace:
        return False
    if workspace.owner_id == user.id or _is_instance_admin(user):
        return True
    return WorkspaceMember.objects.filter(
        member=user,
        workspace=workspace,
        is_active=True,
        deleted_at__isnull=True,
    ).exists()


def allow_workspace_member(view_func):
    """Require active workspace membership without applying a business permission."""

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        if is_workspace_member(request.user, kwargs.get("slug", "")):
            return view_func(instance, request, *args, **kwargs)
        return Response(
            {"error": "You must be an active workspace member."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return _wrapped_view


def allow_workspace_self_or_permission(permission_key, user_kwarg="user_id"):
    """Allow a member to access self-owned data or require a workspace key."""

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            target_user_id = kwargs.get(user_kwarg)
            if str(target_user_id) == str(request.user.id) and is_workspace_member(
                request.user, slug
            ):
                return view_func(instance, request, *args, **kwargs)

            normalized_key = (
                permission_key.value
                if isinstance(permission_key, Enum)
                else str(permission_key)
            )
            if normalized_key in _get_user_workspace_permission_keys(
                request.user, slug
            ):
                return view_func(instance, request, *args, **kwargs)
            return Response(
                {"error": "You don't have the required workspace permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator


def _get_all_issue_type_permission_keys_for_project(project_id: str) -> set:
    """当前项目下所有未删除 IssueType 衍生出来的全部 project.issue_type.<id_hex>.<action> 集合。"""
    issue_type_ids = IssueType.objects.filter(
        project_id=project_id, deleted_at__isnull=True
    ).values_list("id", flat=True)
    return {
        build_issue_type_permission_key(issue_type_id, action)
        for issue_type_id in issue_type_ids
        for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS
    }


def _get_user_project_permission_keys(
    user,
    workspace_slug: str,
    project_id: str,
    *,
    project: Optional[Project] = None,
    role_ids: Optional[Iterable] = None,
) -> set:
    """
    计算用户在某项目内的有效 permission_keys 集合。
    合并直接绑定的 ProjectRole 和工作区团队在当前项目中的角色授权。
    此函数是第二阶段细粒度鉴权的基础，首阶段暂不强制使用。

    可选传入已加载的 project / role_ids，避免调用方重复查询。
    """
    if project is None:
        project = Project.objects.select_related("project_lead", "created_by").get(
            pk=project_id
        )
    if (
        user == project.project_lead
        or _is_instance_admin(user)
        or user == project.created_by
    ):
        # 项目负责人 / 实例管理员 / 项目创建者拥有项目内的全部权限。
        # PermissionKey.values() 仅覆盖静态枚举，issue_type 衍生 key 必须额外注入，
        # 否则这些超级用户会无法对工作项做 create/edit/delete/archive/unarchive。
        return set(
            PermissionKey.values()
        ) | _get_all_issue_type_permission_keys_for_project(project_id)

    if role_ids is None:
        resolved_role_ids = get_user_project_role_ids(user, workspace_slug, project_id)
    else:
        resolved_role_ids = set(role_ids)
    if not resolved_role_ids:
        return set()

    roles = ProjectRole.objects.filter(pk__in=resolved_role_ids, deleted_at__isnull=True)
    keys: set = set()
    for role in roles:
        perms = role.permissions if isinstance(role.permissions, dict) else {}
        for k in perms.get("permission_keys", []):
            if isinstance(k, str):
                keys.add(k)
    return keys


_ISSUE_TYPE_ALLOWED_ACTIONS = frozenset(
    action for action, _ in ISSUE_TYPE_PERMISSION_ACTIONS
)


def resolve_project_issue_type_name(
    project_id: str, issue_type_id: str
) -> Optional[str]:
    """根据 project_id + issue_type_id 反查 IssueType 名称，找不到返回 None。

    保留这个函数以便调用方做"type_id 是否合法"的快速校验。鉴权本身不再依赖名字。
    """
    issue_type = IssueType.objects.filter(
        project_id=project_id,
        id=issue_type_id,
        deleted_at__isnull=True,
    ).first()
    if not issue_type:
        return None
    return issue_type.name


def get_issue_permission_key(
    action: str, issue_type_id: Optional[str] = None
) -> Optional[str]:
    """根据 action 与 issue_type_id 推导对应的项目级权限 key。

    issue_type_id 为空时无法生成 key，返回 None；调用方应据此拒绝放行。
    """
    if action not in _ISSUE_TYPE_ALLOWED_ACTIONS:
        raise ValueError(f"Unsupported issue permission action: {action}")
    if not issue_type_id:
        return None
    return build_issue_type_permission_key(issue_type_id, action)


def get_project_from_qa(request):
    """测试模块目前传入的参数有一些不带project_id，所以需要从其他关系获取"""
    project_id = ""
    repository_id = (
        request.query_params.get("repository_id")
        or request.data.get("repository_id")
        or request.query_params.get("repository")
        or request.data.get("repository")
    )
    if repository_id:
        project_id = (
            TestCaseRepository.objects.filter(pk=repository_id)
            .values_list("project_id", flat=True)
            .first()
        )
    return project_id


def has_project_issue_permission(
    user,
    workspace_slug: str,
    project_id: str,
    action: str,
    issue_type_id: Optional[str] = None,
    issue_assignee_ids: Optional[Iterable] = None,
) -> bool:
    # edit: assignees may update the issue when issue_assignee_ids is provided; None skips this bypass.
    if (
        action == "edit"
        and issue_assignee_ids is not None
        and user.pk in issue_assignee_ids
    ):
        return True
    required_permission = get_issue_permission_key(
        action=action, issue_type_id=issue_type_id
    )
    if not required_permission:
        return False
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
                request._plane_workspace_permission_keys = user_keys
                error_msg = "You don't have the required workspace permissions."
            else:
                project_id = (
                    str(kwargs.get("project_id", ""))
                    or str(kwargs.get("pk", ""))
                    or request.query_params.get("project_id", "")
                )
                if not project_id:
                    project_id = get_project_from_qa(request)
                user_keys = _get_user_project_permission_keys(
                    request.user, slug, project_id
                )
                error_msg = "您没有所需的项目权限。"
            normalized_permission_keys = {
                key.value if isinstance(key, Enum) else str(key)
                for key in permission_keys
            }
            if user_keys.intersection(normalized_permission_keys):
                return view_func(instance, request, *args, **kwargs)
            return Response({"error": error_msg}, status=status.HTTP_403_FORBIDDEN)

        return _wrapped_view

    return decorator


def allow_fine_permission_or_template(*permission_keys: str):
    """QA 用例端点专用：模板库操作放行工作区成员，否则走项目细粒度鉴权。

    模板库（is_template=True，必然 project 为空）没有项目语境，项目分支必 403，
    故对本工作区的模板库退化为工作区成员校验。
    分支条件必须是 is_template 而非 project 为空——存量「跨项目共享库」
    （project 为空且非模板）维持原有行为，不放宽安全面。
    """

    def decorator(view_func):
        fine_wrapped = allow_fine_permission(*permission_keys)(view_func)

        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            repository_id = (
                request.query_params.get("repository_id")
                or request.data.get("repository_id")
                or request.query_params.get("repository")
                or request.data.get("repository")
            )
            if repository_id:
                is_template_repo = TestCaseRepository.objects.filter(
                    pk=repository_id,
                    workspace__slug=slug,
                    is_template=True,
                ).exists()
                if is_template_repo and is_workspace_member(request.user, slug):
                    return view_func(instance, request, *args, **kwargs)
            return fine_wrapped(instance, request, *args, **kwargs)

        return _wrapped_view

    return decorator


def allow_permission(allowed_roles, level="PROJECT", creator=False, model=None):
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            if level == "WORKSPACE":
                if not is_workspace_member(request.user, kwargs["slug"]):
                    return Response(
                        {"error": "You don't have the required permissions."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                if creator and model:
                    if not model.objects.filter(
                        id=kwargs["pk"], created_by=request.user
                    ).exists():
                        return Response(
                            {"error": "You don't have the required permissions."},
                            status=status.HTTP_403_FORBIDDEN,
                        )
                return view_func(instance, request, *args, **kwargs)

            # Check for creator if required
            if creator and model:
                obj = model.objects.filter(
                    id=kwargs["pk"], created_by=request.user
                ).exists()
                if obj:
                    return view_func(instance, request, *args, **kwargs)

            # Convert allowed_roles to their values if they are enum members
            allowed_role_values = [
                role.value if isinstance(role, ROLE) else role for role in allowed_roles
            ]

            # Check role permissions
            if level != "WORKSPACE":
                is_user_has_allowed_role = ProjectMember.objects.filter(
                    member=request.user,
                    workspace__slug=kwargs["slug"],
                    project_id=kwargs["project_id"],
                    role__in=allowed_role_values,
                    is_active=True,
                ).exists()

                if is_user_has_allowed_role:
                    return view_func(instance, request, *args, **kwargs)

            # Return permission denied if no conditions are met
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return _wrapped_view

    return decorator
