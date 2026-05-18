# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""文件路径相关的轻量常量与文件名清洗。

完整的 MinIO 对象 key 现在统一由
:func:`plane.utils.file_path.compute_storage_key` 从 ``FileAsset.path`` 节点链
+ ``FileAsset.filename`` 派生，不再走一份独立的字符串拼接逻辑。本模块只保留
三件事：

1. ``CATEGORY_SLUG_MAP`` / ``ENTITY_TO_CATEGORY``：分类节点的展示名 + 英文 slug
   单一事实源，被 ``_Resolver``（构造 FilePath 节点）与 ``compute_storage_key``
   （计算 minio 段位）共同消费；
2. ``_sanitize_filename`` / ``ENTITY_IDENTIFIER_FIELD`` 等工具函数；
3. 与 FileAsset 体系无关的两条特殊 key 构造器（OnlyOffice 版本快照、工作项导出 ZIP）。
"""

from __future__ import annotations

import os
import re
import time
from typing import Optional, Tuple

# 文件名最大长度限制：去除危险字符后，截断到合理长度
_FILENAME_MAX_LEN = 200

_INVALID_FILENAME_CHARS = re.compile(r"[\x00-\x1f/\\]")


# ---------------------------------------------------------------------------
# 分类节点 ↔ slug 单一事实源
# ---------------------------------------------------------------------------
#
# - 第一项：FilePath 节点的中文展示名（写入 FilePath.name）
# - 第二项：MinIO key 中对应的英文 slug（用于 minio 路径段）
#
# 该映射由 file_path.py 的 _Resolver、compute_storage_key、
# migrate_asset_paths 管理命令共同消费，保证三处一致。
CATEGORY_SLUG_MAP: dict[str, Tuple[str, str]] = {
    "ISSUES_CATEGORY":            ("工作项",   "issues"),
    "DRAFTS_CATEGORY":            ("草稿",     "drafts"),
    "PAGES_CATEGORY":             ("页面",     "pages"),
    "CYCLES_CATEGORY":            ("迭代",     "cycles"),
    "RELEASES_CATEGORY":          ("发布",     "releases"),
    "CASES_CATEGORY":             ("测试用例", "cases"),
    "PLAN_CASE_RECORDS_CATEGORY": ("用例执行", "plan-case-records"),
    # 临时分类：业务实体未就绪时 FileAsset 先落入 ``_temp`` 子目录。
    # 用下划线前缀以与正式业务 slug 区分开。
    "TEMP_CATEGORY":              ("_temp",   "_temp"),
}

# FileAsset.entity_type → 该业务在 FilePath 树里所属的分类节点。
# 不在此表里的 entity_type（USER_AVATAR / WORKSPACE_LOGO / PROJECT_COVER /
# PROJECT_DESCRIPTION / CASE_MINDMAP）按用户决策**不加分类层**，直接挂在父节点下。
# 其中 PROJECT_FILESTORE 虽然也不走分类层，但会固定挂到 FILESTORE_ROOT 节点下。
ENTITY_TO_CATEGORY: dict[str, str] = {
    "ISSUE_ATTACHMENT":         "ISSUES_CATEGORY",
    "ISSUE_DESCRIPTION":        "ISSUES_CATEGORY",
    "COMMENT_DESCRIPTION":      "ISSUES_CATEGORY",
    "DRAFT_ISSUE_ATTACHMENT":   "DRAFTS_CATEGORY",
    "DRAFT_ISSUE_DESCRIPTION":  "DRAFTS_CATEGORY",
    "PAGE_DESCRIPTION":         "PAGES_CATEGORY",
    "CYCLE_FILE":               "CYCLES_CATEGORY",
    "RELEASE_FILE":             "RELEASES_CATEGORY",
    "CASE_ATTACHMENT":          "CASES_CATEGORY",
    "PLAN_CASE_RECORD_FILE":    "PLAN_CASE_RECORDS_CATEGORY",
}


def category_slug_for(entity_type: str) -> Optional[str]:
    """返回 FileAsset.entity_type 对应的 MinIO 路径 slug；无分类则返回 None。"""
    cat = ENTITY_TO_CATEGORY.get(entity_type)
    if not cat:
        return None
    return CATEGORY_SLUG_MAP[cat][1]


def category_display_name_for(entity_type: str) -> Optional[str]:
    """返回 FileAsset.entity_type 对应的中文分类节点展示名；无分类则返回 None。"""
    cat = ENTITY_TO_CATEGORY.get(entity_type)
    if not cat:
        return None
    return CATEGORY_SLUG_MAP[cat][0]


def _sanitize_filename(filename: str) -> str:
    """去除文件名中的路径分隔符与控制字符，保留扩展名。"""

    if not filename:
        return "file"
    name = os.path.basename(filename)
    name = _INVALID_FILENAME_CHARS.sub("_", name)
    name = name.strip().lstrip(".") or "file"
    if len(name) > _FILENAME_MAX_LEN:
        base, ext = os.path.splitext(name)
        keep = _FILENAME_MAX_LEN - len(ext)
        name = (base[:keep] if keep > 0 else base[:_FILENAME_MAX_LEN]) + ext
    return name


# ---------------------------------------------------------------------------
# temp 路径判定
# ---------------------------------------------------------------------------


def is_temp_asset(asset) -> bool:
    """判断给定 FileAsset 是否仍挂在 ``_temp`` 临时节点下。

    取代历史的 ``is_temp_key(asset_key_str)``：现在 MinIO key 由 path 派生，
    最稳的判定是看 ``asset.path.entity_type``，避免做字符串切分。
    """
    if asset is None:
        return False
    path = getattr(asset, "path", None)
    if path is None:
        return False
    et = getattr(path, "entity_type", "") or ""
    return et == "TEMP"


# ---------------------------------------------------------------------------
# entity_identifier 映射
# ---------------------------------------------------------------------------

# 一般场景下 entity_type 与 build_asset_key 关键字参数的对应关系。
# 用于把上传接口里通用的 ``entity_identifier`` 字段透传到正确的 scope 参数。
ENTITY_IDENTIFIER_FIELD = {
    "ISSUE_ATTACHMENT": "issue_id",
    "ISSUE_DESCRIPTION": "issue_id",
    "DRAFT_ISSUE_ATTACHMENT": "draft_issue_id",
    "DRAFT_ISSUE_DESCRIPTION": "draft_issue_id",
    "COMMENT_DESCRIPTION": "comment_id",
    "PAGE_DESCRIPTION": "page_id",
    "CASE_ATTACHMENT": "case_id",
}


def scope_kwargs_from_identifier(
    entity_type: str, entity_identifier: Optional[str]
) -> dict:
    """根据 entity_type 把 entity_identifier 转为创建 FileAsset 时的 FK 关键字。"""

    field = ENTITY_IDENTIFIER_FIELD.get(entity_type)
    if not field or not entity_identifier:
        return {}
    return {field: str(entity_identifier)}


# ---------------------------------------------------------------------------
# 特殊场景（不走 FileAsset/FilePath 体系，仍保留独立 key 构造）
# ---------------------------------------------------------------------------


def build_filestore_version_key(
    workspace_id: str, project_id: str, asset_id: str, filename: str
) -> str:
    """OnlyOffice 版本快照路径（保留独立分支：版本快照不走业务实体目录）。"""

    name = _sanitize_filename(filename)
    ts = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    return "/".join(
        p for p in (
            str(workspace_id),
            str(project_id),
            "filestore-versions",
            str(asset_id),
            f"{ts}-{name}",
        ) if p
    )


def build_export_key(workspace_id: str, slug: str, token_id: str, date_str: str) -> str:
    """工作项导出 ZIP 的对象 key。"""

    short_token = (token_id or "")[:6]
    return "/".join(
        p for p in (str(workspace_id), "export", f"{slug}-{short_token}-{date_str}.zip")
        if p
    )


def filestore_version_prefix(workspace_id: str, project_id: str, asset_id: str) -> str:
    """OnlyOffice 版本恢复时用于校验 version_key 合法性的前缀。"""

    return (
        "/".join(
            p for p in (
                str(workspace_id), str(project_id), "filestore-versions", str(asset_id)
            ) if p
        )
        + "/"
    )
