from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.serializers.asset import FileSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models.qa import PlanCaseRecord
from plane.db.models.asset import File
from plane.utils.minio_utils import get_minio_utils
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class PlanCaseRecordFileAPI(BaseViewSet):
    model = PlanCaseRecord
    pagination_class = CustomPaginator

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request, slug):
        with transaction.atomic():
            minio = get_minio_utils()
            file = request.FILES.get('file')
            record_id = request.data.get('record_id')
            record = PlanCaseRecord.objects.get(id=record_id)
            record_file = File.objects.create(
                name=file.name,
                path=record.get_file_path(),
                size=file.size,
                is_uploaded=True,
            )
            record.files.add(record_file)
            upload_result = minio.upload_bytes(
                data=file.read(),
                object_name=record.get_file_path(file.name),
            )
            if not upload_result:
                transaction.set_rollback(True)
                return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response(FileSerializer(record_file).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='list')
    def file_list(self, request, slug):
        record_id = request.query_params.get('record_id')
        files = PlanCaseRecord.objects.get(id=record_id).files.all()
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(files, request)
        serializer = FileSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=files.count())

    @action(detail=False, methods=['delete'], url_path='delete')
    def delete_file(self, request, slug):
        file_id = request.data.get('file_id')
        record_id = request.data.get('record_id')
        record = PlanCaseRecord.objects.get(id=record_id)
        file_obj = File.objects.get(id=file_id)
        record.files.remove(file_obj)
        file_obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], url_path='download')
    def download(self, request, slug):
        file_id = request.query_params.get('file_id')
        file_obj = File.objects.get(id=file_id)
        object_name = file_obj.path + file_obj.name
        minio = get_minio_utils()
        url = minio.generate_presigned_get_url(
            object_name=object_name,
            expires_seconds=300,
            bucket_name='file',
            response_headers={
                'response-content-disposition': f'attachment; filename="{file_obj.name}"',
            },
            request=request,
        )
        if not url:
            return Response({'error': '生成下载链接失败'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({'url': url}, status=status.HTTP_200_OK)
