"""需求模块的端点。

库 / 产品两个作用域共用同一套视图类（URL kwargs 里是 library_id 还是 product_id
决定归属），树 GET 一次返回树 + 子树累加计数 + 作用域总数，不拆 count 端点。
项目侧只读：树来自「已关联需求所涉及模块的祖先闭包」，按产品分组 —— 模块本体
归产品，项目不落任何模块字段。
"""

from collections import defaultdict

from django.db import IntegrityError
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.requirement_module import (
    RequirementModuleSerializer,
    RequirementModuleWriteSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.app.views.requirement.library_item import get_scoped_library
from plane.app.views.requirement.mixins import (
    can_write_requirements,
    get_scoped_product,
)
from plane.db.models import Product, Requirement, RequirementModule
from plane.utils.requirement_module import build_module_tree_payload
from plane.utils.requirement_project import linked_requirement_ids


DUPLICATE_NAME_MESSAGE = "同级模块名称已存在"


class _RequirementModuleScopeMixin:
    """按 URL kwargs 解析模块归属。

    库是工作区级资源，工作区成员即可维护（口径同
    RequirementLibraryItemViewSet.can_write）；产品走产品成员权限
    （can_write_requirements，与产品需求的写权限一致）。
    """

    NOT_FOUND_LIBRARY = "Requirement library not found."
    NOT_FOUND_PRODUCT = "Product not found."
    FORBIDDEN = "You do not have permission to maintain requirement modules."

    def resolve_scope(self, *, require_write):
        """返回 (owner, scope_filter, error_response)。

        scope_filter 同时是模块与需求行的归属过滤条件 —— 两张表的外键同名
        （library / product），这不是巧合，是刻意保持的对齐。
        """
        library_id = self.kwargs.get("library_id")
        if library_id:
            library = get_scoped_library(
                slug=self.workspace_slug, library_id=library_id
            )
            if library is None:
                return None, None, Response(
                    {"error": self.NOT_FOUND_LIBRARY},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return library, {"library_id": library.id}, None

        product = get_scoped_product(
            self.request.user,
            slug=self.workspace_slug,
            product_id=self.kwargs.get("product_id"),
        )
        if product is None:
            return None, None, Response(
                {"error": self.NOT_FOUND_PRODUCT},
                status=status.HTTP_404_NOT_FOUND,
            )
        if require_write and not can_write_requirements(self.request.user, product):
            return None, None, Response(
                {"error": self.FORBIDDEN},
                status=status.HTTP_403_FORBIDDEN,
            )
        return product, {"product_id": product.id}, None


class RequirementModuleAPIView(_RequirementModuleScopeMixin, BaseAPIView):
    model = RequirementModule

    def get(self, request, slug, **kwargs):
        _, scope_filter, error = self.resolve_scope(require_write=False)
        if error is not None:
            return error
        return Response(
            build_module_tree_payload(
                scope_filter=scope_filter,
                total_queryset=Requirement.objects.filter(**scope_filter),
            ),
            status=status.HTTP_200_OK,
        )

    def post(self, request, slug, **kwargs):
        owner, scope_filter, error = self.resolve_scope(require_write=True)
        if error is not None:
            return error
        serializer = RequirementModuleWriteSerializer(
            data=request.data, context={"scope_filter": scope_filter}
        )
        serializer.is_valid(raise_exception=True)
        try:
            module = serializer.save(
                **scope_filter,
                workspace_id=owner.workspace_id,
                created_by=request.user,
            )
        except IntegrityError:
            return Response(
                {"error": DUPLICATE_NAME_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            RequirementModuleSerializer(module).data,
            status=status.HTTP_201_CREATED,
        )


class RequirementModuleDetailAPIView(_RequirementModuleScopeMixin, BaseAPIView):
    model = RequirementModule

    NOT_FOUND_MODULE = "Requirement module not found."

    def _module_or_none(self, scope_filter, module_id):
        return RequirementModule.objects.filter(id=module_id, **scope_filter).first()

    def patch(self, request, slug, module_id, **kwargs):
        _, scope_filter, error = self.resolve_scope(require_write=True)
        if error is not None:
            return error
        module = self._module_or_none(scope_filter, module_id)
        if module is None:
            return Response(
                {"error": self.NOT_FOUND_MODULE}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = RequirementModuleWriteSerializer(
            instance=module,
            data=request.data,
            partial=True,
            context={"scope_filter": scope_filter},
        )
        serializer.is_valid(raise_exception=True)
        try:
            module = serializer.save(updated_by=request.user)
        except IntegrityError:
            return Response(
                {"error": DUPLICATE_NAME_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            RequirementModuleSerializer(module).data, status=status.HTTP_200_OK
        )

    def delete(self, request, slug, module_id, **kwargs):
        _, scope_filter, error = self.resolve_scope(require_write=True)
        if error is not None:
            return error
        module = self._module_or_none(scope_filter, module_id)
        if module is None:
            return Response(
                {"error": self.NOT_FOUND_MODULE}, status=status.HTTP_404_NOT_FOUND
            )
        # 硬删：collector 级联硬删子树（parent CASCADE），挂靠的需求走
        # Requirement.module 的 SET_NULL 回到「全部」，不会被带走。
        module.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectRequirementModuleTreeAPIView(BaseAPIView):
    """项目需求页左侧的只读模块树。

    只含「已关联需求所涉及模块」的祖先闭包 —— 子树计数为 0 的分支整个剪掉；
    计数只算本项目已关联的行（含子模块累加），与列表 ?module_id= 的过滤口径
    一致。按产品分组返回，单产品时由前端拍平。
    """

    @allow_fine_permission(PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW)
    def get(self, request, slug, project_id):
        linked = list(
            Requirement.objects.filter(
                workspace__slug=slug,
                id__in=linked_requirement_ids(project_id),
            ).values("product_id", "module_id")
        )

        total_by_product = defaultdict(int)
        direct_counts = defaultdict(int)
        for row in linked:
            total_by_product[row["product_id"]] += 1
            if row["module_id"]:
                direct_counts[row["module_id"]] += 1

        product_ids = [pid for pid in total_by_product if pid]
        modules = list(
            RequirementModule.objects.filter(product_id__in=product_ids).order_by(
                "sort_order", "created_at", "id"
            )
        )
        children_map = defaultdict(list)
        for module in modules:
            if module.parent_id:
                children_map[module.parent_id].append(module)

        memo = {}

        def subtree_count(module):
            if module.id in memo:
                return memo[module.id]
            total = direct_counts.get(module.id, 0)
            for child in children_map.get(module.id, []):
                total += subtree_count(child)
            memo[module.id] = total
            return total

        def node_payload(module):
            return {
                "id": str(module.id),
                "name": module.name,
                "parent": str(module.parent_id) if module.parent_id else None,
                "sort_order": module.sort_order,
                "count": subtree_count(module),
                "children": [
                    node_payload(child)
                    for child in children_map.get(module.id, [])
                    if subtree_count(child) > 0
                ],
            }

        products_by_id = {
            product.id: product
            for product in Product.objects.filter(id__in=product_ids)
        }
        groups = []
        for product_id_key, total in total_by_product.items():
            product = products_by_id.get(product_id_key)
            if product is None:
                continue
            groups.append(
                {
                    "product_id": str(product.id),
                    "product_name": product.name,
                    "product_identifier": product.identifier,
                    "total": total,
                    "modules": [
                        node_payload(module)
                        for module in modules
                        if module.product_id == product.id
                        and module.parent_id is None
                        and subtree_count(module) > 0
                    ],
                }
            )
        groups.sort(key=lambda group: group["product_identifier"] or "")
        return Response(
            {"products": groups, "total": len(linked)},
            status=status.HTTP_200_OK,
        )
