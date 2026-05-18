from __future__ import annotations

import os
from typing import Iterable, Optional
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.utils import timezone

from plane.db.models import FileAsset, Project, Workspace
from plane.db.models.asset import FilePath
from plane.utils.asset_path import _sanitize_filename
from plane.utils.asset_upload import build_asset_metadata
from plane.utils.file_path import compute_storage_key_for_path


FILESTORE_ENTITY_TYPE = FileAsset.EntityTypeContext.PROJECT_FILESTORE
FILESTORE_ROOT_ENTITY_TYPE = FilePath.EntityType.FILESTORE_ROOT
USER_FOLDER_ENTITY_TYPE = FilePath.EntityType.USER_FOLDER
PROJECT_ENTITY_TYPE = FilePath.EntityType.PROJECT
WORKSPACE_ENTITY_TYPE = FilePath.EntityType.WORKSPACE
FILESTORE_ROOT_NAME = "filestore"


def _sanitize_folder_name(name: str) -> str:
    raw = str(name or "").strip()
    if not raw:
        raise ValueError("Folder name is required")
    cleaned = _sanitize_filename(raw).strip()
    if not cleaned:
        raise ValueError("Folder name is invalid")
    return cleaned


def _get_or_create_path_node(
    *,
    parent: Optional[FilePath],
    entity_type: str,
    entity_id: Optional[str],
    name: str,
) -> FilePath:
    lookup = {
        "parent": parent,
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id is not None else None,
    }
    node = FilePath.objects.filter(**lookup).first()
    if node is None:
        try:
            with transaction.atomic():
                node = FilePath.objects.create(name=name, **lookup)
        except IntegrityError:
            node = FilePath.objects.filter(**lookup).first()
            if node is None:
                raise

    if node.name != name and name:
        node.name = name
        node.save(update_fields=["name"])
    return node


def _workspace_and_project_nodes(workspace_id: str, project_id: str) -> tuple[FilePath, FilePath]:
    workspace = Workspace.objects.only("id", "name").get(id=workspace_id)
    project = Project.objects.only("id", "name").get(id=project_id, workspace_id=workspace_id)

    workspace_node = _get_or_create_path_node(
        parent=None,
        entity_type=WORKSPACE_ENTITY_TYPE,
        entity_id=str(workspace.id),
        name=workspace.name or str(workspace.id),
    )
    project_node = _get_or_create_path_node(
        parent=workspace_node,
        entity_type=PROJECT_ENTITY_TYPE,
        entity_id=str(project.id),
        name=project.name or str(project.id),
    )
    return workspace_node, project_node


def ensure_filestore_root(workspace_id: str, project_id: str) -> FilePath:
    _, project_node = _workspace_and_project_nodes(
        workspace_id=str(workspace_id), project_id=str(project_id)
    )
    return _get_or_create_path_node(
        parent=project_node,
        entity_type=FILESTORE_ROOT_ENTITY_TYPE,
        entity_id=str(project_id),
        name=FILESTORE_ROOT_NAME,
    )


def get_filestore_root_for_folder(folder: FilePath) -> Optional[FilePath]:
    node = folder
    while node is not None:
        if node.entity_type == FILESTORE_ROOT_ENTITY_TYPE:
            return node
        node = node.parent
    return None


def is_folder_in_filestore_scope(folder: FilePath, workspace_id: str, project_id: str) -> bool:
    root = get_filestore_root_for_folder(folder)
    if root is None:
        return False
    if str(root.entity_id or "") != str(project_id):
        return False
    project_node = root.parent
    if project_node is None:
        return False
    if project_node.entity_type != PROJECT_ENTITY_TYPE:
        return False
    if str(project_node.entity_id or "") != str(project_id):
        return False
    workspace_node = project_node.parent
    if workspace_node is None:
        return False
    return (
        workspace_node.entity_type == WORKSPACE_ENTITY_TYPE
        and str(workspace_node.entity_id or "") == str(workspace_id)
    )


