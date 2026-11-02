"""用例 / 用例库 / 用例评审的产品作用域（2026-11 起用例从项目挪到产品）。

权限暂不细分（等权限重构统一做）：产品作用域接口只要求是工作区活跃成员，
产品必须属于 URL 里的工作区，否则 404。
"""

from functools import wraps

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions.base import is_workspace_member
from plane.db.models import Product, TestCaseRepository


def allow_product_scope(view_func):
    """要求工作区成员身份，且 URL 的 product_id 属于该工作区。"""

    @wraps(view_func)
    def _wrapped_view(instance, request, *args, **kwargs):
        slug = kwargs.get("slug", "")
        if not is_workspace_member(request.user, slug):
            return Response(
                {"error": "You must be an active workspace member."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not Product.objects.filter(id=kwargs.get("product_id"), workspace__slug=slug).exists():
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        return view_func(instance, request, *args, **kwargs)

    return _wrapped_view


def product_repository_ids(product_id):
    """产品下未删除的用例库 id（子查询用）。"""
    return (
        TestCaseRepository.objects.filter(product_id=product_id, is_template=False)
        .order_by()
        .values_list("id", flat=True)
    )
