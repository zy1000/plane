from __future__ import annotations

from typing import Optional

from django.db import transaction
from django.utils import timezone

from plane.db.models import FileAsset, FileAssetVersion
from plane.utils.asset_upload import build_asset_metadata
from plane.utils.exception_logger import log_exception


NULL_VERSION_ID = "null"


def normalize_version_id(version_id: Optional[str]) -> str:
    value = str(version_id or "").strip()
    return value or NULL_VERSION_ID


def ensure_uploads_bucket_versioning(storage) -> bool:
    """Ensure the configured uploads bucket has object versioning enabled."""
    try:
        versioning = storage.get_bucket_versioning() or {}
        if versioning.get("Status") == "Enabled":
            return True
        return storage.enable_bucket_versioning() is not None
    except Exception as exc:
        log_exception(exc)
        return False


def version_alias_for_asset(asset: FileAsset) -> str:
    attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
    return attrs.get("name") or asset.filename or "文件版本"


def metadata_for_version(storage, object_name: str, version_id: Optional[str] = None) -> dict:
    metadata = storage.get_object_metadata(object_name=object_name, version_id=version_id) or {}
    return {
        "version_id": normalize_version_id(metadata.get("VersionId") or version_id),
        "content_type": metadata.get("ContentType"),
        "size": float(metadata.get("ContentLength") or 0),
        "etag": metadata.get("ETag"),
        "storage_metadata": metadata,
    }


def storage_version_id(version_id: Optional[str]) -> Optional[str]:
    version_id = normalize_version_id(version_id)
    if version_id == NULL_VERSION_ID:
        return None
    return version_id


def object_name_for_version(version: FileAssetVersion) -> str:
    object_name = str(getattr(version, "object_name", "") or "").strip()
    if object_name:
        return object_name
    asset = getattr(version, "asset", None)
    return getattr(asset, "storage_key", "") or ""


def _delete_tracked_version(storage, version: FileAssetVersion) -> bool:
    object_name = object_name_for_version(version)
    if not object_name:
        return True
    version_id = storage_version_id(version.version_id)
    if version_id:
        return storage.delete_object_version(object_name, version_id)
    return storage.delete_all_object_versions(object_name)


def _save_file_asset_version(
    *, asset: FileAsset, version_id: str, defaults: dict, created_by_id=None
) -> FileAssetVersion:
    version = FileAssetVersion.objects.filter(
        asset=asset, version_id=version_id
    ).first()

    if version is None:
        version = FileAssetVersion(asset=asset, version_id=version_id)

    for field, value in defaults.items():
        setattr(version, field, value)
    update_fields = list(defaults.keys()) if version.pk else None
    if update_fields is not None:
        update_fields.append("updated_at")
    if created_by_id is not None:
        version.created_by_id = created_by_id
        if update_fields is not None:
            update_fields.append("created_by")

    # OnlyOffice callbacks are unauthenticated server-to-server requests, so
    # BaseModel's request-user auto fill would otherwise clear created_by.
    version.save(
        update_fields=update_fields,
        disable_auto_set_user=True,
    )
    return version


@transaction.atomic
def set_current_asset_version(
    *,
    asset: FileAsset,
    version_id: str,
    alias: Optional[str] = None,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
    size: Optional[float] = None,
    etag: Optional[str] = None,
    storage_metadata: Optional[dict] = None,
    created_by_id=None,
    object_name: Optional[str] = None,
) -> FileAssetVersion:
    version_id = normalize_version_id(version_id)
    FileAssetVersion.objects.filter(asset=asset, is_current=True, deleted_at__isnull=True).update(is_current=False)
    defaults = {
        "object_name": object_name or asset.storage_key or "",
        "alias": alias or version_alias_for_asset(asset),
        "filename": filename or asset.filename or "",
        "content_type": content_type,
        "size": float(size if size is not None else asset.size or 0),
        "etag": etag,
        "storage_metadata": storage_metadata or {},
        "is_current": True,
        "deleted_at": None,
    }
    version = _save_file_asset_version(
        asset=asset,
        version_id=version_id,
        defaults=defaults,
        created_by_id=created_by_id,
    )
    asset.version_id = version_id
    if size is not None:
        asset.size = float(size or 0)
        if isinstance(asset.attributes, dict):
            asset.attributes["size"] = int(asset.size)
    if storage_metadata is not None:
        asset.storage_metadata = storage_metadata
    asset.save(update_fields=["version_id", "size", "storage_metadata", "attributes", "updated_at"])
    return version


def ensure_current_asset_version(asset: FileAsset, storage=None) -> Optional[FileAssetVersion]:
    version_id = normalize_version_id(asset.version_id)
    current = asset.versions.filter(version_id=version_id, deleted_at__isnull=True).first()
    if current:
        if not current.is_current:
            FileAssetVersion.objects.filter(asset=asset, is_current=True, deleted_at__isnull=True).update(is_current=False)
            current.is_current = True
            current.save(update_fields=["is_current"])
        return current

    attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
    onlyoffice_state = attrs.get("onlyoffice") if isinstance(attrs.get("onlyoffice"), dict) else {}
    checkpoint_raw = onlyoffice_state.get("last_checkpoint_version_id")
    checkpoint_version_id = normalize_version_id(checkpoint_raw) if checkpoint_raw else ""
    if checkpoint_version_id and checkpoint_version_id == version_id:
        current = asset.versions.filter(is_current=True, deleted_at__isnull=True).first()
        if current:
            return current

    version_meta = {}
    if storage and asset.storage_key:
        version_meta = metadata_for_version(storage, asset.storage_key, version_id if version_id != NULL_VERSION_ID else None)
        version_id = normalize_version_id(version_meta.get("version_id") or version_id)

    return set_current_asset_version(
        asset=asset,
        version_id=version_id,
        object_name=asset.storage_key,
        alias=version_alias_for_asset(asset),
        filename=asset.filename or attrs.get("name") or "",
        content_type=version_meta.get("content_type") or attrs.get("type"),
        size=version_meta.get("size") if version_meta else float(asset.size or attrs.get("size") or 0),
        etag=version_meta.get("etag")
        or (asset.storage_metadata.get("ETag") if isinstance(asset.storage_metadata, dict) else None),
        storage_metadata=version_meta.get("storage_metadata") if version_meta else asset.storage_metadata or {},
        created_by_id=asset.created_by_id,
    )


