from collections import defaultdict

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import IntegrityError

from plane.app.serializers.qa import CaseModuleCreateUpdateSerializer, CaseModuleListSerializer
from plane.app.views import BaseAPIView
from plane.db.models import CaseModule, TestCase


class CaseModuleCountAPIView(BaseAPIView):
    model = CaseModule
    queryset = CaseModule.objects.all()
    filterset_fields = {
        'name': ['exact', 'icontains', 'in'],
        'repository_id': ['exact'],
    }

    def get(self, request, slug):
        modules = self.filter_queryset(self.queryset).annotate(
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

        result = dict(total=TestCase.objects.filter(repository_id=request.query_params['repository_id']).count())
        for mid in direct_counts:
            result[mid] = subtree_count(mid)

        return Response(data=result)


class CaseModuleDetailAPIView(BaseAPIView):
    model = CaseModule
    queryset = CaseModule.objects.all()
    serializer_class = CaseModuleCreateUpdateSerializer

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