def _assert_filestore_scope(folder: FilePath, workspace_id: str, project_id: str) -> None:
    if not is_folder_in_filestore_scope(folder, workspace_id=workspace_id, project_id=project_id):
        raise ValueError("Folder is out of filestore scope")


def _dedup_folder_name(parent: FilePath, requested_name: str, *, exclude_folder_id=None) -> str:
    candidate = requested_name
    existing = set(
        FilePath.objects.filter(parent=parent, entity_type=USER_FOLDER_ENTITY_TYPE)
        .exclude(pk=exclude_folder_id)
        .values_list("name", flat=True)
    )
    if candidate not in existing:
        return candidate

    counter = 1
    while True:
        candidate = f"{requested_name} ({counter})"
        if candidate not in existing:
            return candidate
        counter += 1


def create_user_folder(*, parent: FilePath, name: str, workspace_id: str, project_id: str) -> FilePath:
    _assert_filestore_scope(parent, workspace_id=workspace_id, project_id=project_id)
    if parent.entity_type not in {FILESTORE_ROOT_ENTITY_TYPE, USER_FOLDER_ENTITY_TYPE}:
        raise ValueError("Parent folder type is not allowed")

    folder_name = _sanitize_folder_name(name)
    if FilePath.objects.filter(
        parent=parent,
        entity_type=USER_FOLDER_ENTITY_TYPE,
        name=folder_name,
    ).exists():
        raise ValueError("Folder already exists")

    return FilePath.objects.create(
        parent=parent,
        entity_type=USER_FOLDER_ENTITY_TYPE,
        entity_id=uuid4().hex,
        name=folder_name,
    )


def _iter_filestore_assets_in_subtree(
    folder: FilePath,
    *,
    workspace_id: str,
    project_id: str,
    include_deleted: bool = False,
):
    node_ids = list(folder.get_descendants(include_self=True).values_list("id", flat=True))
    qs = FileAsset.objects.filter(
        path_id__in=node_ids,
        workspace_id=workspace_id,
        project_id=project_id,
        entity_type=FILESTORE_ENTITY_TYPE,
    ).select_related("path")
    if not include_deleted:
        qs = qs.filter(is_deleted=False)
    return qs


def _build_renamed_key_for_asset(asset: FileAsset, folder_id: int, new_name: str) -> str:
    chain = []
    node = asset.path
    while node is not None:
        chain.append(node)
        node = node.parent
    chain.reverse()

    segments = []
    for node in chain:
        et = node.entity_type
        if et == FilePath.EntityType.USER_ROOT:
            segment = "user"
        elif et == FILESTORE_ROOT_ENTITY_TYPE:
            segment = FILESTORE_ROOT_NAME
        elif et == USER_FOLDER_ENTITY_TYPE:
            segment = _sanitize_filename(new_name if node.pk == folder_id else node.name or "")
        elif et in {
            FilePath.EntityType.ISSUES_CATEGORY,
            FilePath.EntityType.DRAFTS_CATEGORY,
            FilePath.EntityType.PAGES_CATEGORY,
            FilePath.EntityType.CYCLES_CATEGORY,
            FilePath.EntityType.RELEASES_CATEGORY,
            FilePath.EntityType.CASES_CATEGORY,
            FilePath.EntityType.PLAN_CASE_RECORDS_CATEGORY,
            FilePath.EntityType.TEMP_CATEGORY,
        }:
            from plane.utils.asset_path import CATEGORY_SLUG_MAP

            segment = CATEGORY_SLUG_MAP.get(et, ("", ""))[1]
        else:
            segment = str(node.entity_id or "")

        if segment:
            segments.append(segment)

    segments.append(asset.filename or "file")
    return "/".join(segments)


