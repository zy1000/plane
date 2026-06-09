"""测试计划用例附件接口（FileAsset 体系）。"""

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.views.base import BaseViewSet
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Workspace
from plane.db.models.qa import PlanCase
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


PLAN_CASE_ENTITY_TYPE = FileAsset.EntityTypeContext.PLAN_CASE_FILE


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


class PlanCaseFileAPI(BaseViewSet):
    model = FileAsset
    pagination_class = CustomPaginator

    @action(detail=False, methods=["post"], url_path="upload")
    def upload(self, request, slug):
        plan_id = request.data.get("plan_id")
        case_id = request.data.get("case_id")
        name = request.data.get("name")
        file_type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        if not plan_id or not case_id or not name:
            return Response(
                {"error": "plan_id, case_id and name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            plan_case = PlanCase.objects.select_related("plan__project").get(
                plan_id=plan_id,
                case_id=case_id,
                plan__project__workspace__slug=slug,
            )
        except PlanCase.DoesNotExist:
            return Response({"error": "PlanCase not found"}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)
        project_id = getattr(getattr(plan_case, "plan", None), "project_id", None)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            project_id=project_id,
            plan_case_id=plan_case.id,
            created_by=request.user,
            entity_type=PLAN_CASE_ENTITY_TYPE,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=file_type, file_size=size_limit
        )

        return Response(
            {"upload_data": presigned_url, "asset_id": str(asset.id), "asset": _serialize_asset(asset)},
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["patch"], url_path=r"(?P<asset_id>[^/.]+)/uploaded")
    def mark_uploaded(self, request, slug, asset_id):
        asset = FileAsset.objects.get(
            pk=asset_id,
            workspace__slug=slug,
            entity_type=PLAN_CASE_ENTITY_TYPE,
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
    def file_list(self, request, slug):
        plan_id = request.query_params.get("plan_id")
        case_id = request.query_params.get("case_id")
        if not plan_id or not case_id:
            return Response(
                {"error": "plan_id and case_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        assets = (
            FileAsset.objects.filter(
                plan_case__plan_id=plan_id,
                plan_case__case_id=case_id,
                workspace__slug=slug,
                entity_type=PLAN_CASE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            )
            .order_by("-created_at")
        )
        paginator = self.pagination_class()
        paginated = paginator.paginate_queryset(assets, request)
        return list_response(
            data=[_serialize_asset(a) for a in (paginated or [])],
            count=assets.count(),
        )

    @action(detail=False, methods=["delete"], url_path="delete")
    def delete_file(self, request, slug):
        asset_id = request.data.get("asset_id") or request.data.get("file_id")
        if not asset_id:
            return Response({"error": "asset_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        asset = FileAsset.objects.filter(
            pk=asset_id,
            workspace__slug=slug,
            entity_type=PLAN_CASE_ENTITY_TYPE,
            is_deleted=False,
        ).first()
        if not asset:
            return Response({"error": "File not found"}, status=status.HTTP_404_NOT_FOUND)

        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        try:
            storage = S3Storage(request=request)
            storage.delete_files(object_names=[asset.storage_key])
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="download")
    def download(self, request, slug):
        asset_id = request.query_params.get("asset_id") or request.query_params.get("file_id")
        if not asset_id:
            return Response({"error": "asset_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            asset = FileAsset.objects.get(
                pk=asset_id,
                workspace__slug=slug,
                entity_type=PLAN_CASE_ENTITY_TYPE,
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
