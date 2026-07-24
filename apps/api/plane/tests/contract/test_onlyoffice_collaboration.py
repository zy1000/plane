from __future__ import annotations

import io
from unittest.mock import Mock
from urllib.parse import urlparse

import pytest
from django.urls import reverse

from plane.db.models import (
    FileAsset,
    Project,
    ProjectMember,
    ProjectMemberRole,
    ProjectRole,
    User,
    WorkspaceMember,
)
from plane.utils.folder_ops import ensure_filestore_root
from plane.utils.onlyoffice_sessions import get_doc_session, get_onlyoffice_state


@pytest.mark.contract
@pytest.mark.django_db
class TestOnlyOfficeCollaboration:
    @pytest.fixture(autouse=True)
    def onlyoffice_settings(self, settings):
        settings.ONLYOFFICE_API_BASE_URL = "http://testserver"
        settings.ONLYOFFICE_DOCUMENT_SERVER_URL = "http://document-server"
        settings.ONLYOFFICE_JWT_ENABLED = False

    @pytest.fixture
    def project(self, create_user, workspace):
        project = Project.objects.create(
            name="OnlyOffice",
            identifier="onlyoffice",
            workspace=workspace,
            created_by=create_user,
            project_lead=create_user,
        )
        ProjectMember.objects.create(
            project=project,
            member=create_user,
            role=20,
        )
        return project

    @pytest.fixture
    def asset(self, create_user, project):
        root = ensure_filestore_root(
            workspace_id=str(project.workspace_id),
            project_id=str(project.id),
        )
        return FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            filename="shared.docx",
            attributes={
                "name": "shared.docx",
                "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "size": 4,
                "content_sha256": "same-content",
            },
            size=4,
            is_uploaded=True,
            version_id="version-1",
            path=root,
        )

    def _config_url(self, project, asset):
        return reverse(
            "project-filestore-asset-onlyoffice-config",
            kwargs={
                "slug": project.workspace.slug,
                "project_id": project.id,
                "pk": asset.id,
            },
        )

    def test_editors_receive_the_same_document_key(
        self,
        api_client,
        create_user,
        project,
        asset,
    ):
        api_client.force_authenticate(create_user)
        first = api_client.get(self._config_url(project, asset))
        assert first.status_code == 200

        teammate = User.objects.create(
            email="onlyoffice-teammate@plane.so",
            username="onlyoffice-teammate",
            first_name="OnlyOffice",
            last_name="Teammate",
        )
        WorkspaceMember.objects.create(
            workspace=project.workspace,
            member=teammate,
            role=20,
        )
        teammate_project_member = ProjectMember.objects.create(
            project=project,
            member=teammate,
            role=20,
        )
        teammate_role = ProjectRole.objects.create(
            project=project,
            name="OnlyOffice editor",
            permissions={
                "permission_keys": [
                    "project.asset.view",
                    "project.asset.edit",
                    "project.asset.download",
                ]
            },
        )
        ProjectMemberRole.objects.create(
            project=project,
            member=teammate_project_member,
            role=teammate_role,
        )
        api_client.force_authenticate(teammate)
        second = api_client.get(self._config_url(project, asset))
        assert second.status_code == 200

        first_key = first.data["config"]["document"]["key"]
        second_key = second.data["config"]["document"]["key"]
        assert first_key == second_key

        asset.refresh_from_db()
        state = get_onlyoffice_state(asset.attributes)
        session = get_doc_session(state, first_key)
        assert state["active_session_key"] == first_key
        assert set(session["editors"]) == {str(create_user.id), str(teammate.id)}

    def test_force_save_is_confirmed_by_its_matching_callback(
        self,
        api_client,
        create_user,
        project,
        asset,
        monkeypatch,
    ):
        api_client.force_authenticate(create_user)
        config_response = api_client.get(self._config_url(project, asset))
        assert config_response.status_code == 200
        config = config_response.data["config"]
        doc_key = config["document"]["key"]
        callback_path = urlparse(config["editorConfig"]["callbackUrl"]).path
        callback_query = urlparse(config["editorConfig"]["callbackUrl"]).query
        callback_url = f"{callback_path}?{callback_query}"

        command_response = Mock()
        command_response.status_code = 200
        command_response.ok = True
        command_response.json.return_value = {"error": 0}
        monkeypatch.setattr(
            "plane.app.views.asset.file.requests.post",
            Mock(return_value=command_response),
        )
        monkeypatch.setattr(
            "plane.app.views.asset.file.ensure_uploads_bucket_versioning",
            lambda storage: True,
        )
        monkeypatch.setattr(
            "plane.app.views.asset.file._download_onlyoffice_file",
            lambda file_url: {
                "file_obj": io.BytesIO(b"changed"),
                "sha256": "changed-content",
                "content_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "size": 7,
            },
        )
        upload_file = Mock(return_value=True)
        monkeypatch.setattr(
            "plane.settings.storage.S3Storage.upload_file",
            upload_file,
        )
        monkeypatch.setattr(
            "plane.settings.storage.S3Storage.get_object_metadata",
            lambda storage, object_name, version_id=None: {
                "VersionId": "checkpoint-1",
                "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "ContentLength": 7,
                "ETag": "changed-etag",
                "Metadata": {},
            },
        )

        force_save_url = reverse(
            "project-filestore-asset-onlyoffice-forcesave",
            kwargs={
                "slug": project.workspace.slug,
                "project_id": project.id,
                "pk": asset.id,
            },
        )
        force_save = api_client.post(
            force_save_url,
            {"doc_key": doc_key},
            format="json",
        )
        assert force_save.status_code == 200
        assert force_save.data["status"] == "accepted"
        save_request_id = force_save.data["save_request_id"]

        callback = api_client.post(
            callback_url,
            {
                "key": doc_key,
                "status": 6,
                "url": "http://document-server/cache/shared.docx",
                "userdata": save_request_id,
                "users": [str(create_user.id)],
            },
            format="json",
        )
        assert callback.status_code == 200
        assert callback.data == {"error": 0}

        status_url = reverse(
            "project-filestore-asset-onlyoffice-status",
            kwargs={
                "slug": project.workspace.slug,
                "project_id": project.id,
                "pk": asset.id,
            },
        )
        saved = api_client.get(
            status_url,
            {
                "doc_key": doc_key,
                "save_request_id": save_request_id,
            },
        )
        assert saved.status_code == 200
        assert saved.data["session"]["is_active"] is True
        assert saved.data["session"]["save_request"]["status"] == "saved"
        upload_file.assert_called_once()
        asset.refresh_from_db()
        assert asset.version_id == "checkpoint-1"
        assert asset.attributes["content_sha256"] == "changed-content"

        final_callback = api_client.post(
            callback_url,
            {
                "key": doc_key,
                "status": 2,
                "url": "http://document-server/cache/shared.docx",
                "users": [str(create_user.id)],
            },
            format="json",
        )
        assert final_callback.status_code == 200
        assert final_callback.data == {"error": 0}

        asset.refresh_from_db()
        closed_state = get_onlyoffice_state(asset.attributes)
        assert closed_state["active_session_key"] == ""
        assert get_doc_session(closed_state, doc_key)["state"] == "closed"

        next_config = api_client.get(self._config_url(project, asset))
        assert next_config.status_code == 200
        assert next_config.data["config"]["document"]["key"] != doc_key

        upload_url = reverse(
            "project-filestore-asset-version-upload",
            kwargs={
                "slug": project.workspace.slug,
                "project_id": project.id,
                "pk": asset.id,
            },
        )
        conflict = api_client.post(
            upload_url,
            {"type": "application/octet-stream", "size": 4},
            format="json",
        )
        assert conflict.status_code == 409

        rename_url = reverse(
            "project-filestore-explorer-rename-asset",
            kwargs={
                "slug": project.workspace.slug,
                "project_id": project.id,
                "asset_id": asset.id,
            },
        )
        rename_conflict = api_client.patch(
            rename_url,
            {"name": "renamed.docx"},
            format="json",
        )
        assert rename_conflict.status_code == 409
