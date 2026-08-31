import os
import hashlib
import hmac
import tempfile
import time
import uuid
from urllib.parse import urlencode

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import HttpResponseRedirect, StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
import jwt
import requests

from plane.app.permissions import (
    allow_permission,
    ROLE,
    allow_fine_permission,
    PermissionKey,
)
from plane.app.permissions.base import _get_user_project_permission_keys
from plane.app.views import BaseAPIView
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import (
    FileAsset,
    FileAssetVersion,
    Product,
    RequirementLibrary,
    Workspace,
)
from plane.settings.storage import S3Storage
from plane.utils.product import can_view_product
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response
from plane.utils.host import base_host
from plane.utils.onlyoffice_sessions import (
    close_active_session,
    complete_pending_save_requests,
    complete_save_request,
    create_edit_session,
    get_doc_session,
    get_onlyoffice_state,
    has_active_session,
    is_session_active,
    put_doc_session,
    register_save_request,
    resolve_callback_sequence,
    session_status,
    set_active_session,
    set_onlyoffice_state,
    touch_editor,
)
from plane.utils.asset_path import (
    build_filestore_version_key,
    filestore_version_prefix,
)
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.asset_versions import (
    ensure_current_asset_version,
    ensure_uploads_bucket_versioning,
    mark_asset_physically_deleted,
    NULL_VERSION_ID,
    object_name_for_version,
    record_latest_object_checkpoint,
    record_latest_object_version,
    restore_asset_to_version,
)

FILESTORE_ENTITY_TYPE = FileAsset.EntityTypeContext.PROJECT_FILESTORE
ONLYOFFICE_ENTITY_TYPES = (
    FILESTORE_ENTITY_TYPE,
    FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
)
# 能交给 OnlyOffice 打开的扩展名；项目级编辑/预览与工作区级需求附件预览共用
ONLYOFFICE_PREVIEW_EXTENSIONS = (
    "doc",
    "docx",
    "odt",
    "rtf",
    "txt",
    "xls",
    "xlsx",
    "ods",
    "csv",
    "ppt",
    "pptx",
    "odp",
    "pdf",
)


def _get_onlyoffice_asset(pk, slug, project_id):
    return FileAsset.objects.get(
        id=pk,
        workspace__slug=slug,
        project_id=project_id,
        entity_type__in=ONLYOFFICE_ENTITY_TYPES,
        is_uploaded=True,
        is_deleted=False,
    )


def _onlyoffice_jwt_secret() -> str:
    return (
        os.environ.get("ONLYOFFICE_JWT_SECRET")
        or os.environ.get("JWT_SECRET")
        or os.environ.get("DOCUMENT_SERVER_JWT_SECRET")
        or "jwt_secret"
    )


def _onlyoffice_jwt_enabled() -> bool:
    return bool(getattr(settings, "ONLYOFFICE_JWT_ENABLED", False))


def _onlyoffice_jwt_header() -> str:
    return (
        os.environ.get("ONLYOFFICE_JWT_HEADER")
        or os.environ.get("JWT_HEADER")
        or os.environ.get("DOCUMENT_SERVER_JWT_HEADER")
        or "AuthorizationJwt"
    )


def _jwt_encode_request_payload(payload: dict) -> str:
    token = jwt.encode(payload, _onlyoffice_jwt_secret(), algorithm="HS256")
    return token.decode("utf-8") if isinstance(token, bytes) else token


def _jwt_encode_browser_config(config: dict) -> str:
    token = jwt.encode(config, _onlyoffice_jwt_secret(), algorithm="HS256")
    return token.decode("utf-8") if isinstance(token, bytes) else token


def _jwt_try_decode_from_header(request) -> dict | None:
    header = request.headers.get(_onlyoffice_jwt_header())
    if not header:
        return None
    token = header.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    try:
        return jwt.decode(token, _onlyoffice_jwt_secret(), algorithms=["HS256"])
    except Exception:
        return None