def rename_user_folder(
    *,
    folder: FilePath,
    new_name: str,
    storage,
    workspace_id: str,
    project_id: str,
) -> FilePath:
    if folder.entity_type != USER_FOLDER_ENTITY_TYPE:
        raise ValueError("Only user folder can be renamed")

    _assert_filestore_scope(folder, workspace_id=workspace_id, project_id=project_id)
    cleaned_name = _sanitize_folder_name(new_name)
    if cleaned_name == folder.name:
        return folder

    parent = folder.parent
    if parent is None:
        raise ValueError("Invalid folder parent")
    if FilePath.objects.filter(
        parent=parent,
        entity_type=USER_FOLDER_ENTITY_TYPE,
        name=cleaned_name,
    ).exclude(pk=folder.pk).exists():
        raise ValueError("Folder name already exists")

    assets = list(
        _iter_filestore_assets_in_subtree(
            folder,
            workspace_id=workspace_id,
            project_id=project_id,
            include_deleted=False,
        ).filter(is_uploaded=True)
    )
    copy_plan = []
    for asset in assets:
        old_key = asset.storage_key
        new_key = _build_renamed_key_for_asset(asset, folder.pk, cleaned_name)
        if old_key and new_key and old_key != new_key:
            copy_plan.append((asset, old_key, new_key))

    for asset, old_key, new_key in copy_plan:
        attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
        content_type = attrs.get("type") or None
        response = storage.copy_object(
            object_name=old_key,
            new_object_name=new_key,
            metadata=build_asset_metadata(asset),
            content_type=content_type,
        )
        if response is None:
            raise RuntimeError(f"Failed to copy object {old_key} -> {new_key}")

    folder.name = cleaned_name
    folder.save(update_fields=["name"])

    if copy_plan:
        storage.delete_files(object_names=[old_key for _, old_key, _ in copy_plan])
    return folder


def delete_user_folder(
    *,
    folder: FilePath,
    storage,
    workspace_id: str,
    project_id: str,
) -> None:
    if folder.entity_type != USER_FOLDER_ENTITY_TYPE:
        raise ValueError("Only user folder can be deleted")
    _assert_filestore_scope(folder, workspace_id=workspace_id, project_id=project_id)

    assets = list(
        _iter_filestore_assets_in_subtree(
            folder,
            workspace_id=workspace_id,
            project_id=project_id,
            include_deleted=False,
        ).filter(is_uploaded=True)
    )
    object_names = [asset.storage_key for asset in assets if asset.storage_key]
    if object_names:
        storage.delete_files(object_names=object_names)

    folder.delete()


def _dedup_filename_with_space(
    *,
    path_id: int,
    original_name: str,
    exclude_asset_id=None,
    extra_taken: Optional[set] = None,
) -> str:
    name = (original_name or "").strip() or "file"
    qs = FileAsset.objects.filter(path_id=path_id, is_deleted=False)
    if exclude_asset_id is not None:
        qs = qs.exclude(pk=exclude_asset_id)
    existing = set(qs.values_list("filename", flat=True))
    if extra_taken:
        existing |= set(extra_taken)

    if name not in existing:
        return name

    base, ext = os.path.splitext(name)
    counter = 1
    while True:
        candidate = f"{base} ({counter}){ext}"
        if candidate not in existing:
            return candidate
        counter += 1


