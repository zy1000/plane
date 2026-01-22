import uuid

from django.conf import settings
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import allow_permission, ROLE
from plane.app.views import BaseAPIView
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Workspace
from plane.settings.storage import S3Storage
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


MINDMAP_ENTITY_TYPE = "CASE_MINDMAP"


class MindmapAssetAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        project_id = request.query_params.get("project_id")
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        name__icontains = request.query_params.get("name__icontains")

        assets = FileAsset.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            entity_type=MINDMAP_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        if name__icontains:
            assets = assets.filter(attributes__name__icontains=name__icontains)

        assets = (
            assets.only("id", "attributes", "created_at", "created_by", "is_uploaded")
            .select_related("created_by")
            .order_by("-created_at")
        )

        count = assets.count()
        paginator = CustomPaginator()
        paginated_assets = paginator.paginate_queryset(assets, request)

        data = [
            {
                "id": str(a.id),
                "attributes": a.attributes,
                "created_at": a.created_at,
                "created_by_id": str(a.created_by_id) if a.created_by_id else None,
                "is_uploaded": bool(a.is_uploaded),
            }
            for a in (paginated_assets or [])
        ]
        return list_response(data=data, count=count)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        project_id = request.data.get("project_id")
        name = request.data.get("name")
        file_type = request.data.get("type", False)
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not file_type or file_type not in settings.ATTACHMENT_MIME_TYPES:
            return Response({"error": "Invalid file type.", "status": False}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.get(slug=slug)
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            project_id=project_id,
            entity_type=MINDMAP_ENTITY_TYPE,
        )

        storage = S3Storage(request=request)
        presigned_url = storage.generate_presigned_post(
            object_name=asset_key, file_type=file_type, file_size=size_limit
        )

        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset": {
                    "id": str(asset.id),
                    "attributes": asset.attributes,
                    "created_at": asset.created_at,
                    "created_by_id": str(asset.created_by_id) if asset.created_by_id else None,
                    "is_uploaded": bool(asset.is_uploaded),
                },
            },
            status=status.HTTP_200_OK,
        )


class MindmapAssetDetailAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def patch(self, request, slug, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            entity_type=MINDMAP_ENTITY_TYPE,
            is_deleted=False,
        )

        if not asset.is_uploaded:
            asset.is_uploaded = True
            asset.created_by = request.user

        if not asset.storage_metadata:
            get_asset_object_metadata.delay(str(asset.id))

        asset.attributes = request.data.get("attributes", asset.attributes)
        asset.save(update_fields=["is_uploaded", "attributes"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def delete(self, request, slug, pk):
        project_id = request.data.get("project_id")
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=MINDMAP_ENTITY_TYPE,
            is_deleted=False,
        )
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class MindmapAssetDownloadAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        project_id = request.query_params.get("project_id")
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        disposition = request.query_params.get("disposition") or "attachment"
        if disposition not in ["attachment", "inline"]:
            disposition = "attachment"

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=MINDMAP_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition=disposition,
            filename=asset.attributes.get("name") if asset.attributes else None,
        )

        redirect = request.query_params.get("redirect", "1")
        if str(redirect).lower() in ["0", "false"]:
            return Response({"download_url": signed_url}, status=status.HTTP_200_OK)

        return HttpResponseRedirect(signed_url)
