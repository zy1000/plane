"""产品集：一行 is_set=True 的产品，增删改查沿用 ProductViewSet，只换序列化器与列表汇总。

集内产品的加入 / 移出规则在 utils/product_set.py。
"""

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission, allow_workspace_member
from plane.app.serializers.data_dictionary import DataDictionaryItemLiteSerializer
from plane.app.serializers.product import ProductSetSerializer
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.mixins import get_scoped_product
from plane.db.models import DataDictionaryItem, User
from plane.utils.product_set import (
    ProductSetError,
    add_products_to_set,
    member_products_queryset,
    member_requirement_counts,
    product_set_stats,
    remove_product_from_set,
)

from .base import ProductViewSet


class ProductSetViewSet(ProductViewSet):
    is_set = True
    serializer_class = ProductSetSerializer
    search_fields = ["name", "identifier"]
    filterset_fields = {"owner_id": ["exact"]}

    def get_queryset(self):
        users = User.objects.select_related("avatar_asset")
        return self._visible_queryset().filter(is_set=True).prefetch_related(Prefetch("owner", queryset=users))

    @allow_workspace_member
    def list(self, request, slug):
        product_sets = list(self.get_queryset())
        rows = self.get_serializer(product_sets, many=True).data
        stats = product_set_stats(product_sets, request.user)
        for row in rows:
            row.update(stats[str(row["id"])])
        return Response(rows, status=status.HTTP_200_OK)


def _member_row(product, counts):
    return {
        "id": product.id,
        "name": product.name,
        "identifier": product.identifier,
        "code": product.code,
        "logo_props": product.logo_props,
        "status_detail": DataDictionaryItemLiteSerializer(product.status).data if product.status_id else None,
        "joined_at": product.product_set_joined_at,
        "referenced_requirement_count": counts["referenced"].get(product.id, 0),
        "converted_requirement_count": counts["converted"].get(product.id, 0),
    }


class ProductSetProductsEndpoint(BaseAPIView):
    """产品集「产品」页签：集内产品的列表、加入、移出。"""

    def _get_product_set(self, request, slug, product_id, for_update=False):
        product_set = get_scoped_product(request.user, slug=slug, product_id=product_id, for_update=for_update)
        return product_set if product_set is not None and product_set.is_set else None

    @allow_workspace_member
    def get(self, request, slug, product_id):
        product_set = self._get_product_set(request, slug, product_id)
        if product_set is None:
            return Response({"error": "Product set not found."}, status=status.HTTP_404_NOT_FOUND)
        members = (
            member_products_queryset(product_set, request.user)
            .prefetch_related(
                Prefetch("status", queryset=DataDictionaryItem.all_objects.select_related("dictionary"))
            )
            .order_by("product_set_joined_at", "created_at")
        )
        members = list(members)
        counts = member_requirement_counts(product_set, [product.id for product in members])
        return Response([_member_row(product, counts) for product in members], status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_PRODUCT_EDIT, level="PRODUCT")
    def post(self, request, slug, product_id):
        product_ids = request.data.get("product_ids")
        if not isinstance(product_ids, list):
            return Response({"error": "product_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with transaction.atomic():
                # 锁产品集这一行：并发往同一个集里加产品时串行，免得各自通过「未属于其他集」的检查
                product_set = self._get_product_set(request, slug, product_id, for_update=True)
                if product_set is None:
                    return Response({"error": "Product set not found."}, status=status.HTTP_404_NOT_FOUND)
                added = add_products_to_set(product_set, product_ids, request.user)
        except ProductSetError as error:
            return Response(error.payload(), status=error.status)
        return Response({"added": [product.id for product in added]}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_PRODUCT_EDIT, level="PRODUCT")
    def delete(self, request, slug, product_id, member_id):
        with transaction.atomic():
            # 锁产品集这一行：与改使用范围、转为自有互斥，免得移出后又被写进一条范围行
            product_set = self._get_product_set(request, slug, product_id, for_update=True)
            if product_set is None:
                return Response({"error": "Product set not found."}, status=status.HTTP_404_NOT_FOUND)
            removed = remove_product_from_set(product_set, member_id, request.user)
        if not removed:
            return Response({"error": "Product is not in this product set."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
