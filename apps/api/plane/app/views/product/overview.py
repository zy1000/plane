"""产品概览页的数据源：需求 / 测试两块的汇总数字。

只读。产品可见性走 get_scoped_product（看不见一律 404）；各块再按自己页签的读权限收窄，
没权限的块给 None，前端显示「—」而不是整页 403 —— 能进产品就能看概览的骨架与产品信息。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.mixins import can_view_requirements, get_scoped_product
from plane.utils.product import has_product_permission
from plane.utils.product_overview import requirement_summary, test_summary


class ProductOverviewEndpoint(BaseAPIView):
    def get(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        return Response(
            {
                "requirements": (
                    requirement_summary(product) if can_view_requirements(user, product) else None
                ),
                "test": test_summary(
                    product,
                    can_view_cases=has_product_permission(
                        user, product, PermissionKey.PROJECT_TEST_CASE_VIEW
                    ),
                    can_view_reviews=has_product_permission(
                        user, product, PermissionKey.PROJECT_CASE_REVIEW_VIEW
                    ),
                ),
            },
            status=status.HTTP_200_OK,
        )
