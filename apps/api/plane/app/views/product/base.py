from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.product import ProductSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Product, Workspace
from plane.utils.product import (
    can_create_product,
    can_manage_product,
    can_manage_workspace_products,
)


class ProductViewSet(BaseViewSet):
    model = Product
    serializer_class = ProductSerializer
    search_fields = ["name", "identifier"]
    filterset_fields = {
        "network": ["exact"],
        "owner_id": ["exact"],
        "reviewers": ["exact"],
    }

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related("workspace", "owner", "created_by", "updated_by")
            .prefetch_related("reviewers")
        )

        workspace = Workspace.objects.filter(slug=self.workspace_slug).first()
        if workspace is None:
            return queryset.none()

        if can_manage_workspace_products(self.request.user, workspace):
            return self.filter_queryset(queryset)

        queryset = queryset.filter(
            Q(network=2)
            | Q(owner=self.request.user)
            | Q(reviewers=self.request.user)
            | Q(network=0, member_product__member=self.request.user)
        )
        return self.filter_queryset(queryset.distinct())

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_product(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def retrieve(self, request, slug, pk):
        product = self._get_product(pk)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(
            self.get_serializer(product).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response(
                {"error": "Workspace not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_create_product(request.user, workspace):
            return Response(
                {"error": "You do not have permission to create products."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product = serializer.save(
            workspace=workspace,
            owner=serializer.validated_data.get("owner", request.user),
            network=serializer.validated_data.get("network", 2),
            created_by=request.user,
        )
        return Response(
            self.get_serializer(product).data,
            status=status.HTTP_201_CREATED,
        )

    def _update(self, request, pk, partial):
        product = self._get_product(pk)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission to update this product."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy()
        data.pop("workspace", None)
        serializer = self.get_serializer(
            product,
            data=data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(
            workspace=product.workspace,
            created_by=product.created_by,
            deleted_at=product.deleted_at,
            updated_by=request.user,
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE"
    )
    def destroy(self, request, slug, pk):
        product = self._get_product(pk)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission to delete this product."},
                status=status.HTTP_403_FORBIDDEN,
            )

        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
