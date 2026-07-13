from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission, can_manage_product, filter_products_for_user
from plane.app.serializers.product import ProductSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.asset.v2 import _rebind_assets_to_final_path
from plane.db.models import FileAsset, Product, Workspace


class ProductViewSet(BaseViewSet):
    serializer_class = ProductSerializer
    model = Product
    search_fields = ["name"]
    filterset_fields = {"network": ["exact"], "owner_id": ["exact"]}

    def get_queryset(self):
        queryset = (
            Product.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "owner", "created_by", "updated_by")
            .order_by("-created_at")
        )
        return self.filter_queryset(
            filter_products_for_user(queryset, self.request.user, self.kwargs.get("slug"))
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        workspace = Workspace.objects.filter(slug=self.kwargs.get("slug")).first()
        context.update({"request": self.request, "workspace": workspace})
        return context

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(product).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            data=request.data,
            context={"request": request, "workspace": workspace},
        )
        serializer.is_valid(raise_exception=True)
        product = serializer.save()

        asset_ids = getattr(serializer, "bound_description_asset_ids", [])
        if asset_ids:
            assets = list(FileAsset.objects.filter(id__in=asset_ids, product=product))
            _rebind_assets_to_final_path(assets, request=request)

        return Response(self.get_serializer(product).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_product(request.user, product):
            return Response({"error": "You do not have permission."}, status=status.HTTP_403_FORBIDDEN)

        serializer = self.get_serializer(product, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        product = self.get_queryset().filter(pk=pk).first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_product(request.user, product):
            return Response({"error": "You do not have permission."}, status=status.HTTP_403_FORBIDDEN)

        product.assets.update(is_deleted=True, deleted_at=timezone.now())
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
