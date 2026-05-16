# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""utils.asset_path / utils.file_path 的纯函数单测。

覆盖三类逻辑：

1. ``CATEGORY_SLUG_MAP`` / ``ENTITY_TO_CATEGORY`` 的一致性与 URL 安全性；
2. ``_sanitize_filename`` 对路径分隔符与控制字符的清洗；
3. ``compute_storage_key_for_path`` 对各种 FilePath 链 + filename 的拼接结果；
4. ``dedup_filename`` 的同 path 重名 ``(1)/(2)`` 后缀策略。
"""

from __future__ import annotations

import re

import pytest

from plane.db.models.asset import FileAsset, FilePath
from plane.utils.asset_path import (
    CATEGORY_SLUG_MAP,
    ENTITY_TO_CATEGORY,
    _sanitize_filename,
    category_display_name_for,
    category_slug_for,
    is_temp_asset,
    scope_kwargs_from_identifier,
)
from plane.utils.file_path import (
    compute_storage_key_for_path,
    dedup_filename,
)


WS = "ws_uuid"
PROJ = "proj_uuid"
ISSUE = "issue_uuid"


# ---------------------------------------------------------------------------
# 元数据映射的一致性
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestCategoryMappings:
    def test_every_entity_in_map_has_slug(self):
        # ENTITY_TO_CATEGORY 的所有 value 必须能在 CATEGORY_SLUG_MAP 中找到，
        # 防止有人加了新业务类型但忘了在 slug map 注册。
        for entity, cat in ENTITY_TO_CATEGORY.items():
            assert cat in CATEGORY_SLUG_MAP, (
                f"{entity} -> {cat} 未在 CATEGORY_SLUG_MAP 注册"
            )

    def test_category_slugs_are_url_safe(self):
        # _temp 是合法的内部分类，下划线开头是为了与业务 slug 区分
        for cat, (display, slug) in CATEGORY_SLUG_MAP.items():
            assert display, f"{cat} 缺少展示名"
            assert re.fullmatch(r"[_a-z][_a-z0-9\-]*", slug), (
                f"{cat} slug 非 url-safe: {slug!r}"
            )

    def test_category_slug_for_known(self):
        assert category_slug_for("ISSUE_ATTACHMENT") == "issues"
        assert category_slug_for("PAGE_DESCRIPTION") == "pages"
        assert category_slug_for("PLAN_CASE_RECORD_FILE") == "plan-case-records"

    def test_category_slug_for_unknown(self):
        # 没有分类层（直接挂在父节点下）的 entity_type
        assert category_slug_for("WORKSPACE_LOGO") is None
        assert category_slug_for("UNKNOWN") is None

    def test_category_display_name_lookup(self):
        assert category_display_name_for("ISSUE_ATTACHMENT") == "工作项"
        assert category_display_name_for("UNKNOWN") is None


# ---------------------------------------------------------------------------
# filename 清洗
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSanitizeFilename:
    def test_strips_path_separators(self):
        assert _sanitize_filename("../etc/passwd") == "passwd"
        assert _sanitize_filename("a\\b\\c.txt") == "c.txt"

    def test_strips_control_chars(self):
        assert _sanitize_filename("hello\x00world.txt") == "hello_world.txt"

    def test_empty_falls_back(self):
        assert _sanitize_filename("") == "file"
        assert _sanitize_filename(".") == "file"

    def test_preserves_unicode(self):
        # 中文文件名是合法的，不应被清洗掉
        assert _sanitize_filename("中文文件.txt") == "中文文件.txt"

    def test_truncates_long_filenames(self):
        long_name = "a" * 300 + ".txt"
        out = _sanitize_filename(long_name)
        assert out.endswith(".txt")
        assert len(out) <= 200


# ---------------------------------------------------------------------------
# compute_storage_key_for_path（不需要落库的纯拼接）
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestComputeStorageKey:
    def _build_chain(self, *nodes):
        """用纯内存对象模拟 FilePath 链；compute_storage_key_for_path 仅读节点属性。"""

        class _Node:
            def __init__(self, entity_type, entity_id, parent=None):
                self.entity_type = entity_type
                self.entity_id = entity_id
                self.parent = parent

        leaf = None
        for et, eid in nodes:
            leaf = _Node(et, eid, parent=leaf)
        return leaf

    def test_workspace_logo_no_filename_returns_empty(self):
        ws_leaf = self._build_chain(("WORKSPACE", WS))
        assert compute_storage_key_for_path(ws_leaf, "") == ""

    def test_workspace_only(self):
        ws_leaf = self._build_chain(("WORKSPACE", WS))
        assert compute_storage_key_for_path(ws_leaf, "logo.png") == f"{WS}/logo.png"

    def test_project_direct_resource(self):
        # PROJECT_FILESTORE / PROJECT_COVER：直接挂在 project 下，无分类层
        leaf = self._build_chain(("WORKSPACE", WS), ("PROJECT", PROJ))
        assert compute_storage_key_for_path(leaf, "data.csv") == f"{WS}/{PROJ}/data.csv"

    def test_issue_attachment_with_category(self):
        leaf = self._build_chain(
            ("WORKSPACE", WS),
            ("PROJECT", PROJ),
            ("ISSUES_CATEGORY", None),
            ("ISSUE", ISSUE),
        )
        assert compute_storage_key_for_path(leaf, "a.png") == (
            f"{WS}/{PROJ}/issues/{ISSUE}/a.png"
        )

    def test_temp_chain(self):
        leaf = self._build_chain(
            ("WORKSPACE", WS),
            ("PROJECT", PROJ),
            ("TEMP_CATEGORY", None),
            ("TEMP", "asset_abc"),
        )
        assert compute_storage_key_for_path(leaf, "tmp.bin") == (
            f"{WS}/{PROJ}/_temp/asset_abc/tmp.bin"
        )

    def test_user_chain(self):
        # USER_ROOT 是固定 slug "user"
        leaf = self._build_chain(
            ("USER_ROOT", None),
            ("USER", "user_xyz"),
        )
        assert compute_storage_key_for_path(leaf, "avatar.jpg") == (
            "user/user_xyz/avatar.jpg"
        )


# ---------------------------------------------------------------------------
# dedup_filename（需要走 DB，加 (1)(2) 后缀）
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestDedupFilename:
    @pytest.fixture
    def workspace_path(self, workspace):
        # 借用 FilePath WORKSPACE 根节点作为承载点，避免额外建分类节点
        return FilePath.objects.create(
            name=workspace.name or "ws",
            entity_type="WORKSPACE",
            entity_id=str(workspace.id),
        )

    @pytest.mark.django_db
    def test_no_collision_returns_original(self, workspace_path):
        assert dedup_filename(workspace_path.pk, "report.pdf") == "report.pdf"

    @pytest.mark.django_db
    def test_collision_appends_counter(self, workspace, workspace_path):
        FileAsset.objects.create(
            workspace=workspace,
            path=workspace_path,
            filename="report.pdf",
            size=10,
            entity_type=FileAsset.EntityTypeContext.WORKSPACE_LOGO,
        )
        assert dedup_filename(workspace_path.pk, "report.pdf") == "report(1).pdf"

    @pytest.mark.django_db
    def test_multiple_collisions(self, workspace, workspace_path):
        for fname in ["a.txt", "a(1).txt", "a(2).txt"]:
            FileAsset.objects.create(
                workspace=workspace,
                path=workspace_path,
                filename=fname,
                size=10,
                entity_type=FileAsset.EntityTypeContext.WORKSPACE_LOGO,
            )
        assert dedup_filename(workspace_path.pk, "a.txt") == "a(3).txt"

    @pytest.mark.django_db
    def test_deleted_assets_dont_block(self, workspace, workspace_path):
        FileAsset.objects.create(
            workspace=workspace,
            path=workspace_path,
            filename="x.png",
            size=1,
            entity_type=FileAsset.EntityTypeContext.WORKSPACE_LOGO,
            is_deleted=True,
        )
        # 已删除的同名 asset 不应阻塞新文件复用同 filename
        assert dedup_filename(workspace_path.pk, "x.png") == "x.png"

    @pytest.mark.django_db
    def test_exclude_asset_id(self, workspace, workspace_path):
        asset = FileAsset.objects.create(
            workspace=workspace,
            path=workspace_path,
            filename="self.zip",
            size=1,
            entity_type=FileAsset.EntityTypeContext.WORKSPACE_LOGO,
        )
        # 更新自己时不应把自己算作冲突
        assert dedup_filename(
            workspace_path.pk, "self.zip", exclude_asset_id=asset.pk
        ) == "self.zip"

    @pytest.mark.django_db
    def test_extra_taken_within_batch(self, workspace_path):
        # 当前批次内已分配但还没落库的 filename 也要参与去重
        assert dedup_filename(
            workspace_path.pk, "batch.txt", extra_taken={"batch.txt"}
        ) == "batch(1).txt"


# ---------------------------------------------------------------------------
# scope_kwargs_from_identifier
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestScopeKwargsFromIdentifier:
    def test_known_entity_returns_scope_kwarg(self):
        assert scope_kwargs_from_identifier("ISSUE_ATTACHMENT", "iid") == {"issue_id": "iid"}
        assert scope_kwargs_from_identifier("PAGE_DESCRIPTION", "pid") == {"page_id": "pid"}
        assert scope_kwargs_from_identifier("CASE_ATTACHMENT", "cid") == {"case_id": "cid"}

    def test_unknown_entity_returns_empty(self):
        assert scope_kwargs_from_identifier("WORKSPACE_LOGO", "x") == {}

    def test_missing_identifier_returns_empty(self):
        assert scope_kwargs_from_identifier("ISSUE_ATTACHMENT", None) == {}


# ---------------------------------------------------------------------------
# is_temp_asset
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestIsTempAsset:
    def test_none_asset(self):
        assert is_temp_asset(None) is False

    def test_no_path(self):
        class A:
            path = None

        assert is_temp_asset(A()) is False

    def test_temp_path(self):
        class P:
            entity_type = "TEMP"

        class A:
            path = P()

        assert is_temp_asset(A()) is True

    def test_normal_path(self):
        class P:
            entity_type = "ISSUE"

        class A:
            path = P()

        assert is_temp_asset(A()) is False
