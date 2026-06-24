from __future__ import annotations

import pytest

from plane.db.models import FileAsset, Project
from plane.utils.asset_versions import record_latest_object_version


class _FakeStorage:
    def get_object_metadata(self, object_name, version_id=None):
        return {
            "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "ContentLength": 128,
            "ETag": "edited-etag",
            "VersionId": "edited-version",
            "Metadata": {},
        }


@pytest.mark.unit
class TestAssetVersions:
    @pytest.fixture
    def project(self, create_user, workspace):
        return Project.objects.create(
            name="AssetVersions",
            identifier="assetversions",
            workspace=workspace,
            created_by=create_user,
        )

    @pytest.mark.django_db
    def test_record_latest_object_version_preserves_explicit_created_by_without_request_user(
        self, create_user, project
    ):
        asset = FileAsset.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            filename="edited.docx",
            attributes={
                "name": "edited.docx",
                "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "size": 128,
            },
            size=128,
            is_uploaded=True,
        )

        version = record_latest_object_version(
            asset=asset,
            storage=_FakeStorage(),
            created_by_id=create_user.id,
        )

        version.refresh_from_db()
        assert version.created_by_id == create_user.id
