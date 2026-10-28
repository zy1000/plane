"""产品分类：工作区级，标准库的配套资产，权限沿用 workspace.requirement_library.*。

分类与一级模块的每次写入都会同步到用该分类的标准库（规则在 utils.product_category）。
模块相关的写接口返回整个分类，前端直接替换，不用自己拼计数。
"""

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.product_category import (
    ProductCategoryModuleWriteSerializer,
    ProductCategoryWriteSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.library import LIBRARY_READ_KEYS
from plane.db.models import ProductCategory, ProductCategoryModule, Workspace
from plane.db.models.product_category import SORT_ORDER_STEP
from plane.utils.product_category import (
    CATEGORY_IN_USE_CODE,
    CATEGORY_MODULE_IN_USE_CODE,
    add_category_module,
    build_category_payloads,
    bulk_add_category_modules,
    category_module_blockers,
    delete_category,
    delete_category_module,
    libraries_using,
    rename_category_module,
    reorder_category_modules,
)

MANAGE_KEY = PermissionKey.WORKSPACE_REQUIREMENT_LIBRARY_MANAGE


def _not_found(message):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def _ordered(queryset, ids):
    """按客户端给的完整 id 列表取行；有任何一个不在范围内返回 None。"""
    if not isinstance(ids, list) or not ids:
        return None
    rows = {str(row.id): row for row in queryset.filter(id__in=ids)}
    ordered = [rows.get(str(item_id)) for item_id in ids]
    if any(row is None for row in ordered):
        return None
    return ordered


class _ProductCategoryMixin:
    def categories(self, slug):
        return ProductCategory.objects.filter(workspace__slug=slug)

    def category_or_none(self, slug, category_id):
        return self.categories(slug).filter(pk=category_id).first()

    def category_response(self, category, status_code=status.HTTP_200_OK):
        return Response(build_category_payloads([category])[0], status=status_code)


class ProductCategoryEndpoint(_ProductCategoryMixin, BaseAPIView):
    @allow_fine_permission(*LIBRARY_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug):
        return Response(
            build_category_payloads(self.categories(slug)), status=status.HTTP_200_OK
        )

    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _not_found("Workspace not found.")
        serializer = ProductCategoryWriteSerializer(
            data=request.data, context={"workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        try:
            category = ProductCategory.objects.create(
                workspace=workspace,
                name=serializer.validated_data["name"],
                created_by=request.user,
            )
        except IntegrityError:
            return Response(
                {"name": ["PRODUCT_CATEGORY_NAME_ALREADY_EXISTS"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self.category_response(category, status.HTTP_201_CREATED)


class ProductCategoryReorderEndpoint(_ProductCategoryMixin, BaseAPIView):
    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug):
        ordered = _ordered(self.categories(slug), request.data.get("ids"))
        if ordered is None:
            return Response(
                {"error": "ids must list categories of this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            for index, category in enumerate(ordered):
                category.sort_order = (index + 1) * SORT_ORDER_STEP
            ProductCategory.objects.bulk_update(ordered, ["sort_order"])
        return Response(
            build_category_payloads(self.categories(slug)), status=status.HTTP_200_OK
        )


class ProductCategoryDetailEndpoint(_ProductCategoryMixin, BaseAPIView):
    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def patch(self, request, slug, category_id):
        category = self.category_or_none(slug, category_id)
        if category is None:
            return _not_found("Product category not found.")
        serializer = ProductCategoryWriteSerializer(
            instance=category,
            data=request.data,
            context={"workspace": category.workspace},
        )
        serializer.is_valid(raise_exception=True)
        category.name = serializer.validated_data["name"]
        category.updated_by = request.user
        try:
            category.save(update_fields=["name", "updated_by", "updated_at"])
        except IntegrityError:
            return Response(
                {"name": ["PRODUCT_CATEGORY_NAME_ALREADY_EXISTS"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self.category_response(category)

    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def delete(self, request, slug, category_id):
        category = self.category_or_none(slug, category_id)
        if category is None:
            return _not_found("Product category not found.")
        libraries = libraries_using(category)
        if libraries:
            return Response(
                {
                    "error": "该分类正被标准库使用，不能删除。",
                    "code": CATEGORY_IN_USE_CODE,
                    "libraries": libraries,
                },
                status=status.HTTP_409_CONFLICT,
            )
        delete_category(category)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductCategoryModuleEndpoint(_ProductCategoryMixin, BaseAPIView):
    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug, category_id):
        category = self.category_or_none(slug, category_id)
        if category is None:
            return _not_found("Product category not found.")
        serializer = ProductCategoryModuleWriteSerializer(
            data=request.data, context={"category": category}
        )
        serializer.is_valid(raise_exception=True)
        try:
            add_category_module(
                category, serializer.validated_data["name"], actor=request.user
            )
        except IntegrityError:
            return Response(
                {"name": ["PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self.category_response(category, status.HTTP_201_CREATED)


class ProductCategoryModuleBulkEndpoint(_ProductCategoryMixin, BaseAPIView):
    """批量添加一级模块（每行一个）。已有 / 重复 / 超长的跳过并原样告诉前端。"""

    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug, category_id):
        category = self.category_or_none(slug, category_id)
        if category is None:
            return _not_found("Product category not found.")
        names = request.data.get("names")
        if not isinstance(names, list) or not names:
            return Response(
                {"error": "names must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            created, skipped = bulk_add_category_modules(
                category, names, actor=request.user
            )
        except IntegrityError:
            # 并发下别人刚加了同名模块：整批回滚，让用户重试
            return Response(
                {"error": "PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "category": build_category_payloads([category])[0],
                "created": created,
                "skipped": skipped,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ProductCategoryModuleReorderEndpoint(_ProductCategoryMixin, BaseAPIView):
    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def post(self, request, slug, category_id):
        category = self.category_or_none(slug, category_id)
        if category is None:
            return _not_found("Product category not found.")
        ordered = _ordered(
            ProductCategoryModule.objects.filter(category=category),
            request.data.get("ids"),
        )
        if ordered is None:
            return Response(
                {"error": "ids must list modules of this category."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reorder_category_modules(category, ordered, SORT_ORDER_STEP)
        return self.category_response(category)


class ProductCategoryModuleDetailEndpoint(_ProductCategoryMixin, BaseAPIView):
    def module_or_none(self, slug, category_id, module_id):
        return ProductCategoryModule.objects.filter(
            pk=module_id,
            category_id=category_id,
            category__workspace__slug=slug,
        ).select_related("category").first()

    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def patch(self, request, slug, category_id, module_id):
        module = self.module_or_none(slug, category_id, module_id)
        if module is None:
            return _not_found("Product category module not found.")
        serializer = ProductCategoryModuleWriteSerializer(
            instance=module,
            data=request.data,
            context={"category": module.category},
        )
        serializer.is_valid(raise_exception=True)
        try:
            rename_category_module(
                module, serializer.validated_data["name"], actor=request.user
            )
        except IntegrityError:
            return Response(
                {"name": ["PRODUCT_CATEGORY_MODULE_NAME_ALREADY_EXISTS"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self.category_response(module.category)

    @allow_fine_permission(MANAGE_KEY, level="WORKSPACE")
    def delete(self, request, slug, category_id, module_id):
        module = self.module_or_none(slug, category_id, module_id)
        if module is None:
            return _not_found("Product category module not found.")
        blockers = category_module_blockers(module)
        if blockers:
            return Response(
                {
                    "error": "以下标准库在该模块下还有内容，先移走或删除后再试。",
                    "code": CATEGORY_MODULE_IN_USE_CODE,
                    "libraries": blockers,
                },
                status=status.HTTP_409_CONFLICT,
            )
        category = module.category
        delete_category_module(module)
        return self.category_response(category)
