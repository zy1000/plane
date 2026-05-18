from __future__ import annotations

import pytest

from plane.db.models import FileAsset, Project
from plane.db.models.asset import FilePath
from plane.utils.folder_ops import (
    copy_assets,
    create_user_folder,
    ensure_filestore_root,
    move_assets,
)


class _FakeStorage:
    def copy_object(self, object_name, new_object_name, metadata=None, content_type=None):
        return {"ok": True}

    def delete_files(self, object_names):
        return None


@pytest.mark.unit
class TestFolderOps:
    @pytest.fixture
    def project(self, create_user, workspace):
        return Project.objects.create(
            name="FolderOps",
            identifier="folderops",
            workspace=workspace,
            created_by=create_user,
        )

    @pytest.fixture
    def root(self, project):
        return ensure_filestore_root(
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )

    @pytest.mark.django_db
    def test_ensure_filestore_root_is_idempotent(self, project):
        root_a = ensure_filestore_root(
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )
        root_b = ensure_filestore_root(
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )
        assert root_a.id == root_b.id
        assert root_a.entity_type == FilePath.EntityType.FILESTORE_ROOT

    @pytest.mark.django_db
    def test_copy_assets_appends_space_counter(self, create_user, project, root):
        source = FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            path=root,
            filename="report.txt",
            attributes={"name": "report.txt", "type": "text/plain", "size": 10},
            size=10,
            is_uploaded=True,
        )

        result = copy_assets(
            assets=[source],
            target_folder=root,
            storage=_FakeStorage(),
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
            created_by_id=create_user.id,
        )
        assert len(result["copied_ids"]) == 1

        copied = FileAsset.objects.get(pk=result["copied_ids"][0])
        assert copied.filename == "report (1).txt"
        assert copied.attributes.get("name") == "report (1).txt"

    @pytest.mark.django_db
    def test_move_assets_cancel_conflict_returns_conflicts(self, create_user, project, root):
        source_folder = create_user_folder(
            parent=root,
            name="source",
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )
        target_folder = create_user_folder(
            parent=root,
            name="target",
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )

        source_asset = FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            path=source_folder,
            filename="doc.txt",
            attributes={"name": "doc.txt", "type": "text/plain", "size": 10},
            size=10,
            is_uploaded=True,
        )
        FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            path=target_folder,
            filename="doc.txt",
            attributes={"name": "doc.txt", "type": "text/plain", "size": 10},
            size=10,
            is_uploaded=True,
        )

        result = move_assets(
            assets=[source_asset],
            target_folder=target_folder,
            storage=_FakeStorage(),
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
            on_conflict="cancel",
        )

        assert result["moved_ids"] == []
        assert len(result["conflicts"]) == 1
        source_asset.refresh_from_db()
        assert source_asset.path_id == source_folder.id
