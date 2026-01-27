import uuid
import os
import hashlib
import hmac
import time
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponseRedirect, StreamingHttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
import jwt
import requests

from plane.app.permissions import allow_permission, ROLE
from plane.app.views import BaseAPIView
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, Workspace
from plane.settings.storage import S3Storage
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response
from plane.utils.host import base_host

FILESTORE_ENTITY_TYPE = "PROJECT_FILESTORE"



def _onlyoffice_jwt_secret() -> str:
    return (
        os.environ.get("ONLYOFFICE_JWT_SECRET")
        or os.environ.get("JWT_SECRET")
        or os.environ.get("DOCUMENT_SERVER_JWT_SECRET")
        or "jwt_secret"
    )


def _onlyoffice_jwt_enabled() -> bool:
    raw = (
        os.environ.get("ONLYOFFICE_JWT_ENABLED")
        or os.environ.get("JWT_ENABLED")
        or os.environ.get("DOCUMENT_SERVER_JWT_ENABLED")
    )
    if raw is None:
        return True
    val = str(raw).strip().lower()
    if val in ["0", "false", "no", "off"]:
        return False
    if val in ["1", "true", "yes", "on"]:
        return True
    return True


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


def _onlyoffice_hmac_signature(purpose: str, asset_id: str, doc_key: str) -> str:
    msg = f"{purpose}:{asset_id}:{doc_key}"
    return hmac.new(str(settings.SECRET_KEY).encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()


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


def _compute_doc_key(asset: FileAsset) -> str:
    etag = ""
    if isinstance(asset.storage_metadata, dict):
        etag = str(asset.storage_metadata.get("ETag") or "")
    raw = f"{asset.id}:{etag}:{asset.updated_at.isoformat() if asset.updated_at else ''}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _api_base_for_onlyoffice(request) -> str:
    override = os.environ.get("ONLYOFFICE_API_BASE_URL")
    if override:
        return override.rstrip("/")
    build_absolute_uri = getattr(request, "build_absolute_uri", None)
    if callable(build_absolute_uri):
        return request.build_absolute_uri("/").rstrip("/")
    raw_request = getattr(request, "_request", None)
    if raw_request is not None and callable(getattr(raw_request, "build_absolute_uri", None)):
        return raw_request.build_absolute_uri("/").rstrip("/")
    return base_host(request, is_app=True).rstrip("/")


def _version_key(asset: FileAsset) -> str:
    workspace_id = str(asset.workspace_id or "workspace")
    filename = (asset.attributes or {}).get("name") or "file"
    ts = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    return f"{workspace_id}/filestore_versions/{asset.id}/{ts}-{filename}"


def _onlyoffice_versions_from_attributes(attributes: dict) -> list:
    if not isinstance(attributes, dict):
        return []
    versions = attributes.get("onlyoffice_versions")
    return versions if isinstance(versions, list) else []


def _set_onlyoffice_state(attributes: dict, patch: dict) -> dict:
    if not isinstance(attributes, dict):
        attributes = {}
    onlyoffice_state = attributes.get("onlyoffice")
    if not isinstance(onlyoffice_state, dict):
        onlyoffice_state = {}
    onlyoffice_state.update(patch)
    attributes["onlyoffice"] = onlyoffice_state
    return attributes


class FilestoreAssetAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id):
        name = request.data.get("name")
        file_type = request.data.get("type", False)
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not file_type or file_type not in settings.ATTACHMENT_MIME_TYPES:
            return Response(
                {"error": "Invalid file type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"
        # size_limit = min(size, settings.FILE_SIZE_LIMIT)
        size_limit = size

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
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
                    "created_by_id": str(asset.created_by_id)
                    if asset.created_by_id
                    else None,
                    "is_uploaded": bool(asset.is_uploaded),
                },
            },
            status=status.HTTP_200_OK,
        )


class FilestoreAssetDetailAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def patch(self, request, slug, project_id, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def delete(self, request, slug, project_id, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_deleted=False,
        )
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FilestoreAssetDownloadAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
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
        signed_url = storage.generate_presigned_url(
            object_name=asset.asset.name,
            disposition=disposition,
            filename=asset.attributes.get("name") if asset.attributes else None,
        )

        redirect = request.query_params.get("redirect", "1")
        if str(redirect).lower() in ["0", "false"]:
            return Response({"download_url": signed_url}, status=status.HTTP_200_OK)

        return HttpResponseRedirect(signed_url)


class FilestoreAssetOnlyOfficeConfigAPIView(BaseAPIView):
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

        filename = (asset.attributes or {}).get("name") or "file"
        ext = _file_extension(filename)
        if ext not in ["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "pdf"]:
            return Response({"error": "该文件类型不支持在线编辑/预览"}, status=status.HTTP_400_BAD_REQUEST)

        doc_key = _compute_doc_key(asset)
        download_sig = _onlyoffice_hmac_signature("download", str(asset.id), doc_key)
        callback_sig = _onlyoffice_hmac_signature("callback", str(asset.id), doc_key)

        api_base = _api_base_for_onlyoffice(request)
        document_url = (
            f"{api_base}/api/workspaces/{slug}/projects/{project_id}/filestore/assets/{pk}/onlyoffice/download/"
            f"?{urlencode({'key': doc_key, 'sig': download_sig})}"
        )
        callback_url = (
            f"{api_base}/api/workspaces/{slug}/projects/{project_id}/filestore/assets/{pk}/onlyoffice/callback/"
            f"?{urlencode({'key': doc_key, 'sig': callback_sig})}"
        )

        document_type = _onlyoffice_document_type(ext)
        mode = "view" if document_type == "pdf" else "edit"

        config = {
            "type": "desktop",
            "documentType": document_type,
            "document": {
                "title": filename,
                "url": document_url,
                "fileType": ext,
                "key": doc_key,
                "permissions": {"download": True, "edit": mode == "edit"},
            },
            "editorConfig": {
                "mode": mode,
                "lang": "zh-CN",
                "callbackUrl": callback_url,
                "user": {"id": str(request.user.id), "name": request.user.display_name or request.user.email},
                "customization": {"autosave": True, "forcesave": True},
            },
        }

        if _onlyoffice_jwt_enabled():
            config["token"] = _jwt_encode_browser_config(config)

        asset.attributes = _set_onlyoffice_state(
            asset.attributes,
            {"last_opened_at": timezone.now().isoformat(), "last_doc_key": doc_key},
        )
        asset.save(update_fields=["attributes"])

        return Response(
            {
                "document_server_url": settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip("/"),
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
        if not doc_key or not sig:
            return Response({"error": "missing key/sig"}, status=status.HTTP_400_BAD_REQUEST)
        if sig != _onlyoffice_hmac_signature("download", str(pk), doc_key):
            return Response({"error": "invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        decoded = _jwt_try_decode_from_header(request)
        if decoded is None:
            pass

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        storage = S3Storage()
        obj = storage.get_object(object_name=asset.asset.name)
        if not obj or "Body" not in obj:
            return Response({"error": "file not found"}, status=status.HTTP_404_NOT_FOUND)

        content_type = obj.get("ContentType") or (asset.attributes or {}).get("type") or "application/octet-stream"
        response = StreamingHttpResponse(obj["Body"], content_type=content_type)
        response["Content-Length"] = str(obj.get("ContentLength") or asset.size or "")
        response["Content-Disposition"] = f'attachment; filename="{(asset.attributes or {}).get("name") or "file"}"'
        return response


class FilestoreAssetOnlyOfficeCallbackAPIView(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, project_id, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        if not doc_key or not sig:
            return Response({"error": 1, "message": "missing key/sig"}, status=status.HTTP_400_BAD_REQUEST)
        if sig != _onlyoffice_hmac_signature("callback", str(pk), doc_key):
            return Response({"error": 1, "message": "invalid signature"}, status=status.HTTP_403_FORBIDDEN)
        return Response({"error": 0}, status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, pk):
        doc_key = (request.query_params.get("key") or "").split(";", 1)[0]
        sig = (request.query_params.get("sig") or "").split(";", 1)[0]
        if not doc_key or not sig:
            return Response({"error": 1, "message": "missing key/sig"}, status=status.HTTP_400_BAD_REQUEST)
        if sig != _onlyoffice_hmac_signature("callback", str(pk), doc_key):
            return Response({"error": 1, "message": "invalid signature"}, status=status.HTTP_403_FORBIDDEN)

        decoded = _jwt_try_decode_from_header(request)
        decoded_payload = None
        if isinstance(decoded, dict):
            decoded_payload = decoded.get("payload") if isinstance(decoded.get("payload"), dict) else decoded

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        payload = request.data if isinstance(request.data, dict) else {}
        status_code = int(payload.get("status") or 0)
        if isinstance(decoded_payload, dict):
            decoded_status = decoded_payload.get("status")
            decoded_key = decoded_payload.get("key")
            if decoded_status is not None and int(decoded_status) != status_code:
                return Response({"error": 1, "message": "jwt status mismatch"}, status=status.HTTP_403_FORBIDDEN)
            if decoded_key and payload.get("key") and str(decoded_key) != str(payload.get("key")):
                return Response({"error": 1, "message": "jwt key mismatch"}, status=status.HTTP_403_FORBIDDEN)

        asset.attributes = _set_onlyoffice_state(
            asset.attributes,
            {"last_callback_at": timezone.now().isoformat(), "last_callback_status": status_code},
        )

        if status_code in [2, 6]:
            file_url = payload.get("url")
            if not file_url:
                asset.attributes = _set_onlyoffice_state(asset.attributes, {"last_error": "missing url in callback"})
                asset.save(update_fields=["attributes"])
                return Response({"error": 1}, status=status.HTTP_200_OK)

            storage = S3Storage()

            version_record = None
            try:
                new_version_key = _version_key(asset)
                storage.copy_object(object_name=asset.asset.name, new_object_name=new_version_key)
                version_record = {
                    "id": hashlib.sha256(new_version_key.encode("utf-8")).hexdigest()[:16],
                    "key": new_version_key,
                    "saved_at": timezone.now().isoformat(),
                    "by": (payload.get("users") or payload.get("userId") or None),
                    "doc_key": doc_key,
                    "status": status_code,
                }
            except Exception as e:
                asset.attributes = _set_onlyoffice_state(asset.attributes, {"last_error": f"版本快照失败: {e}"})

            last_exception = None
            response = None
            for attempt in range(1, 4):
                try:
                    response = requests.get(file_url, stream=True, timeout=(5, 120))
                    response.raise_for_status()
                    response.raw.decode_content = True
                    content_type = (
                        response.headers.get("Content-Type")
                        or (asset.attributes or {}).get("type")
                        or "application/octet-stream"
                    )
                    ok = storage.upload_file(
                        file_obj=response.raw,
                        object_name=asset.asset.name,
                        content_type=content_type,
                    )
                    if not ok:
                        raise RuntimeError("upload to storage failed")

                    storage_metadata = storage.get_object_metadata(object_name=asset.asset.name)
                    if storage_metadata:
                        asset.storage_metadata = storage_metadata
                        asset.size = float(storage_metadata.get("ContentLength") or asset.size or 0)
                        if isinstance(asset.attributes, dict):
                            asset.attributes["size"] = int(asset.size)

                    versions = _onlyoffice_versions_from_attributes(asset.attributes)
                    if version_record:
                        versions.insert(0, version_record)
                        asset.attributes["onlyoffice_versions"] = versions[:50]

                    asset.attributes = _set_onlyoffice_state(
                        asset.attributes,
                        {"last_saved_at": timezone.now().isoformat(), "last_error": None},
                    )
                    asset.save(update_fields=["attributes", "size", "storage_metadata", "updated_at"])
                    return Response({"error": 0}, status=status.HTTP_200_OK)
                except Exception as e:
                    last_exception = e
                    time.sleep(min(2 ** attempt, 8))
                finally:
                    try:
                        if response is not None:
                            response.close()
                    except Exception:
                        pass

            asset.attributes = _set_onlyoffice_state(asset.attributes, {"last_error": f"保存失败: {last_exception}"})
            asset.save(update_fields=["attributes"])
            return Response({"error": 1}, status=status.HTTP_200_OK)

        asset.save(update_fields=["attributes"])
        return Response({"error": 0}, status=status.HTTP_200_OK)


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
        onlyoffice = (asset.attributes or {}).get("onlyoffice") if isinstance(asset.attributes, dict) else {}
        versions = _onlyoffice_versions_from_attributes(asset.attributes)
        return Response(
            {
                "onlyoffice": onlyoffice if isinstance(onlyoffice, dict) else {},
                "versions_count": len(versions),
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
        versions = _onlyoffice_versions_from_attributes(asset.attributes)
        return Response({"versions": versions}, status=status.HTTP_200_OK)


class FilestoreAssetOnlyOfficeRestoreVersionAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        version_key = request.data.get("version_key")
        if not version_key:
            return Response({"error": "version_key is required"}, status=status.HTTP_400_BAD_REQUEST)

        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        versions = _onlyoffice_versions_from_attributes(asset.attributes)
        allowed_prefix = f"{asset.workspace_id}/filestore_versions/{asset.id}/"
        if not str(version_key).startswith(allowed_prefix):
            return Response({"error": "invalid version_key"}, status=status.HTTP_400_BAD_REQUEST)
        if not any(isinstance(v, dict) and v.get("key") == version_key for v in versions):
            return Response({"error": "version_key not found"}, status=status.HTTP_400_BAD_REQUEST)

        storage = S3Storage()
        try:
            snapshot_key = _version_key(asset)
            storage.copy_object(object_name=asset.asset.name, new_object_name=snapshot_key)
            storage.copy_object(object_name=version_key, new_object_name=asset.asset.name)

            storage_metadata = storage.get_object_metadata(object_name=asset.asset.name)
            if storage_metadata:
                asset.storage_metadata = storage_metadata
                asset.size = float(storage_metadata.get("ContentLength") or asset.size or 0)
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

            asset.save(update_fields=["attributes", "size", "storage_metadata", "updated_at"])
            return Response({"status": "ok"}, status=status.HTTP_200_OK)
        except Exception as e:
            asset.attributes = _set_onlyoffice_state(asset.attributes, {"last_error": f"恢复失败: {e}"})
            asset.save(update_fields=["attributes"])
            return Response({"error": "restore failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class FilestoreAssetOnlyOfficeForceSaveAPIView(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def post(self, request, slug, project_id, pk):
        asset = FileAsset.objects.get(
            id=pk,
            workspace__slug=slug,
            project_id=project_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        )

        doc_key = request.data.get("doc_key") or _compute_doc_key(asset)

        body = {"c": "forcesave", "key": doc_key}

        headers = {"Content-Type": "application/json"}
        if _onlyoffice_jwt_enabled():
            token = _jwt_encode_request_payload(body)
            headers[_onlyoffice_jwt_header()] = f"Bearer {token}"

        command_url = settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip("/") + "/coauthoring/CommandService.ashx"
        try:
            resp = requests.post(command_url, json=body, headers=headers, timeout=(5, 30))
            data = None
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}

            asset.attributes = _set_onlyoffice_state(
                asset.attributes,
                {"last_forcesave_requested_at": timezone.now().isoformat(), "last_forcesave_doc_key": doc_key},
            )
            asset.save(update_fields=["attributes"])

            return Response(
                {
                    "document_server_url": settings.ONLYOFFICE_DOCUMENT_SERVER_URL.rstrip("/"),
                    "command_url": command_url,
                    "response_status": resp.status_code,
                    "response": data,
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            asset.attributes = _set_onlyoffice_state(asset.attributes, {"last_error": f"forcesave失败: {e}"})
            asset.save(update_fields=["attributes"])
            return Response({"error": "forcesave failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
