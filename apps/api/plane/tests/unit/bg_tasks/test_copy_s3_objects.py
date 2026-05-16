# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
from unittest.mock import MagicMock, patch

import pytest

from plane.bgtasks.copy_s3_object import (
    copy_assets,
    copy_s3_objects_of_description_and_assets,
)
from plane.db.models import FileAsset, Issue, Project, ProjectMember


@pytest.mark.unit
class TestCopyS3Objects:
    """``copy_s3_objects_of_description_and_assets`` 与 ``copy_assets`` 的单测。

    复制流程下，新老 asset 的 MinIO key 都由 ``FileAsset.storage_key`` 派生：
    ``{ws_id}/{project_id}/issues/{issue_id}/{filename}``，
    所以 dedup 后新 asset 的 filename 会带 ``(1)/(2)`` 后缀，对应的 dst key
    也不同于 src，正好满足 copy_object 的语义。
    """

    @pytest.fixture
    def project(self, create_user, workspace):
        project = Project.objects.create(
            name="Test Project",
            identifier="test-project",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user)
        return project

    @pytest.fixture
    def issue(self, workspace, project):
        return Issue.objects.create(
            name="Test Issue",
            workspace=workspace,
            project_id=project.id,
            description_html=(
                '<div>'
                '<image-component src="35e8b958-6ee5-43ce-ae56-fb0e776f421e"></image-component>'
                '<image-component src="97988198-274f-4dfe-aa7a-4c0ffc684214"></image-component>'
                '</div>'
            ),
        )

    @pytest.fixture
    def file_asset(self, workspace, project, issue):
        # save() 钩子按 entity_type=ISSUE_DESCRIPTION + issue_id 自动 resolve path、
        # 从 attributes.name 抽取 filename，所以这里不再手动传 asset/filename。
        return FileAsset.objects.create(
            issue=issue,
            workspace=workspace,
            project=project,
            attributes={
                "name": "test-asset-1.jpg",
                "size": 100,
                "type": "image/jpeg",
            },
            size=100,
            id="35e8b958-6ee5-43ce-ae56-fb0e776f421e",
            entity_type=FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        )

    @pytest.mark.django_db
    @patch("plane.bgtasks.copy_s3_object.S3Storage")
    def test_copy_s3_objects_of_description_and_assets(
        self, mock_s3_storage, create_user, workspace, project, issue, file_asset
    ):
        FileAsset.objects.create(
            issue=issue,
            workspace=workspace,
            project=project,
            attributes={
                "name": "test-asset-2.pdf",
                "size": 100,
                "type": "application/pdf",
            },
            size=100,
            id="97988198-274f-4dfe-aa7a-4c0ffc684214",
            entity_type=FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
        )

        issue.save()

        mock_storage_instance = MagicMock()
        mock_s3_storage.return_value = mock_storage_instance

        with patch("plane.bgtasks.copy_s3_object.sync_with_external_service") as mock_sync:
            mock_sync.return_value = {
                "description": "test description",
                "description_binary": base64.b64encode(b"test binary").decode(),
            }

            copy_s3_objects_of_description_and_assets(
                "ISSUE", issue.id, project.id, "test-workspace", create_user.id
            )

        assert mock_storage_instance.copy_object.call_count == 2

        updated_issue = Issue.objects.get(id=issue.id)
        new_assets = FileAsset.objects.filter(
            issue=updated_issue,
            entity_type="ISSUE_DESCRIPTION",
        )

        assert new_assets.count() == 4  # 2 original + 2 copied

    @pytest.mark.django_db
    @patch("plane.bgtasks.copy_s3_object.S3Storage")
    def test_copy_assets_successful(
        self, mock_s3_storage, workspace, project, issue, file_asset
    ):
        """复制场景下 src key 来自原 asset，dst key 来自新 asset（含 dedup 后缀）。"""
        mock_storage_instance = MagicMock()
        mock_s3_storage.return_value = mock_storage_instance

        result = copy_assets(
            entity=issue,
            entity_identifier=issue.id,
            project_id=project.id,
            asset_ids=[file_asset.id],
            user_id=issue.created_by_id,
        )

        mock_storage_instance.copy_object.assert_called_once()

        src_key, dst_key = mock_storage_instance.copy_object.call_args[0][:2]
        # src 是原 asset 的 storage_key，dst 是新 asset 的 storage_key
        # 二者前缀（path）相同，但 dst 的 filename 会因 dedup 加上 (1) 后缀
        assert src_key == file_asset.storage_key
        assert "test-asset-1.jpg" in src_key
        # 复制到同一 path 下，filename 会变成 test-asset-1(1).jpg
        assert "test-asset-1(1).jpg" in dst_key

        # 复制元数据由 build_asset_metadata 重新生成
        call_kwargs = mock_storage_instance.copy_object.call_args.kwargs
        assert call_kwargs["content_type"] == file_asset.attributes.get("type")
        assert "metadata" in call_kwargs

        assert len(result) == 1
        new_asset_id = result[0]["new_asset_id"]
        new_asset = FileAsset.objects.get(id=new_asset_id)

        assert new_asset.workspace == workspace
        assert new_asset.project_id == project.id
        assert new_asset.entity_type == file_asset.entity_type
        assert new_asset.attributes == file_asset.attributes
        assert new_asset.size == file_asset.size
        assert new_asset.is_uploaded is True
        # storage_key 应当反映 dedup 后的 filename
        assert new_asset.storage_key == dst_key

    @pytest.mark.django_db
    @patch("plane.bgtasks.copy_s3_object.S3Storage")
    def test_copy_assets_empty_asset_ids(self, mock_s3_storage, workspace, project, issue):
        mock_storage_instance = MagicMock()
        mock_s3_storage.return_value = mock_storage_instance

        result = copy_assets(
            entity=issue,
            entity_identifier=issue.id,
            project_id=project.id,
            asset_ids=[],
            user_id=issue.created_by_id,
        )

        assert result == []
        mock_storage_instance.copy_object.assert_not_called()

    @pytest.mark.django_db
    @patch("plane.bgtasks.copy_s3_object.S3Storage")
    def test_copy_assets_nonexistent_asset(self, mock_s3_storage, workspace, project, issue):
        mock_storage_instance = MagicMock()
        mock_s3_storage.return_value = mock_storage_instance
        non_existent_id = "00000000-0000-0000-0000-000000000000"

        result = copy_assets(
            entity=issue,
            entity_identifier=issue.id,
            project_id=project.id,
            asset_ids=[non_existent_id],
            user_id=issue.created_by_id,
        )

        assert result == []
        mock_storage_instance.copy_object.assert_not_called()