def _onlyoffice_hmac_signature(
    purpose: str,
    asset_id: str,
    doc_key: str,
    version_id: str | None = None,
    editor_user_id: str | None = None,
) -> str:
    version_part = str(version_id or "").strip()
    editor_part = str(editor_user_id or "").strip()
    msg = f"{purpose}:{asset_id}:{doc_key}"
    if version_part:
        msg = f"{msg}:{version_part}"
    if editor_part:
        msg = f"{msg}:editor:{editor_part}"
    return hmac.new(
        str(settings.SECRET_KEY).encode("utf-8"), msg.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _onlyoffice_callback_signature_context(
    *,
    sig: str,
    asset_id: str,
    doc_key: str,
    version_id: str | None = None,
    editor_user_id: str | None = None,
) -> tuple[bool, str | None]:
    parsed_editor_id = _coerce_uuid_string(editor_user_id)
    if parsed_editor_id and sig == _onlyoffice_hmac_signature(
        "callback", asset_id, doc_key, version_id, parsed_editor_id
    ):
        return True, parsed_editor_id
    if sig == _onlyoffice_hmac_signature("callback", asset_id, doc_key, version_id):
        return True, None
    return False, None


def _file_extension(filename: str) -> str:
    name = (filename or "").strip()
    if "." not in name:
        return ""
    return name.rsplit(".", 1)[-1].lower()


def _onlyoffice_document_type(ext: str) -> str:
    if ext in ["doc", "docx", "odt", "rtf", "txt"]:
        return "word"
    if ext in ["xls", "xlsx", "ods", "csv"]:
        return "cell"
    if ext in ["ppt", "pptx", "odp"]:
        return "slide"
    if ext in ["pdf"]:
        return "pdf"
    return "word"


def _compute_doc_key(
    asset: FileAsset, source_version: FileAssetVersion | None = None
) -> str:
    if source_version is not None:
        raw = ":".join(
            [
                str(asset.id),
                "version",
                str(source_version.version_id or ""),
                str(source_version.etag or ""),
                (
                    source_version.updated_at.isoformat()
                    if source_version.updated_at
                    else ""
                ),
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    etag = ""
    if isinstance(asset.storage_metadata, dict):
        etag = str(asset.storage_metadata.get("ETag") or "")
    raw = f"{asset.id}:current:{etag}:{asset.updated_at.isoformat() if asset.updated_at else ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _new_edit_session_key(asset: FileAsset) -> str:
    raw = f"{_compute_doc_key(asset)}:session:{uuid.uuid4()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _storage_version_id(version_id: str | None) -> str | None:
    value = str(version_id or "").strip()
    if not value or value.lower() == NULL_VERSION_ID:
        return None
    return value


def _api_base_for_onlyoffice(request) -> str:
    override = getattr(settings, "ONLYOFFICE_API_BASE_URL", "") or os.environ.get(
        "ONLYOFFICE_API_BASE_URL"
    ) or os.environ.get(
        "ONLYOFFICE_APP_BASE_URL"
    )
    if override:
        return override.rstrip("/")
    build_absolute_uri = getattr(request, "build_absolute_uri", None)
    if callable(build_absolute_uri):
        return request.build_absolute_uri("/").rstrip("/")
    raw_request = getattr(request, "_request", None)
    if raw_request is not None and callable(
        getattr(raw_request, "build_absolute_uri", None)
    ):
        return raw_request.build_absolute_uri("/").rstrip("/")
    return base_host(request, is_app=True).rstrip("/")


def _version_key(asset: FileAsset) -> str:
    workspace_id = str(asset.workspace_id or "workspace")
    project_id = str(asset.project_id or "project")
    filename = (asset.attributes or {}).get("name") or "file"
    return build_filestore_version_key(
        workspace_id=workspace_id,
        project_id=project_id,
        asset_id=str(asset.id),
        filename=filename,
    )


def _onlyoffice_versions_from_attributes(attributes: dict) -> list:
    if not isinstance(attributes, dict):
        return []
    versions = attributes.get("onlyoffice_versions")
    return versions if isinstance(versions, list) else []


def _set_onlyoffice_state(attributes: dict, patch: dict) -> dict:
    onlyoffice_state = get_onlyoffice_state(attributes)
    onlyoffice_state.update(patch)
    return set_onlyoffice_state(attributes, onlyoffice_state)


def _onlyoffice_doc_session(attributes: dict, doc_key: str) -> dict:
    return get_doc_session(get_onlyoffice_state(attributes), doc_key)


def _set_onlyoffice_doc_session(
    attributes: dict,
    doc_key: str,
    *,
    user,
    mode: str,
    source_version_id: str | None = None,
    base_version_id: str | None = None,
) -> dict:
    now = timezone.now().isoformat()
    onlyoffice_state = get_onlyoffice_state(attributes)
    session = get_doc_session(onlyoffice_state, doc_key)
    if not session:
        session = create_edit_session(
            doc_key=doc_key,
            base_version_id=str(base_version_id or source_version_id or ""),
            now=now,
        )
    session.update(
        {
            "mode": mode,
            "source_version_id": str(source_version_id or ""),
        }
    )
    session = touch_editor(
        session,
        user_id=str(getattr(user, "id", "") or ""),
        user_name=getattr(user, "display_name", None)
        or getattr(user, "email", "")
        or "",
        now=now,
    )
    onlyoffice_state.update(
        {
            "last_opened_at": now,
            "last_source_version_id": str(source_version_id or ""),
            "last_editor_user_id": str(getattr(user, "id", "") or ""),
            "last_editor_user_name": getattr(user, "display_name", None)
            or getattr(user, "email", "")
            or "",
        }
    )
    if mode == "edit" and not source_version_id:
        set_active_session(onlyoffice_state, doc_key, session, now)
    else:
        put_doc_session(onlyoffice_state, doc_key, session)
    return set_onlyoffice_state(attributes, onlyoffice_state)


def _coerce_uuid_string(value) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return str(uuid.UUID(text))
    except (TypeError, ValueError):
        return None


def _asset_content_sha256(asset: FileAsset) -> str | None:
    attributes = asset.attributes if isinstance(asset.attributes, dict) else {}
    value = attributes.get("content_sha256")
    return str(value).strip().lower() if value else None


def _set_asset_content_sha256(asset: FileAsset, digest: str) -> None:
    attributes = asset.attributes if isinstance(asset.attributes, dict) else {}
    attributes["content_sha256"] = str(digest or "").strip().lower()
    asset.attributes = attributes


def _delete_untracked_storage_version(
    storage, asset: FileAsset, version_id: str | None
) -> None:
    storage_version = _storage_version_id(version_id)
    if not storage_version or not asset.storage_key:
        return
    if asset.versions.filter(version_id=version_id).exists():
        return
    try:
        storage.delete_object_version(asset.storage_key, storage_version)
    except Exception:
        pass


def _onlyoffice_created_by_id(
    payload: dict,
    asset: FileAsset | None = None,
    doc_key: str | None = None,
    trusted_editor_user_id: str | None = None,
) -> str | None:
    users = payload.get("users") if isinstance(payload, dict) else None
    if isinstance(users, list) and users:
        candidate = users[0]
    elif isinstance(users, str):
        candidate = users
    else:
        candidate = payload.get("userId") if isinstance(payload, dict) else None

    parsed = _coerce_uuid_string(candidate)
    if parsed:
        return parsed

    actions = payload.get("actions") if isinstance(payload, dict) else None
    if isinstance(actions, list):
        for action in reversed(actions):
            if not isinstance(action, dict):
                continue
            parsed = _coerce_uuid_string(
                action.get("userid") or action.get("userId") or action.get("user_id")
            )
            if parsed:
                return parsed

    if asset is not None and doc_key:
        session = _onlyoffice_doc_session(asset.attributes, doc_key)
        parsed = _coerce_uuid_string(session.get("editor_user_id"))
        if parsed:
            return parsed

    parsed = _coerce_uuid_string(trusted_editor_user_id)
    if parsed:
        return parsed

    if asset is not None:
        onlyoffice_state = (
            (asset.attributes or {}).get("onlyoffice")
            if isinstance(asset.attributes, dict)
            else {}
        )
        if isinstance(onlyoffice_state, dict):
            parsed = _coerce_uuid_string(onlyoffice_state.get("last_editor_user_id"))
            if parsed:
                return parsed

    return None


def _resolve_onlyoffice_callback_session(
    state: dict,
    *,
    asset: FileAsset,
    doc_key: str,
    now: str,
) -> tuple[dict, bool]:
    session = get_doc_session(state, doc_key)
    active_doc_key = str(state.get("active_session_key") or "")

    legacy_doc_key = str(state.get("last_doc_key") or "")
    # Compatibility for a session opened before the stable-key state was deployed.
    if (
        not session
        and not active_doc_key
        and (not legacy_doc_key or legacy_doc_key == doc_key)
    ):
        session = create_edit_session(
            doc_key=doc_key,
            base_version_id=str(asset.version_id or ""),
            now=now,
        )
        set_active_session(state, doc_key, session, now)
        active_doc_key = doc_key
    elif (
        session
        and not active_doc_key
        and str(session.get("state") or "open") != "closed"
    ):
        session["state"] = "open"
        set_active_session(state, doc_key, session, now)
        active_doc_key = doc_key

    return session, active_doc_key == doc_key


def _has_active_onlyoffice_session(asset: FileAsset) -> bool:
    return has_active_session(asset.attributes)


def _download_onlyoffice_file(file_url: str) -> dict:
    response = requests.get(file_url, stream=True, timeout=(5, 120))
    temp_file = None
    try:
        response.raise_for_status()
        temp_file = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024, mode="w+b")
        digest = hashlib.sha256()
        size = 0
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if not chunk:
                continue
            temp_file.write(chunk)
            digest.update(chunk)
            size += len(chunk)
        temp_file.seek(0)
        return {
            "file_obj": temp_file,
            "content_type": response.headers.get("Content-Type"),
            "sha256": digest.hexdigest(),
            "size": size,
        }
    except Exception:
        try:
            temp_file.close()
        except Exception:
            pass
        raise
    finally:
        response.close()


def _get_filestore_asset(pk, slug, project_id):
    return FileAsset.objects.get(
        id=pk,
        workspace__slug=slug,
        project_id=project_id,
        entity_type=FILESTORE_ENTITY_TYPE,
        is_uploaded=True,
        is_deleted=False,
    )


def _serialize_file_version(version: FileAssetVersion) -> dict:
    created_by = version.created_by
    created_by_name = None
    if created_by:
        created_by_name = (
            getattr(created_by, "display_name", None)
            or getattr(created_by, "email", None)
            or str(version.created_by_id)
        )
    return {
        "id": str(version.id),
        "version_id": version.version_id,
        "alias": version.alias or "",
        "filename": version.filename or "",
        "content_type": version.content_type or "",
        "size": int(version.size or 0),
        "etag": version.etag,
        "is_current": bool(version.is_current),
        "created_at": version.created_at,
        "created_by_id": str(version.created_by_id) if version.created_by_id else None,
        "created_by_name": created_by_name,
    }


class FilestoreAssetAPIView(BaseAPIView):

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def get(self, request, slug, project_id):
        name__icontains = request.query_params.get("name__icontains")

        assets = FileAsset.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
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

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_UPLOAD)
    def post(self, request, slug, project_id):
        name = request.data.get("name")
        file_type = request.data.get("type", False)
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        if not name:
            return Response(
                {"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        workspace = Workspace.objects.get(slug=slug)
        # size_limit = min(size, settings.FILE_SIZE_LIMIT)
        size_limit = size

        storage = S3Storage(request=request)
        if not ensure_uploads_bucket_versioning(storage):
            return Response(
                {"error": "Failed to enable uploads bucket versioning"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
        )

        presigned_url = presigned_post_for_asset(
            request=request, asset=asset, file_type=file_type, file_size=size_limit
        )

        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset": {
                    "id": str(asset.id),
                    "attributes": asset.attributes,
                    "created_at": asset.created_at,
                    "created_by_id": (
                        str(asset.created_by_id) if asset.created_by_id else None
                    ),
                    "is_uploaded": bool(asset.is_uploaded),
                },
            },
            status=status.HTTP_200_OK,
        )


class FilestoreAssetDetailAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def patch(self, request, slug, project_id, pk):
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
            )
            if _has_active_onlyoffice_session(asset):
                return Response(
                    {"error": "文件正在在线编辑，暂不能修改文件"},
                    status=status.HTTP_409_CONFLICT,
                )

            if not asset.is_uploaded:
                asset.is_uploaded = True
                asset.created_by = request.user

            if not asset.storage_metadata:
                get_asset_object_metadata.delay(str(asset.id))

            asset.attributes = request.data.get("attributes", asset.attributes)
            asset.save(update_fields=["is_uploaded", "attributes"])
            if asset.storage_key:
                storage = S3Storage(request=request)
                if not ensure_uploads_bucket_versioning(storage):
                    return Response(
                        {"error": "Failed to enable uploads bucket versioning"},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )
                record_latest_object_version(
                    asset=asset,
                    storage=storage,
                    created_by_id=request.user.id,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DELETE)
    def delete(self, request, slug, project_id, pk):
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
            )
            if _has_active_onlyoffice_session(asset):
                return Response(
                    {"error": "文件正在在线编辑，暂不能删除"},
                    status=status.HTTP_409_CONFLICT,
                )
            storage = S3Storage(request=request)
            if not mark_asset_physically_deleted(asset, storage):
                return Response(
                    {"error": "Failed to delete object versions"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
        return Response(status=status.HTTP_204_NO_CONTENT)


class FilestoreAssetDownloadAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DOWNLOAD)
    def get(self, request, slug, project_id, pk):
        disposition = request.query_params.get("disposition") or "attachment"
        if disposition not in ["attachment", "inline"]:
            disposition = "attachment"

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        storage = S3Storage(request=request)
        if not asset.version_id:
            ensure_current_asset_version(asset, storage=storage)
        current_version_id = (
            None
            if str(asset.version_id or "").strip().lower() == NULL_VERSION_ID
            else asset.version_id
        )
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition=disposition,
            filename=asset.attributes.get("name") if asset.attributes else None,
            version_id=current_version_id,
        )

        redirect = request.query_params.get("redirect", "1")
        if str(redirect).lower() in ["0", "false"]:
            return Response({"download_url": signed_url}, status=status.HTTP_200_OK)

        return HttpResponseRedirect(signed_url)


class FilestoreAssetVersionListAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_VIEW)
    def get(self, request, slug, project_id, pk):
        asset = _get_filestore_asset(pk, slug, project_id)
        storage = S3Storage(request=request)
        ensure_current_asset_version(asset, storage=storage)
        versions = (
            asset.versions.filter(deleted_at__isnull=True)
            .select_related("created_by")
            .order_by("-created_at")
        )
        return Response(
            {"versions": [_serialize_file_version(item) for item in versions]},
            status=status.HTTP_200_OK,
        )


class FilestoreAssetVersionDetailAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_EDIT)
    def patch(self, request, slug, project_id, pk, version_id):
        asset = _get_filestore_asset(pk, slug, project_id)
        alias = str(request.data.get("alias") or "").strip()
        if len(alias) > 255:
            return Response(
                {"error": "alias is too long"}, status=status.HTTP_400_BAD_REQUEST
            )

        version = asset.versions.filter(
            version_id=version_id, deleted_at__isnull=True
        ).first()
        if version is None:
            return Response(
                {"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND
            )
        version.alias = alias
        version.save(update_fields=["alias"])
        return Response(
            {"version": _serialize_file_version(version)}, status=status.HTTP_200_OK
        )


class FilestoreAssetVersionDownloadAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_DOWNLOAD)
    def get(self, request, slug, project_id, pk, version_id):
        disposition = request.query_params.get("disposition") or "attachment"
        if disposition not in ["attachment", "inline"]:
            disposition = "attachment"

        asset = _get_filestore_asset(pk, slug, project_id)
        version = asset.versions.filter(
            version_id=version_id, deleted_at__isnull=True
        ).first()
        if version is None:
            return Response(
                {"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND
            )

        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=object_name_for_version(version) or asset.storage_key,
            disposition=disposition,
            filename=version.alias
            or version.filename
            or (asset.attributes or {}).get("name"),
            version_id=_storage_version_id(version.version_id),
        )
        redirect = request.query_params.get("redirect", "1")
        if str(redirect).lower() in ["0", "false"]:
            return Response({"download_url": signed_url}, status=status.HTTP_200_OK)
        return HttpResponseRedirect(signed_url)


class FilestoreAssetVersionUploadAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_EDIT)
    def post(self, request, slug, project_id, pk):
        asset = _get_filestore_asset(pk, slug, project_id)
        if _has_active_onlyoffice_session(asset):
            return Response(
                {"error": "文件正在在线编辑，暂不能上传新版本"},
                status=status.HTTP_409_CONFLICT,
            )
        file_type = (
            request.data.get("type")
            or (asset.attributes or {}).get("type")
            or "application/octet-stream"
        )
        file_size = int(request.data.get("size") or settings.FILE_SIZE_LIMIT)
        size_limit = min(file_size, settings.FILE_SIZE_LIMIT)
        storage = S3Storage(request=request)
        if not ensure_uploads_bucket_versioning(storage):
            return Response(
                {"error": "Failed to enable uploads bucket versioning"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        presigned_url = presigned_post_for_asset(
            request=request,
            asset=asset,
            file_type=file_type,
            file_size=size_limit,
        )
        return Response(
            {"upload_data": presigned_url, "asset_id": str(asset.id)},
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PermissionKey.PROJECT_ASSET_EDIT)
    def patch(self, request, slug, project_id, pk):
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
            )
            if _has_active_onlyoffice_session(asset):
                return Response(
                    {"error": "文件正在在线编辑，暂不能上传新版本"},
                    status=status.HTTP_409_CONFLICT,
                )
            attrs = dict(asset.attributes or {})
            if request.data.get("type"):
                attrs["type"] = request.data.get("type")
            if request.data.get("size") is not None:
                attrs["size"] = int(request.data.get("size") or 0)
            asset.attributes = attrs
            asset.save(update_fields=["attributes"])

            storage = S3Storage(request=request)
            if not ensure_uploads_bucket_versioning(storage):
                return Response(
                    {"error": "Failed to enable uploads bucket versioning"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            version = record_latest_object_version(
                asset=asset,
                storage=storage,
                created_by_id=request.user.id,
                alias=request.data.get("alias") or None,
            )
        return Response(
            {"version": _serialize_file_version(version)}, status=status.HTTP_200_OK
        )


class FilestoreAssetVersionRestoreAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_EDIT)
    def post(self, request, slug, project_id, pk, version_id):
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_deleted=False,
            )
            if _has_active_onlyoffice_session(asset):
                return Response(
                    {"error": "文件正在在线编辑，暂不能恢复版本"},
                    status=status.HTTP_409_CONFLICT,
                )
            target_version = asset.versions.filter(
                version_id=version_id, deleted_at__isnull=True
            ).first()
            if target_version is None:
                return Response(
                    {"error": "Version not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

            storage = S3Storage(request=request)
            deleted_version_ids = restore_asset_to_version(
                asset=asset,
                target_version=target_version,
                storage=storage,
            )
            current_version = (
                asset.versions.filter(is_current=True, deleted_at__isnull=True)
                .select_related("created_by")
                .first()
                or target_version
            )
        return Response(
            {
                "current_version": _serialize_file_version(current_version),
                "deleted_version_ids": deleted_version_ids,
            },
            status=status.HTTP_200_OK,
        )


class FilestoreAssetOnlyOfficeConfigAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def get(self, request, slug, project_id, pk):
        asset = _get_onlyoffice_asset(pk, slug, project_id)
        requested_version_id = str(request.query_params.get("version_id") or "").strip()
        source_version = None
        if requested_version_id:
            if asset.entity_type != FILESTORE_ENTITY_TYPE:
                return Response(
                    {"error": "该文件不支持历史版本预览"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            source_version = (
                asset.versions.filter(
                    version_id=requested_version_id, deleted_at__isnull=True
                )
                .select_related("created_by")
                .first()
            )
            if source_version is None:
                return Response(
                    {"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND
                )

        filename = (asset.attributes or {}).get("name") or "file"
        ext = _file_extension(filename)
        if ext not in ONLYOFFICE_PREVIEW_EXTENSIONS:
            return Response(
                {"error": "该文件类型不支持在线编辑/预览"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        document_type = _onlyoffice_document_type(ext)
        requested_mode = (request.query_params.get("mode") or "").strip().lower()
        user_permission_keys = _get_user_project_permission_keys(
            request.user, slug, project_id
        )
        is_issue_attachment = (
            asset.entity_type == FileAsset.EntityTypeContext.ISSUE_ATTACHMENT
        )
        # 工作项附件、PDF、或显式请求预览：本质只读，与编辑权限无关。
        view_only = (
            requested_mode == "view"
            or source_version is not None
            or is_issue_attachment
            or document_type == "pdf"
        )
        # 其余均为编辑请求：必须具备「编辑项目资产」权限，否则直接拒绝并提示，
        # 不再降级为只读，确保无权限用户无法打开在线编辑器。
        # 复用 allow_fine_permission 的标准文案，便于前端统一按权限错误识别处理。
        if (
            not view_only
            and PermissionKey.PROJECT_ASSET_EDIT not in user_permission_keys
        ):
            return Response(
                {"error": "您没有所需的项目权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )
        mode = "view" if view_only else "edit"

        # 下载按钮受细粒度下载权限控制：无权限的用户在预览/编辑界面看不到下载入口。
        # 工作项附件与项目资产使用各自的下载权限 key。
        if is_issue_attachment:
            download_permission_key = PermissionKey.ISSUE_ATTACHMENT_DOWNLOAD
        else:
            download_permission_key = PermissionKey.PROJECT_ASSET_DOWNLOAD
        can_download = download_permission_key in user_permission_keys

        source_version_id = source_version.version_id if source_version else None
        if mode == "edit":
            with transaction.atomic():
                asset = FileAsset.objects.select_for_update().get(
                    id=pk,
                    workspace__slug=slug,
                    project_id=project_id,
                    entity_type__in=ONLYOFFICE_ENTITY_TYPES,
                    is_uploaded=True,
                    is_deleted=False,
                )
                onlyoffice_state = get_onlyoffice_state(asset.attributes)
                active_doc_key = str(
                    onlyoffice_state.get("active_session_key") or ""
                )
                active_session = get_doc_session(onlyoffice_state, active_doc_key)
                # 过期会话（文档服务器漏发终态回调）视为不可复用，重开新会话。
                if not active_doc_key or not is_session_active(active_session):
                    active_doc_key = _new_edit_session_key(asset)
                doc_key = active_doc_key
                asset.attributes = _set_onlyoffice_doc_session(
                    asset.attributes,
                    doc_key,
                    user=request.user,
                    mode=mode,
                    source_version_id=None,
                    base_version_id=str(asset.version_id or ""),
                )
                asset.save(update_fields=["attributes"])
        else:
            onlyoffice_state = get_onlyoffice_state(asset.attributes)
            active_doc_key = str(onlyoffice_state.get("active_session_key") or "")
            active_session = get_doc_session(onlyoffice_state, active_doc_key)
            if (
                source_version is None
                and active_doc_key
                and is_session_active(active_session)
            ):
                doc_key = active_doc_key
            else:
                doc_key = _compute_doc_key(asset, source_version=source_version)

        download_sig = _onlyoffice_hmac_signature(
            "download", str(asset.id), doc_key, source_version_id
        )
        editor_user_id = str(request.user.id)
        callback_sig = _onlyoffice_hmac_signature(
            "callback", str(asset.id), doc_key, source_version_id, editor_user_id
        )
        signed_download_params = {"key": doc_key, "sig": download_sig}
        signed_callback_params = {
            "key": doc_key,
            "sig": callback_sig,
            "editor_id": editor_user_id,
        }
        if source_version_id:
            signed_download_params["version_id"] = source_version_id
            signed_callback_params["version_id"] = source_version_id

        api_base = _api_base_for_onlyoffice(request)
        document_url = (
            f"{api_base}/api/workspaces/{slug}/projects/{project_id}/filestore/assets/{pk}/onlyoffice/download/"
            f"?{urlencode(signed_download_params)}"
        )
        callback_url = (
            f"{api_base}/api/workspaces/{slug}/projects/{project_id}/filestore/assets/{pk}/onlyoffice/callback/"
            f"?{urlencode(signed_callback_params)}"
        )

        editor_config = {
            "mode": mode,
            "lang": "zh-CN",
            "user": {
                "id": str(request.user.id),
                "name": request.user.display_name or request.user.email,
            },
            "coEditing": {
                "mode": "fast",
                "change": False,
            },
            "customization": {
                "autosave": mode == "edit",
                "forcesave": mode == "edit",
            },
        }
        if mode == "edit":
            editor_config["callbackUrl"] = callback_url

        config = {
            "type": "desktop",
            "documentType": document_type,
            "document": {
                "title": filename,
                "url": document_url,
                "fileType": ext,
                "key": doc_key,
                "permissions": {
                    "download": can_download,
                    "print": can_download,
                    "edit": mode == "edit",
                },
            },
            "editorConfig": editor_config,
        }

        if _onlyoffice_jwt_enabled():
            config["token"] = _jwt_encode_browser_config(config)

        return Response(
            {
                "document_server_url": settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip(
                    "/"
                ),
                "config": config,
            },
            status=status.HTTP_200_OK,
        )


class FilestoreAssetOnlyOfficeDownloadProxyAPIView(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, project_id, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        source_version_id = (
            (request.query_params.get("version_id") or "").split(";", 1)[0].strip()
        )
        if not doc_key or not sig:
            return Response(
                {"error": "missing key/sig"}, status=status.HTTP_400_BAD_REQUEST
            )
        if sig != _onlyoffice_hmac_signature(
            "download", str(pk), doc_key, source_version_id or None
        ):
            return Response(
                {"error": "invalid signature"}, status=status.HTTP_403_FORBIDDEN
            )

        decoded = _jwt_try_decode_from_header(request)
        if decoded is None:
            pass

        asset = _get_onlyoffice_asset(pk, slug, project_id)
        source_version = None
        if source_version_id:
            if asset.entity_type != FILESTORE_ENTITY_TYPE:
                return Response(
                    {"error": "invalid version_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            source_version = asset.versions.filter(
                version_id=source_version_id, deleted_at__isnull=True
            ).first()
            if source_version is None:
                return Response(
                    {"error": "Version not found"}, status=status.HTTP_404_NOT_FOUND
                )

        storage = S3Storage()
        obj = storage.get_object(
            object_name=(
                object_name_for_version(source_version)
                if source_version
                else asset.storage_key
            ),
            version_id=_storage_version_id(source_version_id),
        )
        if not obj or "Body" not in obj:
            return Response(
                {"error": "file not found"}, status=status.HTTP_404_NOT_FOUND
            )

        content_type = (
            obj.get("ContentType")
            or (source_version.content_type if source_version else None)
            or (asset.attributes or {}).get("type")
            or "application/octet-stream"
        )
        response = StreamingHttpResponse(obj["Body"], content_type=content_type)
        response["Content-Length"] = str(
            obj.get("ContentLength")
            or (source_version.size if source_version else None)
            or asset.size
            or ""
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{(source_version.filename if source_version else None) or (asset.attributes or {}).get("name") or "file"}"'
        )
        return response


def _get_requirement_onlyoffice_asset(pk, slug):
    return FileAsset.objects.filter(
        id=pk,
        workspace__slug=slug,
        entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
        is_uploaded=True,
        is_deleted=False,
    ).first()


def _can_view_requirement_asset_owner(user, asset) -> bool:
    """需求附件挂在产品或标准库上（entity_identifier）。产品要对当前用户可见；
    库是工作区级资源，工作区成员即可（与 views/requirement/library_item.py 同口径）。"""
    owner_id = asset.entity_identifier
    if not owner_id:
        return False
    try:
        product = (
            Product.objects.filter(id=owner_id, workspace_id=asset.workspace_id)
            .select_related("workspace")
            .prefetch_related("reviewers")
            .first()
        )
        if product is not None:
            return can_view_product(user, product)
        return RequirementLibrary.objects.filter(
            id=owner_id, workspace_id=asset.workspace_id
        ).exists()
    except (DjangoValidationError, ValueError):
        return False


class RequirementAssetOnlyOfficePreviewConfigAPIView(BaseAPIView):
    """需求级附件的 OnlyOffice **只读**预览配置。

    需求附件挂在产品 / 标准库上，没有 project_id，项目级的 config 端点用不了。只读预览
    不需要回调（view 模式的 config 本来就不带 callbackUrl），所以工作区级只有 config +
    download 两个端点，也不碰编辑会话状态。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        asset = _get_requirement_onlyoffice_asset(pk, slug)
        if asset is None or not _can_view_requirement_asset_owner(request.user, asset):
            return Response(
                {"error": "Asset not found"}, status=status.HTTP_404_NOT_FOUND
            )

        filename = (asset.attributes or {}).get("name") or "file"
        ext = _file_extension(filename)
        if ext not in ONLYOFFICE_PREVIEW_EXTENSIONS:
            return Response(
                {"error": "该文件类型不支持在线预览"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        doc_key = _compute_doc_key(asset)
        download_sig = _onlyoffice_hmac_signature("download", str(asset.id), doc_key)
        document_url = (
            f"{_api_base_for_onlyoffice(request)}/api/workspaces/{slug}/requirement-assets/{pk}/onlyoffice/download/"
            f"?{urlencode({'key': doc_key, 'sig': download_sig})}"
        )

        config = {
            "type": "desktop",
            "documentType": _onlyoffice_document_type(ext),
            "document": {
                "title": filename,
                "url": document_url,
                "fileType": ext,
                "key": doc_key,
                # 能看到这条需求就能下载附件，与工作区级资产下载端点同口径
                "permissions": {"download": True, "print": True, "edit": False},
            },
            "editorConfig": {
                "mode": "view",
                "lang": "zh-CN",
                "user": {
                    "id": str(request.user.id),
                    "name": request.user.display_name or request.user.email,
                },
                "customization": {"autosave": False, "forcesave": False},
            },
        }
        if _onlyoffice_jwt_enabled():
            config["token"] = _jwt_encode_browser_config(config)

        return Response(
            {
                "document_server_url": settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip(
                    "/"
                ),
                "config": config,
            },
            status=status.HTTP_200_OK,
        )


class RequirementAssetOnlyOfficeDownloadProxyAPIView(BaseAPIView):
    """Document Server 取文件用；与项目级代理同款签名，去掉了 project 与历史版本分支。"""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        if not doc_key or not sig:
            return Response(
                {"error": "missing key/sig"}, status=status.HTTP_400_BAD_REQUEST
            )
        if sig != _onlyoffice_hmac_signature("download", str(pk), doc_key):
            return Response(
                {"error": "invalid signature"}, status=status.HTTP_403_FORBIDDEN
            )

        asset = _get_requirement_onlyoffice_asset(pk, slug)
        if asset is None:
            return Response(
                {"error": "file not found"}, status=status.HTTP_404_NOT_FOUND
            )

        storage = S3Storage()
        obj = storage.get_object(object_name=asset.storage_key)
        if not obj or "Body" not in obj:
            return Response(
                {"error": "file not found"}, status=status.HTTP_404_NOT_FOUND
            )

        content_type = (
            obj.get("ContentType")
            or (asset.attributes or {}).get("type")
            or "application/octet-stream"
        )
        response = StreamingHttpResponse(obj["Body"], content_type=content_type)
        response["Content-Length"] = str(obj.get("ContentLength") or asset.size or "")
        response["Content-Disposition"] = (
            f'attachment; filename="{(asset.attributes or {}).get("name") or "file"}"'
        )
        return response


class FilestoreAssetOnlyOfficeCallbackAPIView(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, project_id, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        source_version_id = (
            (request.query_params.get("version_id") or "").split(";", 1)[0].strip()
        )
        editor_user_id = (
            (request.query_params.get("editor_id") or "").split(";", 1)[0].strip()
        )
        if not doc_key or not sig:
            return Response(
                {"error": 1, "message": "missing key/sig"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        signature_ok, _ = _onlyoffice_callback_signature_context(
            sig=sig,
            asset_id=str(pk),
            doc_key=doc_key,
            version_id=source_version_id or None,
            editor_user_id=editor_user_id,
        )
        if not signature_ok:
            return Response(
                {"error": 1, "message": "invalid signature"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({"error": 0}, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        source_version_id = (
            (request.query_params.get("version_id") or "").split(";", 1)[0].strip()
        )
        editor_user_id = (
            (request.query_params.get("editor_id") or "").split(";", 1)[0].strip()
        )
        if not doc_key or not sig:
            return Response(
                {"error": 1, "message": "missing key/sig"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        signature_ok, trusted_editor_user_id = _onlyoffice_callback_signature_context(
            sig=sig,
            asset_id=str(pk),
            doc_key=doc_key,
            version_id=source_version_id or None,
            editor_user_id=editor_user_id,
        )
        if not signature_ok:
            return Response(
                {"error": 1, "message": "invalid signature"},
                status=status.HTTP_403_FORBIDDEN,
            )

        decoded = _jwt_try_decode_from_header(request)
        if _onlyoffice_jwt_enabled() and not isinstance(decoded, dict):
            return Response(
                {"error": 1, "message": "missing or invalid callback token"},
                status=status.HTTP_403_FORBIDDEN,
            )
        decoded_payload = None
        if isinstance(decoded, dict):
            decoded_payload = (
                decoded.get("payload")
                if isinstance(decoded.get("payload"), dict)
                else decoded
            )

        payload = request.data if isinstance(request.data, dict) else {}
        try:
            status_code = int(payload.get("status") or 0)
        except (TypeError, ValueError):
            return Response(
                {"error": 1, "message": "invalid callback status"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if payload.get("key") and str(payload.get("key")) != doc_key:
            return Response(
                {"error": 1, "message": "callback key mismatch"},
                status=status.HTTP_403_FORBIDDEN,
            )
        if isinstance(decoded_payload, dict):
            decoded_status = decoded_payload.get("status")
            decoded_key = decoded_payload.get("key")
            if decoded_status is not None and int(decoded_status) != status_code:
                return Response(
                    {"error": 1, "message": "jwt status mismatch"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if (
                decoded_key
                and payload.get("key")
                and str(decoded_key) != str(payload.get("key"))
            ):
                return Response(
                    {"error": 1, "message": "jwt key mismatch"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        now = timezone.now().isoformat()
        request_id = str(payload.get("userdata") or "").strip()

        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type__in=ONLYOFFICE_ENTITY_TYPES,
                is_uploaded=True,
                is_deleted=False,
            )
            state = get_onlyoffice_state(asset.attributes)
            state.update(
                {
                    "last_callback_at": now,
                    "last_callback_status": status_code,
                }
            )

            if asset.entity_type != FILESTORE_ENTITY_TYPE:
                state["last_error"] = None
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 0}, status=status.HTTP_200_OK)

            session, is_active_session = _resolve_onlyoffice_callback_session(
                state,
                asset=asset,
                doc_key=doc_key,
                now=now,
            )

            if str(session.get("state") or "") == "closed":
                # Duplicate terminal callbacks and delayed force-save callbacks are
                # safe only because the terminal snapshot has already been applied.
                return Response({"error": 0}, status=status.HTTP_200_OK)

            if not is_active_session:
                state.update(
                    {
                        "last_error": "callback does not belong to active session",
                        "last_save_skipped": "inactive_doc_key",
                        "last_stale_doc_key": doc_key,
                    }
                )
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 1}, status=status.HTTP_200_OK)

            session.update(
                {
                    "last_callback_at": now,
                    "last_callback_status": status_code,
                    "last_activity_at": now,
                }
            )

            if status_code == 1:
                users = payload.get("users")
                if isinstance(users, list):
                    existing_editors = (
                        session.get("editors")
                        if isinstance(session.get("editors"), dict)
                        else {}
                    )
                    session["editors"] = {
                        str(user_id): existing_editors.get(str(user_id), {})
                        for user_id in users
                        if user_id
                    }
                    session["active_user_ids"] = [
                        str(user_id) for user_id in users if user_id
                    ]
                put_doc_session(state, doc_key, session)
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 0}, status=status.HTTP_200_OK)

            if status_code in [3, 7]:
                error_message = (
                    "OnlyOffice final save failed"
                    if status_code == 3
                    else "OnlyOffice force save failed"
                )
                session["last_error"] = error_message
                session["last_error_status"] = status_code
                session = complete_save_request(
                    session,
                    request_id=request_id,
                    status="failed",
                    completed_at=now,
                    error=error_message,
                )
                if status_code == 3 or not request_id:
                    session = complete_pending_save_requests(
                        session,
                        status="failed",
                        completed_at=now,
                        error=error_message,
                    )
                state["last_error"] = error_message
                put_doc_session(state, doc_key, session)
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 0}, status=status.HTTP_200_OK)

            if status_code == 4:
                checkpoint_version_id = str(
                    session.get("checkpoint_version_id")
                    or state.get("last_checkpoint_version_id")
                    or ""
                )
                if (
                    checkpoint_version_id
                    and checkpoint_version_id == str(asset.version_id or "")
                    and not asset.versions.filter(
                        version_id=checkpoint_version_id,
                        deleted_at__isnull=True,
                    ).exists()
                ):
                    storage = S3Storage()
                    created_by_id = _onlyoffice_created_by_id(
                        payload,
                        asset=asset,
                        doc_key=doc_key,
                        trusted_editor_user_id=trusted_editor_user_id,
                    )
                    version = record_latest_object_version(
                        asset=asset,
                        storage=storage,
                        created_by_id=created_by_id,
                    )
                    session["last_saved_version_id"] = version.version_id
                    state["last_saved_version_id"] = version.version_id
                    state["last_saved_at"] = now
                    session["last_saved_at"] = now
                session = complete_pending_save_requests(
                    session,
                    status=(
                        "saved" if checkpoint_version_id else "no_changes"
                    ),
                    completed_at=now,
                )
                put_doc_session(state, doc_key, session)
                closed_at = timezone.now().isoformat()
                close_active_session(
                    state,
                    doc_key,
                    terminal_status=status_code,
                    now=closed_at,
                )
                state.update(
                    {
                        "last_error": None,
                        "last_save_skipped": (
                            "checkpoint_promoted"
                            if checkpoint_version_id
                            else "no_changes"
                        ),
                        "last_checkpoint_version_id": None,
                        "last_checkpoint_saved_at": None,
                    }
                )
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 0}, status=status.HTTP_200_OK)

            if status_code not in [2, 6]:
                put_doc_session(state, doc_key, session)
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
                return Response({"error": 0}, status=status.HTTP_200_OK)

            session, callback_sequence, already_completed = (
                resolve_callback_sequence(
                    session,
                    request_id=request_id,
                    received_at=now,
                )
            )
            put_doc_session(state, doc_key, session)
            asset.attributes = set_onlyoffice_state(asset.attributes, state)
            asset.save(update_fields=["attributes"])
            if already_completed:
                return Response({"error": 0}, status=status.HTTP_200_OK)

        file_url = payload.get("url")
        if not file_url:
            error_message = "missing url in callback"
            with transaction.atomic():
                asset = FileAsset.objects.select_for_update().get(id=pk)
                state = get_onlyoffice_state(asset.attributes)
                session = get_doc_session(state, doc_key)
                session["last_error"] = error_message
                session = complete_save_request(
                    session,
                    request_id=request_id,
                    status="failed",
                    completed_at=timezone.now().isoformat(),
                    error=error_message,
                )
                if not request_id:
                    session = complete_pending_save_requests(
                        session,
                        status="failed",
                        completed_at=timezone.now().isoformat(),
                        error=error_message,
                    )
                state["last_error"] = error_message
                put_doc_session(state, doc_key, session)
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
            return Response({"error": 1}, status=status.HTTP_200_OK)

        storage = S3Storage()
        if not ensure_uploads_bucket_versioning(storage):
            error_message = "uploads bucket versioning is not enabled"
            with transaction.atomic():
                asset = FileAsset.objects.select_for_update().get(id=pk)
                state = get_onlyoffice_state(asset.attributes)
                session = get_doc_session(state, doc_key)
                session["last_error"] = error_message
                session = complete_save_request(
                    session,
                    request_id=request_id,
                    status="failed",
                    completed_at=timezone.now().isoformat(),
                    error=error_message,
                )
                if not request_id:
                    session = complete_pending_save_requests(
                        session,
                        status="failed",
                        completed_at=timezone.now().isoformat(),
                        error=error_message,
                    )
                state["last_error"] = error_message
                put_doc_session(state, doc_key, session)
                asset.attributes = set_onlyoffice_state(asset.attributes, state)
                asset.save(update_fields=["attributes"])
            return Response({"error": 1}, status=status.HTTP_200_OK)

        last_exception = None
        for attempt in range(1, 4):
            downloaded = None
            try:
                downloaded = _download_onlyoffice_file(file_url)
                with transaction.atomic():
                    asset = FileAsset.objects.select_for_update().get(
                        id=pk,
                        workspace__slug=slug,
                        project_id=project_id,
                        entity_type=FILESTORE_ENTITY_TYPE,
                        is_uploaded=True,
                        is_deleted=False,
                    )
                    state = get_onlyoffice_state(asset.attributes)
                    session = get_doc_session(state, doc_key)
                    if str(session.get("state") or "") == "closed":
                        return Response({"error": 0}, status=status.HTTP_200_OK)
                    if str(state.get("active_session_key") or "") != doc_key:
                        return Response({"error": 1}, status=status.HTTP_200_OK)

                    last_applied_sequence = int(
                        session.get("last_applied_sequence") or 0
                    )
                    if callback_sequence <= last_applied_sequence:
                        session = complete_save_request(
                            session,
                            request_id=request_id,
                            status="saved",
                            completed_at=timezone.now().isoformat(),
                        )
                        put_doc_session(state, doc_key, session)
                        asset.attributes = set_onlyoffice_state(
                            asset.attributes, state
                        )
                        asset.save(update_fields=["attributes"])
                        return Response({"error": 0}, status=status.HTTP_200_OK)

                    checkpoint_version_id = str(
                        session.get("checkpoint_version_id")
                        or state.get("last_checkpoint_version_id")
                        or ""
                    )
                    current_sha256 = _asset_content_sha256(asset)
                    next_sha256 = downloaded["sha256"]
                    version = None
                    created_by_id = None
                    checkpoint_version_id_next = checkpoint_version_id

                    if not current_sha256 or current_sha256 != next_sha256:
                        content_type = (
                            downloaded.get("content_type")
                            or (asset.attributes or {}).get("type")
                            or "application/octet-stream"
                        )
                        ok = storage.upload_file(
                            file_obj=downloaded["file_obj"],
                            object_name=asset.storage_key,
                            content_type=content_type,
                        )
                        if not ok:
                            raise RuntimeError("upload to storage failed")
                        storage_metadata = storage.get_object_metadata(
                            object_name=asset.storage_key
                        )
                        if not storage_metadata:
                            raise RuntimeError(
                                "missing storage metadata after upload"
                            )

                        if status_code == 6:
                            checkpoint = record_latest_object_checkpoint(
                                asset=asset,
                                storage=storage,
                            )
                            checkpoint_version_id_next = str(
                                checkpoint.get("version_id") or ""
                            )
                        else:
                            created_by_id = _onlyoffice_created_by_id(
                                payload,
                                asset=asset,
                                doc_key=doc_key,
                                trusted_editor_user_id=trusted_editor_user_id,
                            )
                            version = record_latest_object_version(
                                asset=asset,
                                storage=storage,
                                created_by_id=created_by_id,
                            )
                        _set_asset_content_sha256(asset, next_sha256)
                        if isinstance(asset.attributes, dict):
                            asset.attributes["size"] = int(
                                asset.size or downloaded.get("size") or 0
                            )
                    elif (
                        status_code == 2
                        and checkpoint_version_id
                        and checkpoint_version_id == str(asset.version_id or "")
                        and not asset.versions.filter(
                            version_id=checkpoint_version_id,
                            deleted_at__isnull=True,
                        ).exists()
                    ):
                        created_by_id = _onlyoffice_created_by_id(
                            payload,
                            asset=asset,
                            doc_key=doc_key,
                            trusted_editor_user_id=trusted_editor_user_id,
                        )
                        version = record_latest_object_version(
                            asset=asset,
                            storage=storage,
                            created_by_id=created_by_id,
                        )

                    if (
                        checkpoint_version_id
                        and status_code == 6
                        and checkpoint_version_id != checkpoint_version_id_next
                    ):
                        _delete_untracked_storage_version(
                            storage,
                            asset,
                            checkpoint_version_id,
                        )
                    elif (
                        checkpoint_version_id
                        and status_code == 2
                        and version is not None
                        and checkpoint_version_id != version.version_id
                    ):
                        _delete_untracked_storage_version(
                            storage,
                            asset,
                            checkpoint_version_id,
                        )

                    saved_at = timezone.now().isoformat()
                    session["last_applied_sequence"] = callback_sequence
                    session["last_saved_at"] = saved_at
                    session["last_error"] = ""
                    session = complete_save_request(
                        session,
                        request_id=request_id,
                        status="saved",
                        completed_at=saved_at,
                    )
                    state.update(
                        {
                            "last_saved_at": saved_at,
                            "last_error": None,
                            "last_save_skipped": (
                                "checkpoint"
                                if status_code == 6
                                else (
                                    "unchanged" if version is None else None
                                )
                            ),
                        }
                    )

                    if status_code == 6:
                        session["checkpoint_version_id"] = (
                            checkpoint_version_id_next
                        )
                        state.update(
                            {
                                "last_force_saved_at": saved_at,
                                "last_checkpoint_saved_at": saved_at,
                                "last_checkpoint_version_id": (
                                    checkpoint_version_id_next
                                ),
                            }
                        )
                        put_doc_session(state, doc_key, session)
                    else:
                        if version is not None:
                            session["last_saved_version_id"] = version.version_id
                            state["last_saved_version_id"] = version.version_id
                            state["last_saved_by_id"] = str(
                                created_by_id or ""
                            )
                        session["checkpoint_version_id"] = ""
                        session = complete_pending_save_requests(
                            session,
                            status="saved",
                            completed_at=saved_at,
                        )
                        put_doc_session(state, doc_key, session)
                        close_active_session(
                            state,
                            doc_key,
                            terminal_status=status_code,
                            now=saved_at,
                        )
                        state.update(
                            {
                                "last_checkpoint_version_id": None,
                                "last_checkpoint_saved_at": None,
                            }
                        )

                    asset.attributes = set_onlyoffice_state(
                        asset.attributes, state
                    )
                    asset.save(update_fields=["attributes"])
                    return Response({"error": 0}, status=status.HTTP_200_OK)
            except Exception as exc:
                last_exception = exc
                time.sleep(min(2**attempt, 8))
            finally:
                try:
                    if downloaded is not None and downloaded.get("file_obj"):
                        downloaded["file_obj"].close()
                except Exception:
                    pass

        error_message = f"保存失败: {last_exception}"
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(id=pk)
            state = get_onlyoffice_state(asset.attributes)
            session = get_doc_session(state, doc_key)
            session["last_error"] = error_message
            session = complete_save_request(
                session,
                request_id=request_id,
                status="failed",
                completed_at=timezone.now().isoformat(),
                error=error_message,
            )
            if not request_id:
                session = complete_pending_save_requests(
                    session,
                    status="failed",
                    completed_at=timezone.now().isoformat(),
                    error=error_message,
                )
            state["last_error"] = error_message
            put_doc_session(state, doc_key, session)
            asset.attributes = set_onlyoffice_state(asset.attributes, state)
            asset.save(update_fields=["attributes"])
        return Response({"error": 1}, status=status.HTTP_200_OK)


class FilestoreAssetOnlyOfficeStatusAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def get(self, request, slug, project_id, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )
        onlyoffice = get_onlyoffice_state(asset.attributes)
        requested_doc_key = str(request.query_params.get("doc_key") or "").strip()
        requested_save_request_id = str(
            request.query_params.get("save_request_id") or ""
        ).strip()
        status_doc_key = (
            requested_doc_key
            or str(onlyoffice.get("active_session_key") or "")
            or str(onlyoffice.get("last_doc_key") or "")
        )
        return Response(
            {
                "onlyoffice": onlyoffice,
                "session": session_status(
                    onlyoffice,
                    doc_key=status_doc_key,
                    request_id=requested_save_request_id,
                ),
                "versions_count": asset.versions.filter(
                    deleted_at__isnull=True
                ).count(),
                "updated_at": asset.updated_at,
            },
            status=status.HTTP_200_OK,
        )


class FilestoreAssetOnlyOfficeVersionsAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def get(self, request, slug, project_id, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )
        storage = S3Storage(request=request)
        ensure_current_asset_version(asset, storage=storage)
        versions = (
            asset.versions.filter(deleted_at__isnull=True)
            .select_related("created_by")
            .order_by("-created_at")
        )
        return Response(
            {"versions": [_serialize_file_version(version) for version in versions]},
            status=status.HTTP_200_OK,
        )


class FilestoreAssetOnlyOfficeRestoreVersionAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        version_key = request.data.get("version_key")
        if not version_key:
            return Response(
                {"error": "version_key is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )
        if _has_active_onlyoffice_session(asset):
            return Response(
                {"error": "文件正在在线编辑，暂不能恢复版本"},
                status=status.HTTP_409_CONFLICT,
            )

        versions = _onlyoffice_versions_from_attributes(asset.attributes)
        allowed_prefix = filestore_version_prefix(
            workspace_id=str(asset.workspace_id),
            project_id=str(asset.project_id),
            asset_id=str(asset.id),
        )
        if not str(version_key).startswith(allowed_prefix):
            return Response(
                {"error": "invalid version_key"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not any(
            isinstance(v, dict) and v.get("key") == version_key for v in versions
        ):
            return Response(
                {"error": "version_key not found"}, status=status.HTTP_400_BAD_REQUEST
            )

        storage = S3Storage()
        try:
            snapshot_key = _version_key(asset)
            storage.copy_object(
                object_name=asset.storage_key, new_object_name=snapshot_key
            )
            storage.copy_object(
                object_name=version_key, new_object_name=asset.storage_key
            )

            storage_metadata = storage.get_object_metadata(
                object_name=asset.storage_key
            )
            if storage_metadata:
                asset.storage_metadata = storage_metadata
                asset.size = float(
                    storage_metadata.get("ContentLength") or asset.size or 0
                )
                if isinstance(asset.attributes, dict):
                    asset.attributes["size"] = int(asset.size)

            asset.attributes = _set_onlyoffice_state(
                asset.attributes,
                {"last_restored_at": timezone.now().isoformat(), "last_error": None},
            )

            restore_record = {
                "id": hashlib.sha256(snapshot_key.encode("utf-8")).hexdigest()[:16],
                "key": snapshot_key,
                "saved_at": timezone.now().isoformat(),
                "by": str(getattr(request.user, "id", "") or ""),
                "doc_key": _compute_doc_key(asset),
                "status": "restore_snapshot",
                "restored_from": version_key,
            }
            versions.insert(0, restore_record)
            if isinstance(asset.attributes, dict):
                asset.attributes["onlyoffice_versions"] = versions[:50]

            asset.save(
                update_fields=["attributes", "size", "storage_metadata", "updated_at"]
            )
            return Response({"status": "ok"}, status=status.HTTP_200_OK)
        except Exception as e:
            asset.attributes = _set_onlyoffice_state(
                asset.attributes, {"last_error": f"恢复失败: {e}"}
            )
            asset.save(update_fields=["attributes"])
            return Response(
                {"error": "restore failed"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class FilestoreAssetOnlyOfficeForceSaveAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.PROJECT_ASSET_EDIT)
    def post(self, request, slug, project_id, pk):
        doc_key = str(request.data.get("doc_key") or "").strip()
        if not doc_key:
            return Response(
                {"error": "doc_key is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request_id = str(uuid.uuid4())
        requested_at = timezone.now().isoformat()
        with transaction.atomic():
            asset = FileAsset.objects.select_for_update().get(
                id=pk,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=FILESTORE_ENTITY_TYPE,
                is_uploaded=True,
                is_deleted=False,
            )
            state = get_onlyoffice_state(asset.attributes)
            if str(state.get("active_session_key") or "") != doc_key:
                return Response(
                    {"error": "document session is no longer active"},
                    status=status.HTTP_409_CONFLICT,
                )
            session = get_doc_session(state, doc_key)
            if str(session.get("state") or "") != "open":
                return Response(
                    {"error": "document session is not open"},
                    status=status.HTTP_409_CONFLICT,
                )
            session, _ = register_save_request(
                session,
                request_id=request_id,
                requested_at=requested_at,
            )
            put_doc_session(state, doc_key, session)
            state.update(
                {
                    "last_forcesave_requested_at": requested_at,
                    "last_forcesave_doc_key": doc_key,
                    "last_error": None,
                }
            )
            asset.attributes = set_onlyoffice_state(asset.attributes, state)
            asset.save(update_fields=["attributes"])

        def complete_request(
            request_status: str,
            *,
            error_message: str = "",
        ) -> None:
            completed_at = timezone.now().isoformat()
            with transaction.atomic():
                locked_asset = FileAsset.objects.select_for_update().get(id=pk)
                locked_state = get_onlyoffice_state(locked_asset.attributes)
                locked_session = get_doc_session(locked_state, doc_key)
                locked_session = complete_save_request(
                    locked_session,
                    request_id=request_id,
                    status=request_status,
                    completed_at=completed_at,
                    error=error_message,
                )
                if error_message:
                    locked_session["last_error"] = error_message
                    locked_state["last_error"] = error_message
                put_doc_session(locked_state, doc_key, locked_session)
                locked_asset.attributes = set_onlyoffice_state(
                    locked_asset.attributes, locked_state
                )
                locked_asset.save(update_fields=["attributes"])

        command_body = {
            "c": "forcesave",
            "key": doc_key,
            "userdata": request_id,
        }
        body = dict(command_body)
        headers = {"Content-Type": "application/json"}
        if _onlyoffice_jwt_enabled():
            token = _jwt_encode_request_payload(command_body)
            body["token"] = token
            headers[_onlyoffice_jwt_header()] = f"Bearer {token}"

        document_server_url = settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip("/")
        command_urls = [
            f"{document_server_url}/command",
            f"{document_server_url}/coauthoring/CommandService.ashx",
        ]
        command_url = command_urls[0]
        try:
            resp = None
            for index, candidate_url in enumerate(command_urls):
                command_url = candidate_url
                resp = requests.post(
                    candidate_url,
                    json=body,
                    headers=headers,
                    timeout=(5, 30),
                )
                if resp.status_code != status.HTTP_404_NOT_FOUND or index == 1:
                    break

            if resp is None:
                raise RuntimeError("empty response from document server")
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}

            if not resp.ok:
                error_message = (
                    f"OnlyOffice command HTTP {resp.status_code}"
                )
                complete_request("failed", error_message=error_message)
                return Response(
                    {
                        "error": error_message,
                        "save_request_id": request_id,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            try:
                command_error = int(data.get("error") or 0)
            except (AttributeError, TypeError, ValueError):
                command_error = -1

            if command_error == 4:
                complete_request("no_changes")
                return Response(
                    {
                        "doc_key": doc_key,
                        "save_request_id": request_id,
                        "status": "no_changes",
                    },
                    status=status.HTTP_200_OK,
                )
            if command_error != 0:
                error_message = f"OnlyOffice command error {command_error}"
                complete_request("failed", error_message=error_message)
                return Response(
                    {
                        "error": error_message,
                        "save_request_id": request_id,
                        "response": data,
                    },
                    status=status.HTTP_502_BAD_GATEWAY,
                )

            return Response(
                {
                    "doc_key": doc_key,
                    "save_request_id": request_id,
                    "status": "accepted",
                },
                status=status.HTTP_200_OK,
            )
        except Exception as exc:
            error_message = f"forcesave失败: {exc}"
            complete_request("failed", error_message=error_message)
            return Response(
                {
                    "error": "forcesave failed",
                    "save_request_id": request_id,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
