# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import urllib.parse

from django.http import StreamingHttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from plane.utils.minio_utils import get_minio_utils
# Module imports
from ..base import BaseAPIView, BaseViewSet
from plane.db.models import FileAsset, Workspace, File
from plane.app.serializers import FileAssetSerializer


class FileAssetEndpoint(BaseAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    """
    A viewset for viewing and editing task instances.
    """

    def get(self, request, workspace_id, asset_key):
        asset_key = str(workspace_id) + "/" + asset_key
        files = FileAsset.objects.filter(asset=asset_key)
        if files.exists():
            serializer = FileAssetSerializer(files, context={"request": request}, many=True)
            return Response({"data": serializer.data, "status": True}, status=status.HTTP_200_OK)
        else:
            return Response(
                {"error": "Asset key does not exist", "status": False},
                status=status.HTTP_200_OK,
            )

    def post(self, request, slug):
        serializer = FileAssetSerializer(data=request.data)
        if serializer.is_valid():
            # Get the workspace
            workspace = Workspace.objects.get(slug=slug)
            serializer.save(workspace_id=workspace.id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, workspace_id, asset_key):
        asset_key = str(workspace_id) + "/" + asset_key
        file_asset = FileAsset.objects.get(asset=asset_key)
        file_asset.is_deleted = True
        file_asset.save(update_fields=["is_deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileAssetViewSet(BaseViewSet):
    def restore(self, request, workspace_id, asset_key):
        asset_key = str(workspace_id) + "/" + asset_key
        file_asset = FileAsset.objects.get(asset=asset_key)
        file_asset.is_deleted = False
        file_asset.save(update_fields=["is_deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserAssetsEndpoint(BaseAPIView):
    parser_classes = (MultiPartParser, FormParser)

    def get(self, request, asset_key):
        files = FileAsset.objects.filter(asset=asset_key, created_by=request.user)
        if files.exists():
            serializer = FileAssetSerializer(files, context={"request": request})
            return Response({"data": serializer.data, "status": True}, status=status.HTTP_200_OK)
        else:
            return Response(
                {"error": "Asset key does not exist", "status": False},
                status=status.HTTP_200_OK,
            )

    def post(self, request):
        serializer = FileAssetSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, asset_key):
        file_asset = FileAsset.objects.get(asset=asset_key, created_by=request.user)
        file_asset.is_deleted = True
        file_asset.save(update_fields=["is_deleted"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileAPIView(BaseAPIView):
    """遗留 File 下载/删除接口。

    新数据已经迁移到 ``FileAsset`` 体系下的统一 ``uploads`` 桶；该接口仅用于
    兼容尚未迁移的旧 File 记录，桶名由 ``LEGACY_FILE_BUCKET`` 环境变量控制
    （默认 ``file``）。完成 ``migrate_asset_paths`` 命令后可考虑下线此 API。
    """

    def _legacy_bucket(self) -> str:
        import os

        return os.environ.get("LEGACY_FILE_BUCKET", "file")

    def post(self, request):
        minio = get_minio_utils()
        file_id = request.data.get("file_id") or request.query_params.get("file_id")
        if not file_id:
            return Response({"error": "file_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        file = File.objects.filter(id=file_id).first()
        if not file:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)
        response_obj = minio.get_object(object_name=file.path + file.name, bucket_name=self._legacy_bucket())
        if not response_obj:
            return Response({"error": "获取文件失败"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        encoded_filename = urllib.parse.quote(file.name)
        resp = StreamingHttpResponse(response_obj, content_type="application/octet-stream")
        resp["Content-Disposition"] = f"attachment; filename*=UTF-8''{encoded_filename}"
        return resp

    def delete(self, request):
        minio = get_minio_utils()
        file_id = request.query_params.get('file_id')
        file = File.objects.get(id=file_id)
        file.delete(soft=False)
        minio.remove_object(object_name=file.path + file.name, bucket_name=self._legacy_bucket())
        return Response(status=status.HTTP_200_OK)
