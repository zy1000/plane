"""用例库模块（产品下给用例库分组的树）的端点。

照产品需求模块（views/requirement/module.py）：树 GET 一次返回树 + 子树累加计数 + 「全部」总数 +
「未归类」数；新建 / 重命名 / 删除 / 拖拽移动。读要能看用例，写要有新建或编辑用例权限（同用例库本身）。
"""

from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.qa.repository_module import (
    CaseRepositoryModuleMoveSerializer,
    CaseRepositoryModuleSerializer,
    CaseRepositoryModuleWriteSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.app.views.qa.case_scope import CASE_CREATE, CASE_EDIT, CASE_VIEW
from plane.app.views.qa.product_scope import allow_product_scope
from plane.db.models import CaseRepositoryModule, Product
from plane.utils.case_repository_module import build_repository_module_tree_payload

DUPLICATE_NAME_MESSAGE = "同级模块名称已存在"
NOT_FOUND_MODULE = "用例库模块不存在。"
#: 同级重排后的序号步长，与 CaseRepositoryModule.sort_order 默认值一致
SORT_ORDER_STEP = 65535

MODULE_WRITE = (*CASE_CREATE, *CASE_EDIT)


class CaseRepositoryModuleAPIView(BaseAPIView):
    model = CaseRepositoryModule

    @allow_product_scope(*CASE_VIEW)
    def get(self, request, slug, product_id):
        return Response(build_repository_module_tree_payload(product_id), status=status.HTTP_200_OK)

    @allow_product_scope(*MODULE_WRITE)
    def post(self, request, slug, product_id):
        product = Product.objects.get(id=product_id, workspace__slug=slug)
        serializer = CaseRepositoryModuleWriteSerializer(data=request.data, context={"product_id": product.id})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                module = serializer.save(product=product, workspace_id=product.workspace_id)
        except IntegrityError:
            return Response({"error": DUPLICATE_NAME_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CaseRepositoryModuleSerializer(module).data, status=status.HTTP_201_CREATED)


class CaseRepositoryModuleDetailAPIView(BaseAPIView):
    model = CaseRepositoryModule

    @allow_product_scope(*MODULE_WRITE)
    def patch(self, request, slug, product_id, module_id):
        module = CaseRepositoryModule.objects.filter(id=module_id, product_id=product_id).first()
        if module is None:
            return Response({"error": NOT_FOUND_MODULE}, status=status.HTTP_404_NOT_FOUND)
        serializer = CaseRepositoryModuleWriteSerializer(
            instance=module, data=request.data, partial=True, context={"product_id": module.product_id}
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                module = serializer.save()
        except IntegrityError:
            return Response({"error": DUPLICATE_NAME_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CaseRepositoryModuleSerializer(module).data, status=status.HTTP_200_OK)

    @allow_product_scope(*MODULE_WRITE)
    def delete(self, request, slug, product_id, module_id):
        module = CaseRepositoryModule.objects.filter(id=module_id, product_id=product_id).first()
        if module is None:
            return Response({"error": NOT_FOUND_MODULE}, status=status.HTTP_404_NOT_FOUND)
        # 硬删：collector 级联硬删子树（parent CASCADE），挂在上面的用例库走
        # TestCaseRepository.module 的 SET_NULL 回到「未归类」，库和用例都不动。
        module.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaseRepositoryModuleMoveAPIView(BaseAPIView):
    """拖拽移动模块：只改模块的 parent 与同级 sort_order，挂在上面的用例库不变。

    同级 sort_order 基本都是默认值，前端没法取中点排序，由这里把目标同级整组重编号
    （顺序口径与树接口一致：sort_order, created_at, id）。
    """

    model = CaseRepositoryModule

    @allow_product_scope(*MODULE_WRITE)
    def post(self, request, slug, product_id):
        serializer = CaseRepositoryModuleMoveSerializer(data=request.data, context={"product_id": product_id})
        serializer.is_valid(raise_exception=True)
        module = serializer.validated_data["module"]
        target_parent = serializer.validated_data["target_parent"]
        anchor = serializer.validated_data["anchor"]
        placement = serializer.validated_data["placement"]

        siblings = list(
            CaseRepositoryModule.objects.filter(parent=target_parent, product_id=product_id)
            .exclude(id=module.id)
            .order_by("sort_order", "created_at", "id")
        )
        if anchor is None:
            index = len(siblings)
        else:
            index = next(i for i, s in enumerate(siblings) if s.id == anchor.id)
            if placement == "after":
                index += 1
        siblings.insert(index, module)

        module.parent = target_parent
        for i, sibling in enumerate(siblings):
            sibling.sort_order = (i + 1) * SORT_ORDER_STEP

        try:
            with transaction.atomic():
                CaseRepositoryModule.objects.bulk_update(siblings, ["parent", "sort_order"])
        except IntegrityError:
            return Response({"error": "目标位置已存在同名模块"}, status=status.HTTP_400_BAD_REQUEST)
        module.refresh_from_db()
        return Response(CaseRepositoryModuleSerializer(module).data, status=status.HTTP_200_OK)
