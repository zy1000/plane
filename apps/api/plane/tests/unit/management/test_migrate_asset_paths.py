# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""migrate_asset_paths --dry-run 单元测试。

测试聚焦于：

1. 老 key（``{ws}/legacy-flat-name.png``）能被命令识别并按 ``FilePath`` 派生出
   新 key（``{ws}/{proj}/{filename}``），并打印 ``old  ->  new`` 计划行；
2. ``--dry-run`` 模式下既不触发 S3 copy/delete，也不修改 DB；
3. 没有匹配的 ``FileAsset`` 时不应产生任何迁移计划行。

由于测试库走 ``--nomigrations`` 直接 sync 当前模型（``FileAsset.asset`` 字段已删），
我们通过 mock ``_legacy_assets_iter`` 来注入历史老 key，而不是走原生 SQL。
"""

from __future__ import annotations

from io import StringIO
from unittest.mock import MagicMock, patch

import pytest
from django.core.management import call_command

from plane.db.models import FileAsset, Project, ProjectMember


@pytest.mark.unit
class TestMigrateAssetPathsDryRun:
    @pytest.fixture
    def project(self, create_user, workspace):
        project = Project.objects.create(
            name="Migrate Project",
            identifier="migrate-proj",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=create_user)
        return project

    @pytest.fixture
    def project_cover_asset(self, workspace, project):
        # 直接走 ORM 建一条 ``PROJECT_COVER`` asset；save() 钩子会自动 resolve
        # path=Workspace->Project，filename 取自 attributes.name。
        return FileAsset.objects.create(
            workspace=workspace,
            project=project,
            entity_type=FileAsset.EntityTypeContext.PROJECT_COVER,
            attributes={
                "name": "legacy-flat-name.png",
                "type": "image/png",
                "size": 42,
            },
            size=42,
            is_uploaded=True,
        )

    @pytest.mark.django_db
    @patch("plane.db.management.commands.migrate_asset_paths._build_s3_client")
    @patch("plane.db.management.commands.migrate_asset_paths._legacy_assets_iter")
    def test_dry_run_reports_diff_without_touching_s3(
        self,
        mock_legacy_iter,
        mock_build_client,
        workspace,
        project,
        project_cover_asset,
    ):
        # 模拟老 key：扁平 ``{ws_id}/legacy-flat-name.png``，无项目层
        old_key = f"{workspace.id}/legacy-flat-name.png"
        mock_legacy_iter.return_value = iter(
            [(str(project_cover_asset.pk), old_key)]
        )

        mock_client = MagicMock()
        mock_build_client.return_value = mock_client

        out = StringIO()
        call_command(
            "migrate_asset_paths",
            "--dry-run",
            "--skip-legacy-file",
            stdout=out,
        )

        log = out.getvalue()
        # dry-run 行：包含老 key 与新 key（PROJECT_COVER 直接挂在 project 下）
        assert "[dry-run]" in log
        assert old_key in log
        # 新 key 由 FilePath 派生：{ws}/{proj}/legacy-flat-name.png，没有 UUID 前缀
        expected_new_key = f"{workspace.id}/{project.id}/legacy-flat-name.png"
        assert expected_new_key in log

        # dry-run 模式下既不调 S3，也不改 path/filename
        mock_client.copy_object.assert_not_called()
        mock_client.delete_object.assert_not_called()

    @pytest.mark.django_db
    @patch("plane.db.management.commands.migrate_asset_paths._build_s3_client")
    @patch("plane.db.management.commands.migrate_asset_paths._legacy_assets_iter")
    def test_dry_run_handles_no_targets(
        self, mock_legacy_iter, mock_build_client
    ):
        mock_legacy_iter.return_value = iter([])
        mock_client = MagicMock()
        mock_build_client.return_value = mock_client

        out = StringIO()
        call_command(
            "migrate_asset_paths",
            "--dry-run",
            "--skip-legacy-file",
            stdout=out,
        )

        log = out.getvalue()
        # 没有任何老记录 → 不应该出现 `->` 计划行
        assert "->" not in log
        mock_client.copy_object.assert_not_called()

    @pytest.mark.django_db
    @patch("plane.db.management.commands.migrate_asset_paths._build_s3_client")
    @patch("plane.db.management.commands.migrate_asset_paths._legacy_assets_iter")
    def test_dry_run_skips_when_keys_already_match(
        self,
        mock_legacy_iter,
        mock_build_client,
        workspace,
        project,
        project_cover_asset,
    ):
        # 已经在新位置上的 asset：老 key == 新 key，应当被 `skipped_same` 计入而不
        # 是产生 dry-run 行
        already_new_key = project_cover_asset.storage_key
        assert already_new_key  # save() 钩子已 resolve 出新 key

        mock_legacy_iter.return_value = iter(
            [(str(project_cover_asset.pk), already_new_key)]
        )

        mock_client = MagicMock()
        mock_build_client.return_value = mock_client

        out = StringIO()
        call_command(
            "migrate_asset_paths",
            "--dry-run",
            "--skip-legacy-file",
            stdout=out,
        )

        log = out.getvalue()
        assert "->" not in log  # 没有计划行
        assert "skipped_same" in log
        mock_client.copy_object.assert_not_called()
