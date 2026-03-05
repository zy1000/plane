from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.serializers.asset import FileSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Cycle
from plane.db.models.asset import File
from plane.utils.minio_utils import get_minio_utils
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class CycleFileAPI(BaseViewSet):
    model = Cycle
    pagination_class = CustomPaginator

    @action(detail=False, methods=['post'], url_path='upload')
    def upload(self, request, slug, project_id):
        with transaction.atomic():
            minio = get_minio_utils()
            file = request.FILES.get('file')
            cycle_id = request.data.get('cycle_id')
            cycle = Cycle.objects.get(id=cycle_id)
            cycle_file = File.objects.create(name=file.name, path=cycle.get_file_path(), size=file.size,
                                              is_uploaded=True)
            cycle.files.add(cycle_file)
            cycle.save()
            upload_result = minio.upload_bytes(data=file.read(), object_name=cycle.get_file_path(file.name))
            if not upload_result:
                transaction.set_rollback(True)
                return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='list')
    def file_list(self, request, slug, project_id):
        cycle_id = request.query_params.get('cycle_id')
        paginator = self.pagination_class()
        files = Cycle.objects.get(id=cycle_id).files.all()
        paginated_queryset = paginator.paginate_queryset(files, request)
        serializer = FileSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=files.count())
