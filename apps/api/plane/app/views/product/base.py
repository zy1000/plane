from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_fine_permission,
    allow_workspace_member,
)
from plane.app.serializers.product import ProductSerializer, build_product_list_payload
from plane.app.permissions.base import _get_user_product_permission_keys
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import DataDictionaryItem, PlanCase, Product, User, Workspace
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

    def _visible_queryset(self):
        """当前用户可见、已套过滤条件的产品。只带 workspace（算产品 key 要用），其余关联由调用方按需加。"""
        queryset = (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            # 全表共用一个工作区对象，不用 JOIN（JOIN 会给每一行各建一份）
            .prefetch_related(Prefetch("workspace", queryset=Workspace.all_objects.all()))
        )

        workspace = Workspace.objects.filter(slug=self.workspace_slug).first()
        if workspace is None:
            return queryset.none()

        return self.filter_queryset(filter_visible_products(queryset, self.request.user, workspace))

    def get_queryset(self):
        # 详情 / 更新 / 删除用。关联对象按关联各查一次，不用 JOIN。all_objects 与 JOIN 同口径，不滤软删。
        # *_detail 要出所属字典的 is_colored，字典头跟着字典值 JOIN
        dictionary_items = DataDictionaryItem.all_objects.select_related("dictionary")
        # *_detail 走 UserLiteSerializer 要出 avatar_url，头像资源跟着人 JOIN，否则每个人一条 file_assets 查询
        users = User.objects.select_related("avatar_asset")
        return self._visible_queryset().prefetch_related(
            Prefetch("owner", queryset=users),
            Prefetch("project_lead", queryset=users),
            Prefetch("test_lead", queryset=users),
            Prefetch("reviewers", queryset=users),
            Prefetch("stage", queryset=dictionary_items),
            Prefetch("category", queryset=dictionary_items),
            Prefetch("status", queryset=dictionary_items),
            Prefetch("hardware_level", queryset=dictionary_items),
            Prefetch("structure_level", queryset=dictionary_items),
            Prefetch("software_level", queryset=dictionary_items),
        )

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
        # 全量返回，但人员 / 字典值 / 权限键只输出一次，格式见 build_product_list_payload
        products = list(self._visible_queryset())
        return Response(build_product_list_payload(products, request.user), status=status.HTTP_200_OK)

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
