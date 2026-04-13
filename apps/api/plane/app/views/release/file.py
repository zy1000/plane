import urllib.parse

from django.db import transaction
from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.app.serializers.asset import FileSerializer
from plane.app.views import BaseViewSet
from plane.db.models import Release
from plane.db.models.asset import File
from plane.utils.minio_utils import get_minio_utils
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class ReleaseFileAPI(BaseViewSet):
    model = Release
    pagination_class = CustomPaginator

    @action(detail=False, methods=['post'], url_path='upload')
    @allow_fine_permission(PermissionKey.RELEASES_FILE_UPLOAD)
    def upload(self, request, slug, project_id):
        with transaction.atomic():
            minio = get_minio_utils()
            file = request.FILES.get('file')
            release_id = request.data.get('release_id')
            release = Release.objects.get(id=release_id)
            release_file = File.objects.create(
                name=file.name, path=release.get_file_path(), size=file.size, is_uploaded=True
            )
            release.files.add(release_file)
            release.save()
            upload_result = minio.upload_bytes(data=file.read(), object_name=release.get_file_path(file.name))
            if not upload_result:
                transaction.set_rollback(True)
                return Response(status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='list')
    def file_list(self, request, slug, project_id):
        release_id = request.query_params.get('release_id')
        paginator = self.pagination_class()
        files = Release.objects.get(id=release_id).files.all()
        paginated_queryset = paginator.paginate_queryset(files, request)
        serializer = FileSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=files.count())

    @allow_fine_permission(PermissionKey.RELEASES_FILE_DELETE)
    def delete_file(self, request, slug, project_id, file_id):
        release = Release.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            files__id=file_id,
        ).first()
        if not release:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        file = release.files.filter(id=file_id).first()
        if not file:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        minio = get_minio_utils()
        release.files.remove(file)
        file.delete(soft=False)
        minio.remove_object(object_name=file.path + file.name)
        return Response(status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_FILE_DOWNLOAD)
    def download(self, request, slug, project_id, file_id):
        file = File.objects.filter(
            id=file_id,
            releases__workspace__slug=slug,
            releases__project_id=project_id,
        ).first()
        if not file:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        minio = get_minio_utils()
        response_obj = minio.get_object(object_name=file.path + file.name, bucket_name="file")
        if not response_obj:
            return Response({"error": "获取文件失败"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        encoded_filename = urllib.parse.quote(file.name)
        resp = StreamingHttpResponse(response_obj, content_type="application/octet-stream")
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{encoded_filename}"
        return resp
