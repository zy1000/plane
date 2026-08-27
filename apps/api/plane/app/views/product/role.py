from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.product import ProductRoleSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Product, ProductRole
from plane.utils.product import can_manage_product


class ProductRoleViewSet(BaseViewSet):
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
        context["product"] = self._get_product()
        return context

    def _get_product(self):
        return (
            Product.objects.filter(
                pk=self.kwargs.get("product_id"),
                workspace__slug=self.workspace_slug,
            )
            .select_related("workspace")
            .first()
        )

    def _permission_error(self, request, product):
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission to manage product roles."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def _get_role(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def list(self, request, slug, product_id):
        product = self._get_product()
        permission_error = self._permission_error(request, product)
        if permission_error:
            return permission_error
        return Response(
            self.get_serializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def retrieve(self, request, slug, product_id, pk):
        product = self._get_product()
        permission_error = self._permission_error(request, product)
        if permission_error:
            return permission_error
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(role).data, status=status.HTTP_200_OK)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def create(self, request, slug, product_id):
        product = self._get_product()
        permission_error = self._permission_error(request, product)
        if permission_error:
            return permission_error
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product, permissions={})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _update(self, request, pk, partial):
        product = self._get_product()
        permission_error = self._permission_error(request, product)
        if permission_error:
            return permission_error
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(role, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product, permissions=role.permissions)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def update(self, request, slug, product_id, pk):
        return self._update(request, pk, partial=False)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def partial_update(self, request, slug, product_id, pk):
        return self._update(request, pk, partial=True)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def destroy(self, request, slug, product_id, pk):
        product = self._get_product()
        permission_error = self._permission_error(request, product)
        if permission_error:
            return permission_error
        role = self._get_role(pk)
        if role is None:
            return Response(
                {"error": "Product role not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
