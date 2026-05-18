from __future__ import annotations

import io
import zipfile

import pytest

from plane.db.models import FileAsset, Project, User
from plane.utils.folder_ops import ensure_filestore_root


@pytest.mark.contract
class TestFilestoreExplorerAPI:
    @pytest.fixture
    def project(self, create_user, workspace):
        return Project.objects.create(
            name="Explorer Project",
            identifier="explorer",
            workspace=workspace,
            created_by=create_user,
        )

    @pytest.fixture
    def root_folder(self, project):
        return ensure_filestore_root(
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )

    @pytest.fixture
    def mock_storage(self, monkeypatch):
        monkeypatch.setattr(
            "plane.settings.storage.S3Storage.copy_object",
            lambda self, object_name, new_object_name, metadata=None, content_type=None: {"ok": True},
        )
        monkeypatch.setattr(
            "plane.settings.storage.S3Storage.delete_files",
            lambda self, object_names: None,
        )
        monkeypatch.setattr(
            "plane.settings.storage.S3Storage.get_object",
            lambda self, object_name: {"Body": io.BytesIO(f"data:{object_name}".encode("utf-8"))},
        )

    @pytest.mark.django_db
    def test_full_flow_list_copy_move_and_download(
        self,
        session_client,
        create_user,
        project,
        root_folder,
        mock_storage,
    ):
        base = f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/filestore/explorer"

        ensure_resp = session_client.post(f"{base}/ensure-root/")
        assert ensure_resp.status_code == 200
        assert ensure_resp.data["root_folder"]["id"] == root_folder.id
        assert ensure_resp.data["root_folder"]["entity_type"] == "FILESTORE_ROOT"

        create_folder_resp = session_client.post(
            f"{base}/folder/",
            {"parent_folder_id": root_folder.id, "name": "docs"},
            format="json",
        )
        assert create_folder_resp.status_code == 201
        docs_folder_id = create_folder_resp.data["folder"]["id"]

        list_resp = session_client.get(f"{base}/list/", {"folder_id": root_folder.id})
        assert list_resp.status_code == 200
        assert any(folder["id"] == docs_folder_id for folder in list_resp.data["folders"])

        docs_folder = create_folder_resp.data["folder"]
        source_asset = FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            path_id=docs_folder["id"],
            filename="report.txt",
            attributes={"name": "report.txt", "type": "text/plain", "size": 12},
            size=12,
            is_uploaded=True,
        )

        copy_resp = session_client.post(
            f"{base}/batch-copy/",
            {"asset_ids": [str(source_asset.id)], "target_folder_id": root_folder.id},
            format="json",
        )
        assert copy_resp.status_code == 200
        assert len(copy_resp.data["copied_ids"]) == 1

        move_resp = session_client.post(
            f"{base}/batch-move/",
            {"asset_ids": [str(source_asset.id)], "target_folder_id": root_folder.id, "on_conflict": "rename"},
            format="json",
        )
        assert move_resp.status_code == 200
        assert str(source_asset.id) in move_resp.data["moved_ids"]

        source_asset.refresh_from_db()
        assert source_asset.path_id == root_folder.id
        assert source_asset.filename == "report (1).txt"

        download_resp = session_client.get(f"{base}/batch-download/", {"folder_ids": str(root_folder.id)})
        assert download_resp.status_code == 200
        assert download_resp["Content-Type"] == "application/zip"

        zipped = b"".join(download_resp.streaming_content)
        with zipfile.ZipFile(io.BytesIO(zipped), "r") as archive:
            names = set(archive.namelist())
        assert "report.txt" in names
        assert "report (1).txt" in names

    @pytest.mark.django_db
    def test_permission_boundary_returns_403(self, session_client, project, root_folder):
        outsider = User.objects.create(email="outsider@plane.so")
        session_client.force_authenticate(user=outsider)

        url = f"/api/workspaces/{project.workspace.slug}/projects/{project.id}/filestore/explorer/ensure-root/"
        response = session_client.post(url)
        assert response.status_code == 403