def record_latest_object_version(*, asset: FileAsset, storage, created_by_id=None, alias: Optional[str] = None) -> FileAssetVersion:
    meta = metadata_for_version(storage, asset.storage_key)
    return set_current_asset_version(
        asset=asset,
        version_id=meta["version_id"],
        object_name=asset.storage_key,
        alias=alias or version_alias_for_asset(asset),
        filename=asset.filename,
        content_type=meta.get("content_type"),
        size=meta.get("size"),
        etag=meta.get("etag"),
        storage_metadata=meta.get("storage_metadata") or {},
        created_by_id=created_by_id,
    )


def record_latest_object_checkpoint(*, asset: FileAsset, storage) -> dict:
    """Point the asset at the newest object version without adding history."""
    meta = metadata_for_version(storage, asset.storage_key)
    asset.version_id = meta["version_id"]
    asset.size = float(meta.get("size") or asset.size or 0)
    if isinstance(asset.attributes, dict):
        asset.attributes["size"] = int(asset.size)
    asset.storage_metadata = meta.get("storage_metadata") or asset.storage_metadata or {}
    asset.save(update_fields=["version_id", "size", "storage_metadata", "attributes", "updated_at"])
    return meta


def physical_delete_asset_versions(asset: FileAsset, storage) -> bool:
    object_names = {asset.storage_key} if asset.storage_key else set()
    object_names.update(
        str(item or "").strip()
        for item in asset.versions.filter(deleted_at__isnull=True).values_list(
            "object_name", flat=True
        )
    )
    object_names = {item for item in object_names if item}
    if not object_names:
        return True
    for object_name in object_names:
        ok = storage.delete_all_object_versions(object_name)
        if not ok:
            return False
    now = timezone.now()
    asset.versions.filter(deleted_at__isnull=True).update(deleted_at=now, is_current=False)
    return True


@transaction.atomic
def mark_asset_temporarily_deleted(asset: FileAsset) -> None:
    asset.is_deleted = True
    asset.deleted_at = timezone.now()
    asset.save(update_fields=["is_deleted", "deleted_at"])


@transaction.atomic
def mark_asset_physically_deleted(asset: FileAsset, storage) -> bool:
    ok = physical_delete_asset_versions(asset, storage)
    if not ok:
        return False
    asset.is_deleted = True
    asset.deleted_at = timezone.now()
    asset.save(update_fields=["is_deleted", "deleted_at"])
    return ok


@transaction.atomic
def restore_asset_to_version(*, asset: FileAsset, target_version: FileAssetVersion, storage) -> list[str]:
    versions_to_delete = list(
        asset.versions.filter(
            deleted_at__isnull=True,
            created_at__gt=target_version.created_at,
        ).exclude(pk=target_version.pk)
    )
    for item in versions_to_delete:
        if not _delete_tracked_version(storage, item):
            raise RuntimeError("Failed to delete newer object versions")
    deleted_ids = [str(item.version_id) for item in versions_to_delete]
    now = timezone.now()
    for item in versions_to_delete:
        item.deleted_at = now
        item.is_current = False
        item.save(update_fields=["deleted_at", "is_current"])

    target_object_name = object_name_for_version(target_version)
    if target_object_name and target_object_name != asset.storage_key:
        response = storage.copy_object(
            object_name=target_object_name,
            new_object_name=asset.storage_key,
            source_version_id=storage_version_id(target_version.version_id),
            metadata=build_asset_metadata(asset),
            content_type=target_version.content_type or None,
        )
        if response is None:
            raise RuntimeError("Failed to copy target version")

        if not _delete_tracked_version(storage, target_version):
            raise RuntimeError("Failed to delete restored source version")
        target_version.deleted_at = now
        target_version.is_current = False
        target_version.save(update_fields=["deleted_at", "is_current"])
        deleted_ids.append(str(target_version.version_id))

        record_latest_object_version(
            asset=asset,
            storage=storage,
            created_by_id=target_version.created_by_id,
            alias=target_version.alias or version_alias_for_asset(asset),
        )
        return deleted_ids

    FileAssetVersion.objects.filter(asset=asset, is_current=True, deleted_at__isnull=True).update(is_current=False)
    target_version.is_current = True
    target_version.deleted_at = None
    target_version.save(update_fields=["is_current", "deleted_at"])

    meta = metadata_for_version(
        storage,
        target_object_name or asset.storage_key,
        storage_version_id(target_version.version_id),
    )
    asset.version_id = target_version.version_id
    asset.size = float(target_version.size or meta.get("size") or asset.size or 0)
    if isinstance(asset.attributes, dict):
        asset.attributes["size"] = int(asset.size)
    asset.storage_metadata = meta.get("storage_metadata") or target_version.storage_metadata or asset.storage_metadata
    asset.save(update_fields=["version_id", "size", "attributes", "storage_metadata", "updated_at"])
    return deleted_ids
