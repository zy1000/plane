from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_workspace_member,
)
from plane.app.serializers.product import ProductSerializer
from plane.app.permissions.base import _get_user_product_permission_keys
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import PlanCase, Product, Workspace
from plane.utils.product import (
    can_create_product,
    can_view_product,
    filter_visible_products,
)


class ProductViewSet(BaseViewSet):
    model = Product
    serializer_class = ProductSerializer
    search_fields = ["name", "identifier", "code"]
    filterset_fields = {
        "owner_id": ["exact"],
        "reviewers": ["exact"],
        "stage_id": ["exact"],
        "category_id": ["exact"],
        "status_id": ["exact"],
        "project_lead_id": ["exact"],
    }

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related(
                "workspace",
                "owner",
                "created_by",
                "updated_by",
                # *_detail 要出所属字典的 is_colored，把字典头一并 JOIN 上
                "stage",
                "stage__dictionary",
                "category",
                "category__dictionary",
                "status",
                "status__dictionary",
                "hardware_level",
                "hardware_level__dictionary",
                "structure_level",
                "structure_level__dictionary",
                "software_level",
                "software_level__dictionary",
                "project_lead",
                "test_lead",
            )
            .prefetch_related("reviewers")
        )

        workspace = Workspace.objects.filter(slug=self.workspace_slug).first()
        if workspace is None:
            return queryset.none()

        return self.filter_queryset(filter_visible_products(queryset, self.request.user, workspace))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = Workspace.objects.filter(
            slug=self.workspace_slug
        ).first()
        return context

    def _get_product(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_workspace_member
    def list(self, request, slug):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_workspace_member
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

    @allow_workspace_member
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

    @allow_fine_permission(PermissionKey.WORKSPACE_PRODUCT_EDIT, level="PRODUCT")
    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    @allow_fine_permission(PermissionKey.WORKSPACE_PRODUCT_EDIT, level="PRODUCT")
    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    @allow_fine_permission(PermissionKey.WORKSPACE_PRODUCT_DELETE, level="PRODUCT")
    def destroy(self, request, slug, pk):
        product = self._get_product(pk)
        if product is None:
            return Response(
                {"error": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 产品的用例被项目计划引用时不让删：PlanCase.case 是 CASCADE，删产品会连带
        # 悄悄删掉别的项目计划里的用例与执行记录
        plan_case_count = PlanCase.objects.filter(
            case__repository__product_id=product.id, plan__deleted_at__isnull=True
        ).count()
        if plan_case_count:
            return Response(
                {
                    "error": "该产品的用例已被测试计划引用，不能删除。",
                    "code": "PRODUCT_HAS_PLAN_CASES",
                    "plan_case_count": plan_case_count,
                },
                status=status.HTTP_409_CONFLICT,
            )

        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductMyPermissionKeysAPIView(BaseAPIView):
    """当前用户在产品上生效的 key：project.* 来自关联项目，workspace.* 来自工作区。"""

    @allow_workspace_member
    def get(self, request, slug, product_id):
        product = Product.objects.filter(pk=product_id, workspace__slug=slug).select_related("workspace").first()
        # 看不到的产品当作不存在（白名单是硬门禁），不能借这个接口探别的产品
        if product is None or not can_view_product(request.user, product):
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        keys = _get_user_product_permission_keys(request.user, product)
        return Response({"permission_keys": sorted(keys)}, status=status.HTTP_200_OK)
