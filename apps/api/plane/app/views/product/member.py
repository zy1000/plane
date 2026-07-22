from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.product import (
    ProductMemberCustomRolesSerializer,
    ProductMemberInviteSerializer,
    ProductMemberSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Product, ProductMember, Workspace
from plane.utils.product import (
    can_manage_product,
    can_manage_workspace_products,
    can_view_product,
)


class ProductMemberViewSet(BaseViewSet):
    model = ProductMember
    serializer_class = ProductMemberSerializer
    search_fields = [
        "member__display_name",
        "member__first_name",
        "member__last_name",
        "member__email",
    ]
    filterset_fields = {
        "member_id": ["exact"],
    }

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(product__workspace__slug=self.workspace_slug)
            .select_related("product", "product__workspace", "member")
            .prefetch_related("custom_roles")
        )
        product_id = self.kwargs.get("product_id")
        if product_id is not None:
            queryset = queryset.filter(product_id=product_id)
        role_id = self.request.query_params.get("role_id")
        if role_id:
            queryset = queryset.filter(custom_roles__id=role_id)

        workspace = Workspace.objects.filter(slug=self.workspace_slug).first()
        if workspace is None:
            return queryset.none()

        if can_manage_workspace_products(self.request.user, workspace):
            return self.filter_queryset(queryset).distinct()

        queryset = queryset.filter(
            Q(product__network=2)
            | Q(product__owner=self.request.user)
            | Q(product__reviewers=self.request.user)
            | Q(product__network=0, product__member_product__member=self.request.user)
        )
        return self.filter_queryset(queryset).distinct()

    def _get_product(self, product_id):
        if not product_id:
            return None
        return Product.objects.filter(
            pk=product_id,
            workspace__slug=self.workspace_slug,
        ).select_related("workspace").first()

    def _get_visible_product(self, product_id):
        product = self._get_product(product_id)
        if product is None or not can_view_product(self.request.user, product):
            return None
        return product

    def _get_member(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def invite(self, request, slug, product_id=None):
        product_id = product_id or request.data.get("product")
        product = self._get_product(product_id)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission to invite product members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()
        data["product"] = product.id
        serializer = ProductMemberInviteSerializer(
            data=data,
            context={"workspace_slug": slug},
        )
        serializer.is_valid(raise_exception=True)
        product_member = serializer.save()
        return Response(
            self.get_serializer(product_member).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def list(self, request, slug, product_id):
        if self._get_visible_product(product_id) is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def retrieve(self, request, slug, product_id, pk):
        product_member = self._get_member(pk)
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(product_member).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def assign_roles(self, request, slug, product_id, pk):
        product_member = self._get_member(pk)
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product_member.product):
            return Response(
                {"error": "You do not have permission to assign product roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ProductMemberCustomRolesSerializer(
            product_member,
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)
        product_member = serializer.save()
        return Response(
            self.get_serializer(product_member).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def destroy(self, request, slug, product_id, pk):
        product_member = self._get_member(pk)
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product_member.product):
            return Response(
                {"error": "You do not have permission to remove product members."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product_member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
