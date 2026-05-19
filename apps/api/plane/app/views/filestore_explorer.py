from __future__ import annotations

import io
import os
from uuid import UUID
import zipfile

from django.conf import settings
from django.db.models import Count, Sum
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.filestore_explorer import (
    BatchCopySerializer,
    BatchDeleteSerializer,
    BatchMoveSerializer,
    FolderBreadcrumbQuerySerializer,
    FolderCreateSerializer,
    FolderListQuerySerializer,
    FolderRenameSerializer,
    MarkUploadedSerializer,
    UploadAssetSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Project
from plane.db.models.asset import FilePath
from plane.settings.storage import S3Storage
from plane.utils.asset_path import _sanitize_filename
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.folder_ops import (
    FILESTORE_ENTITY_TYPE,
    FILESTORE_ROOT_ENTITY_TYPE,
    USER_FOLDER_ENTITY_TYPE,
    copy_assets,
    create_user_folder,
    delete_user_folder,
    ensure_filestore_root,
    is_folder_in_filestore_scope,
    move_assets,
    rename_user_folder,
)
from plane.utils.paginator import CustomPaginator


def _serialize_asset(asset: FileAsset) -> dict:
    attrs = asset.attributes or {}
    created_by = asset.created_by
    return {
        "id": str(asset.id),
        "name": attrs.get("name") or asset.filename or "",
        "filename": asset.filename or "",
        "size": int(asset.size or attrs.get("size") or 0),
        "type": attrs.get("type") or "",
        "attributes": attrs,
        "is_uploaded": bool(asset.is_uploaded),
        "created_at": asset.created_at,
        "created_by_id": str(asset.created_by_id) if asset.created_by_id else None,
        "created_by_name": created_by.display_name if created_by else None,
        "created_by_avatar": created_by.avatar_url if created_by else None,
        "parent_folder_id": asset.path_id,
    }


def _serialize_folder(folder: FilePath) -> dict:
    return {
        "id": folder.pk,
        "name": folder.name,
        "entity_type": folder.entity_type,
        "parent_id": folder.parent_id,
        "updated_at": None,
        "is_root": folder.entity_type == FILESTORE_ROOT_ENTITY_TYPE,
    }


class FilestoreExplorerViewSet(BaseViewSet):
    model = FileAsset
    pagination_class = CustomPaginator

    def _project_for_scope(self, slug: str, project_id) -> Project:
        return Project.objects.only("id", "workspace_id").get(
            id=project_id, workspace__slug=slug
        )

    def _root_folder(self, slug: str, project_id) -> tuple[Project, FilePath]:
        project = self._project_for_scope(slug=slug, project_id=project_id)
        root = ensure_filestore_root(
            workspace_id=str(project.workspace_id), project_id=str(project.id)
        )
        return project, root

    def _resolve_folder(
        self,
        *,
        slug: str,
        project_id,
        folder_id: int | None,
        allow_root: bool = True,
    ) -> tuple[Project, FilePath]:
        project, root = self._root_folder(slug=slug, project_id=project_id)
        if folder_id is None:
            return project, root

        folder = FilePath.objects.filter(pk=folder_id).select_related("parent").first()
        if folder is None:
            raise FilePath.DoesNotExist
        if not is_folder_in_filestore_scope(
            folder,
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        ):
            raise FilePath.DoesNotExist
        if not allow_root and folder.entity_type == FILESTORE_ROOT_ENTITY_TYPE:
            raise ValueError("Filestore root can not be modified")
        return project, folder

    def _serialize_tree(self, root: FilePath) -> dict:
        nodes = (
            root.get_descendants(include_self=True)
            .filter(entity_type__in=[FILESTORE_ROOT_ENTITY_TYPE, USER_FOLDER_ENTITY_TYPE])
            .order_by("lft")
        )
        payload_by_id = {}
        for node in nodes:
            payload = _serialize_folder(node)
            payload["children"] = []
            payload_by_id[node.pk] = payload

        for node in nodes:
            if node.parent_id and node.parent_id in payload_by_id:
                payload_by_id[node.parent_id]["children"].append(payload_by_id[node.pk])

        root_payload = payload_by_id.get(root.pk) or (_serialize_folder(root) | {"children": []})
        return root_payload

    @staticmethod
    def _parse_uuid_list(raw: str) -> list[str]:
        if not raw:
            return []
        output: list[str] = []
        for token in raw.split(","):
            token = token.strip()
            if not token:
                continue
            output.append(str(UUID(token)))
        return output

    @staticmethod
    def _parse_int_list(raw: str) -> list[int]:
        if not raw:
            return []
        output: list[int] = []
        for token in raw.split(","):
            token = token.strip()
            if not token:
                continue
            output.append(int(token))
        return output

    @staticmethod
    def _asset_in_scope(asset: FileAsset, workspace_id: str, project_id: str) -> bool:
        if asset.path is None:
            return False
        return is_folder_in_filestore_scope(
            asset.path, workspace_id=workspace_id, project_id=project_id
        )

    @staticmethod
    def _build_zip_asset_name(asset: FileAsset, root: FilePath, used_names: set[str]) -> str:
        filename = (asset.attributes or {}).get("name") or asset.filename or "file"
        filename = _sanitize_filename(filename)
        segments: list[str] = []
        node = asset.path
        while node is not None and node.pk != root.pk:
            if node.entity_type == USER_FOLDER_ENTITY_TYPE:
                segments.append(_sanitize_filename(node.name or "folder"))
            node = node.parent
        segments.reverse()

        candidate = "/".join([*segments, filename]) if segments else filename
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate

        base, ext = os.path.splitext(candidate)
        counter = 1
        while True:
            deduped = f"{base} ({counter}){ext}"
            if deduped not in used_names:
                used_names.add(deduped)
                return deduped
            counter += 1

    @action(detail=False, methods=["post"], url_path="ensure-root")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def ensure_root(self, request, slug, project_id):
        project, root = self._root_folder(slug=slug, project_id=project_id)
        return Response(
            {
                "workspace_id": str(project.workspace_id),
                "project_id": str(project.id),
                "root_folder": _serialize_folder(root),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="list")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def list_folder(self, request, slug, project_id):
        query_serializer = FolderListQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        folder_id = query_serializer.validated_data.get("folder_id")
        name_filter = query_serializer.validated_data.get("name__icontains")

        project, folder = self._resolve_folder(
            slug=slug, project_id=project_id, folder_id=folder_id
        )

        folders = FilePath.objects.filter(
            parent=folder, entity_type=USER_FOLDER_ENTITY_TYPE
        ).order_by("name")
        if name_filter:
            folders = folders.filter(name__icontains=name_filter)

        file_assets = FileAsset.objects.filter(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_type=FILESTORE_ENTITY_TYPE,
            path=folder,
            is_deleted=False,
            is_uploaded=True,
        ).select_related("created_by", "path")
        if name_filter:
            file_assets = file_assets.filter(
                attributes__name__icontains=name_filter
            )
        file_assets = file_assets.order_by("-created_at")

        paginator = self.pagination_class()
        paginated = paginator.paginate_queryset(file_assets, request)

        return Response(
            {
                "current_folder": _serialize_folder(folder),
                "folders": [_serialize_folder(item) for item in folders],
                "files": {
                    "count": file_assets.count(),
                    "data": [_serialize_asset(item) for item in (paginated or [])],
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="tree")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def folder_tree(self, request, slug, project_id):
        _, root = self._root_folder(slug=slug, project_id=project_id)
        return Response({"tree": self._serialize_tree(root)}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="breadcrumb")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def breadcrumb(self, request, slug, project_id):
        query_serializer = FolderBreadcrumbQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        folder_id = query_serializer.validated_data["folder_id"]
        project, folder = self._resolve_folder(
            slug=slug, project_id=project_id, folder_id=folder_id
        )

        breadcrumbs = []
        node = folder
        while node is not None:
            if node.entity_type in [FILESTORE_ROOT_ENTITY_TYPE, USER_FOLDER_ENTITY_TYPE]:
                breadcrumbs.append(_serialize_folder(node))
            if node.entity_type == FILESTORE_ROOT_ENTITY_TYPE:
                break
            node = node.parent

        if not breadcrumbs or breadcrumbs[-1]["entity_type"] != FILESTORE_ROOT_ENTITY_TYPE:
            return Response(
                {"error": "Folder is out of filestore scope"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        breadcrumbs.reverse()
        return Response(
            {
                "workspace_id": str(project.workspace_id),
                "project_id": str(project.id),
                "breadcrumbs": breadcrumbs,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="folder-stats")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def folder_stats(self, request, slug, project_id):
        """
        Recursive size + direct/recursive object counts for a folder.

        - Recursive size & file count walk the MPTT subtree (`get_descendants`).
        - Direct counts only consider this folder's immediate children.
        Used by the MinIO-style header to populate Size / Objects.
        """
        query_serializer = FolderBreadcrumbQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        folder_id = query_serializer.validated_data["folder_id"]

        project, folder = self._resolve_folder(
            slug=slug, project_id=project_id, folder_id=folder_id
        )

        descendant_ids = list(
            folder.get_descendants(include_self=True).values_list("id", flat=True)
        )

        recursive_aggregates = FileAsset.objects.filter(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_deleted=False,
            is_uploaded=True,
            path_id__in=descendant_ids,
        ).aggregate(
            recursive_size=Sum("size"),
            recursive_file_count=Count("id"),
        )

        direct_folder_count = FilePath.objects.filter(
            parent=folder,
            entity_type=USER_FOLDER_ENTITY_TYPE,
        ).count()

        direct_file_count = FileAsset.objects.filter(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_type=FILESTORE_ENTITY_TYPE,
            path=folder,
            is_deleted=False,
            is_uploaded=True,
        ).count()

        return Response(
            {
                "folder_id": folder.pk,
                "recursive_size": int(recursive_aggregates["recursive_size"] or 0),
                "recursive_file_count": int(
                    recursive_aggregates["recursive_file_count"] or 0
                ),
                "direct_folder_count": int(direct_folder_count),
                "direct_file_count": int(direct_file_count),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="folder")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def create_folder(self, request, slug, project_id):
        serializer = FolderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent_folder_id = serializer.validated_data["parent_folder_id"]
        folder_name = serializer.validated_data["name"]

        project, parent_folder = self._resolve_folder(
            slug=slug, project_id=project_id, folder_id=parent_folder_id
        )

        try:
            folder = create_user_folder(
                parent=parent_folder,
                name=folder_name,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {"folder": _serialize_folder(folder)},
            status=status.HTTP_201_CREATED,
        )

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def rename_folder(self, request, slug, project_id, folder_id):
        serializer = FolderRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        folder_name = serializer.validated_data["name"]

        folder = FilePath.objects.filter(pk=folder_id).first()
        if folder is None:
            return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
        if folder.entity_type != USER_FOLDER_ENTITY_TYPE:
            return Response(
                {"error": "Only user folder can be renamed"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = self._project_for_scope(slug=slug, project_id=project_id)
        storage = S3Storage(request=request)
        try:
            folder = rename_user_folder(
                folder=folder,
                new_name=folder_name,
                storage=storage,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"folder": _serialize_folder(folder)}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DELETE)
    def delete_folder(self, request, slug, project_id, folder_id):
        folder = FilePath.objects.filter(pk=folder_id).first()
        if folder is None:
            return Response({"error": "Folder not found"}, status=status.HTTP_404_NOT_FOUND)
        if folder.entity_type != USER_FOLDER_ENTITY_TYPE:
            return Response(
                {"error": "Only user folder can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = self._project_for_scope(slug=slug, project_id=project_id)
        storage = S3Storage(request=request)
        try:
            delete_user_folder(
                folder=folder,
                storage=storage,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="upload")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def upload(self, request, slug, project_id):
        serializer = UploadAssetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        parent_folder_id = serializer.validated_data["parent_folder_id"]
        _, parent_folder = self._resolve_folder(
            slug=slug, project_id=project_id, folder_id=parent_folder_id
        )
        project = self._project_for_scope(slug=slug, project_id=project_id)

        file_name = serializer.validated_data["name"]
        file_type = serializer.validated_data.get("type") or "application/octet-stream"
        file_size = int(serializer.validated_data.get("size") or settings.FILE_SIZE_LIMIT)
        size_limit = min(file_size, settings.FILE_SIZE_LIMIT)

        asset = FileAsset.objects.create(
            attributes={"name": file_name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=request.user,
            entity_type=FILESTORE_ENTITY_TYPE,
            path=parent_folder,
        )

        presigned_url = presigned_post_for_asset(
            request=request,
            asset=asset,
            file_type=file_type,
            file_size=size_limit,
        )
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset": _serialize_asset(asset),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["patch"], url_path="(?P<asset_id>[^/.]+)/uploaded")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def mark_uploaded(self, request, slug, project_id, asset_id):
        serializer = MarkUploadedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        project = self._project_for_scope(slug=slug, project_id=project_id)
        asset = FileAsset.objects.filter(
            pk=asset_id,
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_deleted=False,
        ).select_related("path").first()
        if asset is None:
            return Response({"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._asset_in_scope(
            asset,
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        ):
            return Response({"error": "Asset is out of filestore scope"}, status=status.HTTP_400_BAD_REQUEST)

        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset.id))
        attributes = serializer.validated_data.get("attributes")
        update_fields = ["is_uploaded"]
        if attributes:
            asset.attributes = attributes
            update_fields.append("attributes")
        asset.save(update_fields=update_fields)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["post"], url_path="batch-delete")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DELETE)
    def batch_delete(self, request, slug, project_id):
        serializer = BatchDeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = self._project_for_scope(slug=slug, project_id=project_id)

        assets = list(
            FileAsset.objects.filter(
                id__in=serializer.validated_data["asset_ids"],
                workspace_id=project.workspace_id,
                project_id=project.id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
            ).select_related("path")
        )
        assets = [
            asset
            for asset in assets
            if self._asset_in_scope(
                asset,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        ]

        deleted_ids = []
        object_names = []
        for asset in assets:
            asset.is_deleted = True
            asset.deleted_at = timezone.now()
            asset.save(update_fields=["is_deleted", "deleted_at"])
            deleted_ids.append(str(asset.id))
            if asset.is_uploaded and asset.storage_key:
                object_names.append(asset.storage_key)

        if object_names:
            storage = S3Storage(request=request)
            storage.delete_files(object_names=object_names)

        return Response({"deleted_ids": deleted_ids}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="batch-copy")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def batch_copy(self, request, slug, project_id):
        serializer = BatchCopySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project, target_folder = self._resolve_folder(
            slug=slug,
            project_id=project_id,
            folder_id=serializer.validated_data["target_folder_id"],
        )

        assets = list(
            FileAsset.objects.filter(
                id__in=serializer.validated_data["asset_ids"],
                workspace_id=project.workspace_id,
                project_id=project.id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            ).select_related("path")
        )
        assets = [
            asset
            for asset in assets
            if self._asset_in_scope(
                asset,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        ]

        storage = S3Storage(request=request)
        result = copy_assets(
            assets=assets,
            target_folder=target_folder,
            storage=storage,
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
            created_by_id=request.user.id,
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="batch-move")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def batch_move(self, request, slug, project_id):
        serializer = BatchMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project, target_folder = self._resolve_folder(
            slug=slug,
            project_id=project_id,
            folder_id=serializer.validated_data["target_folder_id"],
        )

        assets = list(
            FileAsset.objects.filter(
                id__in=serializer.validated_data["asset_ids"],
                workspace_id=project.workspace_id,
                project_id=project.id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            ).select_related("path")
        )
        assets = [
            asset
            for asset in assets
            if self._asset_in_scope(
                asset,
                workspace_id=str(project.workspace_id),
                project_id=str(project.id),
            )
        ]

        storage = S3Storage(request=request)
        on_conflict = serializer.validated_data.get("on_conflict", "rename")
        result = move_assets(
            assets=assets,
            target_folder=target_folder,
            storage=storage,
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
            on_conflict=on_conflict,
        )
        if result.get("conflicts") and on_conflict == "cancel":
            return Response(result, status=status.HTTP_409_CONFLICT)
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="batch-download")
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DOWNLOAD)
    def batch_download(self, request, slug, project_id):
        project, root = self._root_folder(slug=slug, project_id=project_id)

        try:
            asset_ids = self._parse_uuid_list(request.query_params.get("asset_ids", ""))
            folder_ids = self._parse_int_list(request.query_params.get("folder_ids", ""))
        except ValueError:
            return Response({"error": "Invalid asset_ids/folder_ids"}, status=status.HTTP_400_BAD_REQUEST)

        selected_assets: dict[str, FileAsset] = {}
        if asset_ids:
            assets = FileAsset.objects.filter(
                id__in=asset_ids,
                workspace_id=project.workspace_id,
                project_id=project.id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            ).select_related("path")
            for asset in assets:
                if self._asset_in_scope(
                    asset,
                    workspace_id=str(project.workspace_id),
                    project_id=str(project.id),
                ):
                    selected_assets[str(asset.id)] = asset

        if folder_ids:
            folders = []
            for folder_id in folder_ids:
                _, folder = self._resolve_folder(
                    slug=slug, project_id=project_id, folder_id=folder_id
                )
                folders.append(folder)

            for folder in folders:
                node_ids = list(
                    folder.get_descendants(include_self=True).values_list("id", flat=True)
                )
                assets = FileAsset.objects.filter(
                    path_id__in=node_ids,
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    entity_type=FILESTORE_ENTITY_TYPE,
                    is_deleted=False,
                    is_uploaded=True,
                ).select_related("path")
                for asset in assets:
                    if self._asset_in_scope(
                        asset,
                        workspace_id=str(project.workspace_id),
                        project_id=str(project.id),
                    ):
                        selected_assets[str(asset.id)] = asset

        if not selected_assets:
            return Response({"error": "No downloadable assets found"}, status=status.HTTP_400_BAD_REQUEST)

        storage = S3Storage(request=request)
        zip_buffer = io.BytesIO()
        used_names: set[str] = set()
        with zipfile.ZipFile(
            zip_buffer,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            allowZip64=True,
        ) as archive:
            for asset in selected_assets.values():
                key = asset.storage_key
                if not key:
                    continue
                obj = storage.get_object(object_name=key)
                if not obj or "Body" not in obj:
                    continue
                body = obj["Body"]
                try:
                    content = body.read()
                finally:
                    try:
                        body.close()
                    except Exception:
                        pass
                archive_name = self._build_zip_asset_name(asset, root, used_names)
                archive.writestr(archive_name, content)

        zip_buffer.seek(0)
        response = StreamingHttpResponse(zip_buffer, content_type="application/zip")
        response["Content-Disposition"] = 'attachment; filename="filestore-assets.zip"'
        return response
