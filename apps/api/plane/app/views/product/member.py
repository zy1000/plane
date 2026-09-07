from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_workspace_member,
)
from plane.app.serializers.product import (
    ProductMemberCustomRolesSerializer,
    ProductMemberInviteSerializer,
    ProductMemberSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Product, ProductMember, Workspace
from plane.utils.product import (
    can_manage_workspace_products,
    can_view_product,
    has_product_permission,
    roles_exceed_product_permissions,
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

    def _role_grant_error(self, request, product, roles):
        """挂角色的两道门：要有 bind_role，且不能授予自己没有的产品权限。

        邀请端点只挂了 member.invite，但它接受 custom_role_ids —— 不在这里补，
        只有「添加成员」权限的人就能在邀请那一刻把产品管理员角色挂给任何人。
        """
        if not roles:
            return None
        if not has_product_permission(
            request.user, product, PermissionKey.PRODUCT_MEMBER_BIND_ROLE
        ):
            return Response(
                {"error": "您没有分配产品成员角色的权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if roles_exceed_product_permissions(request.user, product, roles):
            return Response(
                {"error": "不能授予超出自己所持有的产品权限的角色。"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    @allow_fine_permission(PermissionKey.PRODUCT_MEMBER_INVITE, level="PRODUCT")
    def invite(self, request, slug, product_id=None):
        product_id = product_id or request.data.get("product")
        product = self._get_product(product_id)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        data = request.data.copy()
        data["product"] = product.id
        serializer = ProductMemberInviteSerializer(
            data=data,
            context={"workspace_slug": slug},
        )
        serializer.is_valid(raise_exception=True)
        role_error = self._role_grant_error(
            request, product, serializer.validated_data.get("custom_roles", [])
        )
        if role_error is not None:
            return role_error
        product_member = serializer.save()
        return Response(
            self.get_serializer(product_member).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_workspace_member
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

    @allow_workspace_member
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

    @allow_fine_permission(PermissionKey.PRODUCT_MEMBER_BIND_ROLE, level="PRODUCT")
    def assign_roles(self, request, slug, product_id, pk):
        product_member = self._get_member(pk)
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProductMemberCustomRolesSerializer(
            product_member,
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)
        # 只校验新增的角色：保留成员原有的高权角色不算越权，去掉更不算
        existing_role_ids = set(product_member.custom_roles.values_list("id", flat=True))
        added_roles = [
            role
            for role in serializer.validated_data.get("custom_roles", [])
            if role.id not in existing_role_ids
        ]
        role_error = self._role_grant_error(request, product_member.product, added_roles)
        if role_error is not None:
            return role_error
        product_member = serializer.save()
        return Response(
            self.get_serializer(product_member).data,
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PermissionKey.PRODUCT_MEMBER_REMOVE, level="PRODUCT")
    def destroy(self, request, slug, product_id, pk):
        product_member = self._get_member(pk)
        if product_member is None:
            return Response(
                {"error": "Product member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 负责人必须始终在成员里（见 ProductSerializer.validate_owner），
        # 放行的话产品就再也改不了负责人了 —— 要换人先改负责人再移除。
        if product_member.member_id == product_member.product.owner_id:
            return Response(
                {"error": "PRODUCT_OWNER_CANNOT_BE_REMOVED"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product_member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
