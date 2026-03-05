from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.serializers.asset import FileSerializer
from plane.app.views import BaseViewSet
from plane.db.models import Module
from plane.db.models.asset import File
from plane.utils.minio_utils import get_minio_utils


class ModuleFileAPI(BaseViewSet):
    model = Module

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request, slug, project_id):
        with transaction.atomic():
            minio = get_minio_utils()
            file = request.FILES.get('file')
            module_id = request.data.get('module_id')
            module = Module.objects.get(id=module_id)
            module_file = File.objects.create(name=file.name, path=module.get_file_path(), size=file.size,
                                              is_uploaded=True)
            module.files.add(module_file)
            module.save()
            upload_result = minio.upload_bytes(data=file.read(), object_name=module.get_file_path(file.name))
            if not upload_result:
                transaction.set_rollback(True)
                return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='list')
    def file_list(self, request, slug, project_id):
        module_id = request.query_params.get('module_id')
        files = Module.objects.get(id=module_id).files.all()
        serializer = FileSerializer(files, many=True)
        return Response(data=serializer.data)
