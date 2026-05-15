"""Release 附件接口（已重构为 FileAsset 体系）。"""

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.app.views.base import BaseViewSet
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import Release, FileAsset, Workspace
from plane.settings.storage import S3Storage
from plane.utils.asset_path import build_asset_key
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


RELEASE_FILE_ENTITY_TYPE = FileAsset.EntityTypeContext.RELEASE_FILE


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


class ReleaseFileAPI(BaseViewSet):
    model = FileAsset
    pagination_class = CustomPaginator

    @action(detail=False, methods=["post"], url_path="upload")
    @allow_fine_permission(PermissionKey.RELEASES_FILE_UPLOAD)
    def upload(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        name = request.data.get("name")
        file_type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        if not release_id or not name:
            return Response(
                {"error": "release_id and name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        release = Release.objects.get(id=release_id, workspace__slug=slug, project_id=project_id)
        workspace = Workspace.objects.get(slug=slug)

        asset_key = build_asset_key(
            entity_type=RELEASE_FILE_ENTITY_TYPE,
            filename=name,
            workspace_id=str(workspace.id),
            project_id=str(project_id),
            release_id=str(release.id),
        )

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=workspace.id,
            project_id=project_id,
            release_id=release.id,
            created_by=request.user,
            entity_type=RELEASE_FILE_ENTITY_TYPE,
        )

        storage = S3Storage(request=request)
        presigned_url = storage.generate_presigned_post(
            object_name=asset_key, file_type=file_type, file_size=size_limit
        )

        return Response(
            {"upload_data": presigned_url, "asset_id": str(asset.id), "asset": _serialize_asset(asset)},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["patch"], url_path="(?P<asset_id>[^/.]+)/uploaded")
    @allow_fine_permission(PermissionKey.RELEASES_FILE_UPLOAD)
    def mark_uploaded(self, request, slug, project_id, asset_id):
        asset = FileAsset.objects.get(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=RELEASE_FILE_ENTITY_TYPE,
            is_deleted=False,
        )
        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset.id))
        attributes = request.data.get("attributes")
        if attributes:
            asset.attributes = attributes
        asset.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="list")
    def file_list(self, request, slug, project_id):
        release_id = request.query_params.get("release_id")
        if not release_id:
            return Response({"error": "release_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        assets = (
            FileAsset.objects.filter(
                release_id=release_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=RELEASE_FILE_ENTITY_TYPE,
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

    @allow_fine_permission(PermissionKey.RELEASES_FILE_DELETE)
    def delete_file(self, request, slug, project_id, file_id):
        asset = FileAsset.objects.filter(
            pk=file_id,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=RELEASE_FILE_ENTITY_TYPE,
            is_deleted=False,
        ).first()
        if not asset:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        try:
            storage = S3Storage(request=request)
            storage.delete_files(object_names=[asset.asset.name])
        except Exception:
            pass
        return Response(status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_FILE_DOWNLOAD)
    def download(self, request, slug, project_id, file_id):
        try:
            asset = FileAsset.objects.get(
                pk=file_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=RELEASE_FILE_ENTITY_TYPE,
                is_uploaded=True,
                is_deleted=False,
            )
        except FileAsset.DoesNotExist:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition="attachment",
            filename=(asset.attributes or {}).get("name"),
        )
        return Response({"download_url": signed_url})
