from collections import defaultdict

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import IntegrityError, transaction

from plane.app.permissions import PermissionKey
from plane.app.serializers.qa import (
    CaseModuleCreateUpdateSerializer,
    CaseModuleListSerializer,
    CaseModuleMoveSerializer,
)
from plane.app.views import BaseAPIView
from plane.app.views.qa.template_permissions import (
    CASE_TEMPLATE_READ_KEYS,
    allow_workspace_member_or_template,
)
from plane.db.models import CaseModule, TestCase


class CaseModuleCountAPIView(BaseAPIView):
    model = CaseModule
    queryset = CaseModule.objects.all()
    filterset_fields = {
        'name': ['exact', 'icontains', 'in'],
        'repository_id': ['exact'],
    }

    def get_queryset(self):
        # 锁定在 URL slug 对应的工作区内
        return CaseModule.objects.filter(repository__workspace__slug=self.workspace_slug)

    @allow_workspace_member_or_template(*CASE_TEMPLATE_READ_KEYS)
    def get(self, request, slug):
        modules = self.filter_queryset(self.get_queryset()).annotate(
            case_count=Count('cases', filter=Q(cases__deleted_at__isnull=True))).values('id', 'parent_id', 'case_count')

        # 每个模块的直属用例数，以及父子关系，用于把子模块的用例数累加到父模块上，
        # 与用例列表按模块过滤（递归包含子模块）的口径保持一致。
        direct_counts = {}
        children_map = defaultdict(list)
        for module in modules:
            mid = str(module['id'])
            direct_counts[mid] = int(module['case_count'] or 0)
            pid = str(module['parent_id']) if module['parent_id'] else None
            if pid:
                children_map[pid].append(mid)

        memo = {}

        def subtree_count(mid):
            if mid in memo:
                return memo[mid]
            total = direct_counts.get(mid, 0)
            for child in children_map.get(mid, []):
                total += subtree_count(child)
            memo[mid] = total
            return total

        result = dict(
            total=TestCase.objects.filter(
                repository_id=request.query_params['repository_id'],
                repository__workspace__slug=slug,
            ).count()
        )
        for mid in direct_counts:
            result[mid] = subtree_count(mid)

        return Response(data=result)


class CaseModuleDetailAPIView(BaseAPIView):
    model = CaseModule
    queryset = CaseModule.objects.all()
    serializer_class = CaseModuleCreateUpdateSerializer

    @allow_workspace_member_or_template(PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE)
    def patch(self, request, slug, module_id):
        module = get_object_or_404(
            self.queryset,
            id=module_id,
            deleted_at__isnull=True,
            repository__workspace__slug=slug,
        )
        serializer = self.serializer_class(instance=module, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            serializer.save()
        except IntegrityError:
            return Response({"error": "同级模块名称已存在"}, status=status.HTTP_400_BAD_REQUEST)

        module.refresh_from_db()
        return Response(CaseModuleListSerializer(instance=module).data, status=status.HTTP_200_OK)


#: 同级重排后的序号步长，与 CaseModule.sort_order 默认值一致
SORT_ORDER_STEP = 65535


class CaseModuleMoveAPIView(BaseAPIView):
    """库内移动模块（拖拽 / 「移动到」弹窗共用）：只改模块的 parent 与同级 sort_order，用例挂载不变。

    存量同级 sort_order 大多相同，前端无法靠取中点排序，所以由这里整组重编号。
    """

    @allow_workspace_member_or_template(PermissionKey.WORKSPACE_CASE_TEMPLATE_MANAGE)
    def post(self, request, slug):
        serializer = CaseModuleMoveSerializer(data=request.data, context={"slug": slug})
        serializer.is_valid(raise_exception=True)
        module = serializer.validated_data["module"]
        target_parent = serializer.validated_data["target_parent"]
        anchor = serializer.validated_data["anchor"]
        placement = serializer.validated_data["placement"]

        siblings = list(
            CaseModule.objects.filter(
                repository_id=module.repository_id,
                parent=target_parent,
                deleted_at__isnull=True,
            )
            .exclude(id=module.id)
            .order_by("sort_order", "-created_at")
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
                CaseModule.objects.bulk_update(siblings, ["parent", "sort_order"])
        except IntegrityError:
            return Response({"error": "目标位置已存在同名模块"}, status=status.HTTP_400_BAD_REQUEST)

        module.refresh_from_db()
        return Response(CaseModuleListSerializer(instance=module).data, status=status.HTTP_200_OK)
