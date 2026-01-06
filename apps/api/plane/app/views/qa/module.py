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
            case_count=Count('cases', filter=Q(cases__deleted_at__isnull=True))).values('id', 'case_count')
        result = dict(total=TestCase.objects.filter(repository_id=request.query_params['repository_id']).count())
        for module in modules:
            result[str(module['id'])] = module['case_count']

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
            return Response({"error": "Module name already exists."}, status=status.HTTP_400_BAD_REQUEST)

        module.refresh_from_db()
        return Response(CaseModuleListSerializer(instance=module).data, status=status.HTTP_200_OK)