def move_assets(
    *,
    assets: Iterable[FileAsset],
    target_folder: FilePath,
    storage,
    workspace_id: str,
    project_id: str,
    on_conflict: str = "rename",
) -> dict:
    _assert_filestore_scope(target_folder, workspace_id=workspace_id, project_id=project_id)

    assets = [
        asset
        for asset in assets
        if asset.entity_type == FILESTORE_ENTITY_TYPE
        and not asset.is_deleted
        and str(asset.workspace_id) == str(workspace_id)
        and str(asset.project_id) == str(project_id)
    ]
    if not assets:
        return {"moved_ids": [], "conflicts": []}

    conflicts = []
    if on_conflict == "cancel":
        for asset in assets:
            source_name = asset.filename or _sanitize_filename(
                (asset.attributes or {}).get("name") if isinstance(asset.attributes, dict) else "file"
            )
            exists = FileAsset.objects.filter(
                path=target_folder, filename=source_name, is_deleted=False
            ).exclude(pk=asset.pk).exists()
            if exists:
                conflicts.append({"asset_id": str(asset.id), "filename": source_name})
        if conflicts:
            return {"moved_ids": [], "conflicts": conflicts}

    moved_ids = []
    taken_names: set[str] = set()
    for asset in assets:
        attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
        source_name = asset.filename or _sanitize_filename(attrs.get("name") or "file")
        conflict_asset = (
            FileAsset.objects.filter(path=target_folder, filename=source_name, is_deleted=False)
            .exclude(pk=asset.pk)
            .first()
        )

        if conflict_asset and on_conflict == "overwrite":
            conflict_key = conflict_asset.storage_key
            if conflict_key:
                storage.delete_files(object_names=[conflict_key])
            conflict_asset.is_deleted = True
            conflict_asset.deleted_at = timezone.now()
            conflict_asset.save(update_fields=["is_deleted", "deleted_at"])
            target_filename = source_name
        elif conflict_asset:
            target_filename = _dedup_filename_with_space(
                path_id=target_folder.pk,
                original_name=source_name,
                exclude_asset_id=asset.pk,
                extra_taken=taken_names,
            )
            taken_names.add(target_filename)
        else:
            target_filename = source_name

        if asset.path_id == target_folder.pk and target_filename == asset.filename:
            moved_ids.append(str(asset.id))
            continue

        old_path = asset.path
        old_filename = asset.filename
        old_key = asset.storage_key
        new_key = compute_storage_key_for_path(target_folder, target_filename)
        if not old_key or not new_key:
            continue

        # 先用“目标路径”的 metadata 进行复制，复制成功后再落库。
        asset.path = target_folder
        asset.filename = target_filename
        metadata = build_asset_metadata(asset)
        response = storage.copy_object(
            object_name=old_key,
            new_object_name=new_key,
            metadata=metadata,
            content_type=attrs.get("type") or None,
        )
        asset.path = old_path
        asset.filename = old_filename
        if response is None:
            continue

        asset.path = target_folder
        asset.filename = target_filename
        asset.save(update_fields=["path", "filename"])
        storage.delete_files(object_names=[old_key])
        moved_ids.append(str(asset.id))

    return {"moved_ids": moved_ids, "conflicts": conflicts}


def copy_assets(
    *,
    assets: Iterable[FileAsset],
    target_folder: FilePath,
    storage,
    workspace_id: str,
    project_id: str,
    created_by_id=None,
) -> dict:
    _assert_filestore_scope(target_folder, workspace_id=workspace_id, project_id=project_id)

    assets = [
        asset
        for asset in assets
        if asset.entity_type == FILESTORE_ENTITY_TYPE
        and not asset.is_deleted
        and str(asset.workspace_id) == str(workspace_id)
        and str(asset.project_id) == str(project_id)
    ]
    if not assets:
        return {"copied_ids": []}

    copied_ids = []
    taken_names: set[str] = set()
    for asset in assets:
        attrs = dict(asset.attributes or {})
        source_name = asset.filename or _sanitize_filename(attrs.get("name") or "file")
        new_filename = _dedup_filename_with_space(
            path_id=target_folder.pk,
            original_name=source_name,
            extra_taken=taken_names,
        )
        taken_names.add(new_filename)
        attrs["name"] = new_filename
        attrs["size"] = int(asset.size or attrs.get("size") or 0)

        new_asset = FileAsset.objects.create(
            attributes=attrs,
            size=float(asset.size or 0),
            workspace_id=workspace_id,
            project_id=project_id,
            created_by_id=created_by_id,
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            storage_metadata=asset.storage_metadata or {},
            path=target_folder,
            filename=new_filename,
        )

        content_type = attrs.get("type") if isinstance(attrs, dict) else None
        response = storage.copy_object(
            object_name=asset.storage_key,
            new_object_name=new_asset.storage_key,
            metadata=build_asset_metadata(new_asset),
            content_type=content_type or None,
        )
        if response is None:
            new_asset.delete()
            continue

        copied_ids.append(str(new_asset.id))

    return {"copied_ids": copied_ids}
