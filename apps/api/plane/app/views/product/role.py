from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_workspace_member,
)
from plane.app.permissions.base import _get_user_product_permission_keys
from plane.app.serializers import PermissionSerializer
from plane.app.serializers.product import (
    ProductRolePermissionBindingSerializer,
    ProductRoleSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Permission, Product, ProductRole
from plane.utils.product import can_view_product


def _get_product(slug, product_id):
    return (
        Product.objects.filter(pk=product_id, workspace__slug=slug)
        .select_related("workspace")
        .first()
    )


def _get_visible_product(request, slug, product_id):
    product = _get_product(slug, product_id)
    if product is None or not can_view_product(request.user, product):
        return None
    return product


class ProductRoleViewSet(BaseViewSet):
    """读角色列表放开给能看见产品的人；增删改要 product.role.manage。"""

    model = ProductRole
    serializer_class = ProductRoleSerializer
    search_fields = ["name", "description"]

    def get_queryset(self):
        return self.filter_queryset(
            super().get_queryset().filter(
                product_id=self.kwargs.get("product_id"),
                product__workspace__slug=self.workspace_slug,
            )
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["product"] = _get_product(self.workspace_slug, self.kwargs.get("product_id"))
        return context

    def _get_role(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_workspace_member
    def list(self, request, slug, product_id):
        if _get_visible_product(request, slug, product_id) is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_workspace_member
    def retrieve(self, request, slug, product_id, pk):
        if _get_visible_product(request, slug, product_id) is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(role).data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PRODUCT_ROLE_MANAGE, level="PRODUCT")
    def create(self, request, slug, product_id):
        product = _get_product(slug, product_id)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _update(self, request, pk, partial):
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(role, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PRODUCT_ROLE_MANAGE, level="PRODUCT")
    def update(self, request, slug, product_id, pk):
        return self._update(request, pk, partial=False)

    @allow_fine_permission(PermissionKey.PRODUCT_ROLE_MANAGE, level="PRODUCT")
    def partial_update(self, request, slug, product_id, pk):
        return self._update(request, pk, partial=True)

    @allow_fine_permission(PermissionKey.PRODUCT_ROLE_MANAGE, level="PRODUCT")
    def destroy(self, request, slug, product_id, pk):
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductRolePermissionAPIView(BaseAPIView):
    """查看和修改 ProductRole 的权限绑定。响应形状与项目侧一致。"""

    def get_role(self, slug, product_id, pk):
        return ProductRole.objects.filter(
            product_id=product_id,
            product__workspace__slug=slug,
            pk=pk,
        ).first()

    def get_bound_permission_keys(self, role):
        if not isinstance(role.permissions, dict):
            return []
        permission_keys = role.permissions.get("permission_keys", [])
        if isinstance(permission_keys, list):
            return list(
                dict.fromkeys([k for k in permission_keys if isinstance(k, str)])
            )
        return []

    def build_response_data(self, role):
        bound_permission_keys = self.get_bound_permission_keys(role)
        permissions = Permission.objects.filter(
            is_active=True, scope="product"
        ).order_by("module", "sort_order", "key")
        permission_serializer = PermissionSerializer(
            permissions,
            many=True,
            context={"bound_permission_keys": bound_permission_keys},
        )
        return {
            "role": ProductRoleSerializer(role).data,
            "permission_keys": bound_permission_keys,
            "permissions": permission_serializer.data,
        }

    @allow_workspace_member
    def get(self, request, slug, product_id, pk):
        if _get_visible_product(request, slug, product_id) is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )
        role = self.get_role(slug, product_id, pk)
        if not role:
            return Response(
                {"error": "Product role not found."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(self.build_response_data(role), status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PRODUCT_ROLE_MANAGE, level="PRODUCT")
    def patch(self, request, slug, product_id, pk):
        role = self.get_role(slug, product_id, pk)
        if not role:
            return Response(
                {"error": "Product role not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = ProductRolePermissionBindingSerializer(
            data=request.data, context={"role": role}
        )
        if serializer.is_valid():
            # 只有 role.manage 的人不能靠改角色权限给自己加权：新增的 key 必须是自己已有的。
            # 去掉 key 不受限；产品管理员 / 直通用户持全部 key，不受影响。
            added_keys = set(serializer.validated_data["permission_keys"]) - set(
                self.get_bound_permission_keys(role)
            )
            if added_keys and not added_keys.issubset(
                _get_user_product_permission_keys(request.user, role.product)
            ):
                return Response(
                    {"error": "不能把自己没有的产品权限绑定到角色上。"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            role = serializer.save()
            return Response(self.build_response_data(role), status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProductMyPermissionKeysAPIView(BaseAPIView):
    """当前登录用户在指定产品内的有效 permission_keys。"""

    @allow_workspace_member
    def get(self, request, slug, product_id):
        product = _get_product(slug, product_id)
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )
        keys = _get_user_product_permission_keys(request.user, product)
        return Response({"permission_keys": sorted(keys)}, status=status.HTTP_200_OK)
