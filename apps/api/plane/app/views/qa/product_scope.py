"""用例 / 用例库 / 用例评审的产品作用域（2026-11 起用例从项目挪到产品）。

产品没有自己的 key：用户在任一活跃关联项目里有 project.test_case.* / project.case_review.*，
在这个产品上就有（permissions/base.py::_get_user_product_permission_keys）。
产品必须属于 URL 里的工作区，否则 404。
"""

from enum import Enum
from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions.base import _get_user_product_permission_keys, is_workspace_member
from plane.db.models import Product, TestCaseRepository


def allow_product_scope(*args):
    """``@allow_product_scope``：看得见这个产品即可；``@allow_product_scope(PermissionKey.X, ...)``：还要持有任一 key。"""

    def build(view_func, wanted):
        @wraps(view_func)
        def _wrapped_view(instance, request, *view_args, **kwargs):
            from plane.utils.product import can_view_product

            slug = kwargs.get("slug", "")
            if not is_workspace_member(request.user, slug):
                return Response({"error": "You must be an active workspace member."}, status=status.HTTP_403_FORBIDDEN)
            product = Product.objects.filter(id=kwargs.get("product_id"), workspace__slug=slug).select_related(
                "workspace"
            ).first()
            if product is None:
                return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
            if not can_view_product(request.user, product):
                return Response({"error": "您没有所需的产品权限。"}, status=status.HTTP_403_FORBIDDEN)
            if wanted and not (_get_user_product_permission_keys(request.user, product) & wanted):
                return Response({"error": "您没有所需的产品权限。"}, status=status.HTTP_403_FORBIDDEN)
            return view_func(instance, request, *view_args, **kwargs)

        return _wrapped_view

    if len(args) == 1 and callable(args[0]) and not isinstance(args[0], Enum):
        return build(args[0], set())
    wanted = {key.value if isinstance(key, Enum) else str(key) for key in args}
    return lambda view_func: build(view_func, wanted)


def product_repository_ids(product_id):
    """产品下未删除的用例库 id（子查询用）。"""
    return (
        TestCaseRepository.objects.filter(product_id=product_id, is_template=False)
        .order_by()
        .values_list("id", flat=True)
    )
