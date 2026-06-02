"""Cycle 附件接口（已重构为 FileAsset 体系）。

旧版本基于自建 ``File`` 模型直传 MinIO ``file`` bucket，现统一改走预签名两步式
上传与统一桶下的 ``{ws}/{proj}/cycle/{cycle_id}/`` 路径。
"""

import json

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.app.views.base import BaseViewSet
from plane.bgtasks.cycle_activities_task import cycle_activity as cycle_activity_task
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import Cycle, FileAsset, Workspace
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


CYCLE_FILE_ENTITY_TYPE = FileAsset.EntityTypeContext.CYCLE_FILE


def _serialize_asset(asset: FileAsset) -> dict:
    attrs = asset.attributes or {}
    return {
        "id": str(asset.id),
        "name": attrs.get("name") or "",
        "size": int(asset.size or 0),
        "type": attrs.get("type") or "",
        "is_uploaded": bool(asset.is_uploaded),
        "created_at": asset.created_at,
        "created_by_id": str(asset.created_by_id) if asset.created_by_id else None,
    }


class CycleFileAPI(BaseViewSet):
    model = FileAsset
    pagination_class = CustomPaginator

    @action(detail=False, methods=["post"], url_path="upload")
    @allow_fine_permission(PermissionKey.SPRINTS_FILE_UPLOAD)
    def upload(self, request, slug, project_id):
        cycle_id = request.data.get("cycle_id")
        name = request.data.get("name")
        file_type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        if not cycle_id or not name:
            return Response(
                {"error": "cycle_id and name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cycle = Cycle.objects.get(id=cycle_id, workspace__slug=slug, project_id=project_id)
        workspace = Workspace.objects.get(slug=slug)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            project_id=project_id,
            cycle_id=cycle.id,
            created_by=request.user,
            entity_type=CYCLE_FILE_ENTITY_TYPE,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=file_type, file_size=size_limit
        )

        return Response(
            {"upload_data": presigned_url, "asset_id": str(asset.id), "asset": _serialize_asset(asset)},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["patch"], url_path="(?P<asset_id>[^/.]+)/uploaded")
    @allow_fine_permission(PermissionKey.SPRINTS_FILE_UPLOAD)
    def mark_uploaded(self, request, slug, project_id, asset_id):
        asset = FileAsset.objects.get(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=CYCLE_FILE_ENTITY_TYPE,
            is_deleted=False,
        )
        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset.id))
        attributes = request.data.get("attributes")
        if attributes:
            asset.attributes = attributes
        asset.save(update_fields=["is_uploaded", "attributes"])

        cycle_id = getattr(asset, "cycle_id", None)
        if cycle_id:
            file_name = (asset.attributes or {}).get("name") or ""
            cycle_activity_task.delay(
                type="cycle_attachment.activity.created",
                requested_data=None,
                current_instance=json.dumps({"id": str(asset.id), "name": file_name}),
                cycle_id=str(cycle_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="list")
    def file_list(self, request, slug, project_id):
        cycle_id = request.query_params.get("cycle_id")
        if not cycle_id:
            return Response({"error": "cycle_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        assets = (
            FileAsset.objects.filter(
                cycle_id=cycle_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=CYCLE_FILE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            )
            .select_related("created_by")
            .order_by("-created_at")
        )
        paginator = self.pagination_class()
        paginated = paginator.paginate_queryset(assets, request)
        return list_response(
            data=[_serialize_asset(a) for a in (paginated or [])],
            count=assets.count(),
        )

    @allow_fine_permission(PermissionKey.SPRINTS_FILE_DELETE)
    def delete_file(self, request, slug, project_id, file_id):
        asset = FileAsset.objects.filter(
            pk=file_id,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=CYCLE_FILE_ENTITY_TYPE,
            is_deleted=False,
        ).first()
        if not asset:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])

        cycle_id = getattr(asset, "cycle_id", None)
        if cycle_id:
            file_name = (asset.attributes or {}).get("name") or ""
            cycle_activity_task.delay(
                type="cycle_attachment.activity.deleted",
                requested_data=None,
                current_instance=json.dumps({"id": str(asset.id), "name": file_name}),
                cycle_id=str(cycle_id),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
            )

        # 物理删除对象，避免 MinIO 累积孤儿
        try:
            storage = S3Storage(request=request)
            storage.delete_files(object_names=[asset.storage_key])
        except Exception:
            pass
        return Response(status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.SPRINTS_FILE_DOWNLOAD)
    def download(self, request, slug, project_id, file_id):
        try:
            asset = FileAsset.objects.get(
                pk=file_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=CYCLE_FILE_ENTITY_TYPE,
                is_uploaded=True,
                is_deleted=False,
            )
        except FileAsset.DoesNotExist:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=(asset.attributes or {}).get("name"),
        )
        return Response({"download_url": signed_url})
