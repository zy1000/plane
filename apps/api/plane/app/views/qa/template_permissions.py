"""用例模板库（is_template=True）的工作区级鉴权。

模板库没有项目语境，QA 的项目级 key 在它身上必然 403，所以模板相关的读写统一走
workspace.case_template.*。/test/ 下的模块、标签、用例详情等端点是模板库与项目库
（含存量「跨项目共享库」）共用的，这里按请求指向的库分流：指到模板库就查模板 key，
其余维持原来的「工作区成员即可」，不放宽也不收紧非模板库的安全面。
"""

from functools import wraps

from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    has_workspace_permission,
    is_workspace_member,
)
from plane.db.models import CaseModule, TestCase, TestCaseRepository

#: 读模板库：查看或维护任一即可
CASE_TEMPLATE_READ_KEYS = (
    PermissionKey.WORKSPACE_CASE_TEMPLATE_VIEW,
    PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE,
)

FORBIDDEN_MESSAGE = "您没有所需的用例模板库权限。"

#: 找目标用例库的取值顺序。target_module_id 排在 module_id 前面：模块复制的写入方
#: 是目标库，不是源模块所在的库。
_REPOSITORY_SOURCES = (
    "repository_id",
    "repository",
    "target_module_id",
    "module_id",
    "case_id",
)


def template_permission_error(request, slug, *permission_keys):
    """持有任一 key 返回 None，否则返回 403 Response。"""
    if has_workspace_permission(request.user, slug, *permission_keys):
        return None
    return Response({"error": FORBIDDEN_MESSAGE}, status=status.HTTP_403_FORBIDDEN)


def is_template_repository(slug, repository_id) -> bool:
    if not repository_id:
        return False
    try:
        return TestCaseRepository.objects.filter(
            pk=repository_id, workspace__slug=slug, is_template=True
        ).exists()
    except (ValidationError, ValueError, TypeError):
        # 脏 id 交给下游视图去报 400/404，这里只负责「不是模板库」
        return False


def _lookup_value(request, kwargs, name):
    return (
        kwargs.get(name)
        or request.query_params.get(name)
        or (request.data.get(name) if hasattr(request.data, "get") else None)
    )


def _resolve_repository_id(request, kwargs, slug):
    """按 _REPOSITORY_SOURCES 的顺序找出请求指向的用例库 id；找不到返回 None。"""
    for name in _REPOSITORY_SOURCES:
        value = _lookup_value(request, kwargs, name)
        if not value:
            continue
        if name in ("repository_id", "repository"):
            return value
        if name in ("target_module_id", "module_id"):
            return (
                CaseModule.objects.filter(
                    pk=value, repository__workspace__slug=slug
                )
                .values_list("repository_id", flat=True)
                .first()
            )
        return (
            TestCase.objects.filter(pk=value, repository__workspace__slug=slug)
            .values_list("repository_id", flat=True)
            .first()
        )
    return None


def allow_workspace_member_or_template(*permission_keys):
    """请求指向模板库时要求给定的模板 key，否则退回「活跃工作区成员」。"""

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(instance, request, *args, **kwargs):
            slug = kwargs.get("slug", "")
            if not is_workspace_member(request.user, slug):
                return Response(
                    {"error": "You must be an active workspace member."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                repository_id = _resolve_repository_id(request, kwargs, slug)
            except (ValidationError, ValueError, TypeError):
                repository_id = None
            if is_template_repository(slug, repository_id):
                error = template_permission_error(request, slug, *permission_keys)
                if error is not None:
                    return error
            return view_func(instance, request, *args, **kwargs)

        return _wrapped_view

    return decorator
