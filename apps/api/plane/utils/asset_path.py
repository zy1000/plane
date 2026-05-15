# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""统一的 MinIO 对象 key 生成器。

所有上传场景应通过 :func:`build_asset_key` 构造对象 key，禁止再手写
``f"{workspace.id}/{uuid}-{name}"`` 之类的拼接，以保证全站存储路径具备
一致的 ``workspace_id/project_id/<业务类型>/<业务id>/<uuid>-<filename>`` 结构。

未绑定业务实体时（典型场景：富文本编辑器在 issue/page 还未创建时插入图片），
key 会落入对应作用域下的 ``temp/{asset_id}/`` 目录，待后续 bulk 绑定接口
通过 S3 copy 物理迁移到正式路径。
"""

from __future__ import annotations

import os
import re
import time
from typing import Optional
from uuid import uuid4

# 关键字段缺失时落入临时目录的标识子目录名
TEMP_FOLDER = "temp"

# 文件名最大长度限制：去除危险字符后，截断到合理长度，避免与 FileField max_length=800 冲突
_FILENAME_MAX_LEN = 200

_INVALID_FILENAME_CHARS = re.compile(r"[\x00-\x1f/\\]")


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


def _scope_prefix(*, workspace_id: Optional[str], project_id: Optional[str]) -> str:
    """根据 workspace/project 维度返回路径前缀（不含末尾 ``/``）。"""

    parts = []
    if workspace_id:
        parts.append(str(workspace_id))
    if project_id:
        parts.append(str(project_id))
    return "/".join(parts)


def _join(*parts: str) -> str:
    return "/".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------


def build_asset_key(
    entity_type: str,
    filename: str,
    *,
    asset_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    issue_id: Optional[str] = None,
    page_id: Optional[str] = None,
    comment_id: Optional[str] = None,
    case_id: Optional[str] = None,
    case_repository_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    release_id: Optional[str] = None,
    plan_case_record_id: Optional[str] = None,
    draft_issue_id: Optional[str] = None,
) -> str:
    """根据 ``entity_type`` 与作用域 ID 拼出统一的对象 key。

    规则总览（``ws`` = workspace_id，``proj`` = project_id，``uuid`` 为防重名前缀）：

    - ``USER_AVATAR``: ``user/{user_id}/avatar/{uuid}-{name}``
    - ``USER_COVER``: ``user/{user_id}/cover/{uuid}-{name}``
    - ``WORKSPACE_LOGO``: ``{ws}/workspace-logo/{uuid}-{name}``
    - ``PROJECT_COVER``: ``{ws}/{proj}/project-cover/{uuid}-{name}``
    - ``PROJECT_DESCRIPTION``: ``{ws}/{proj}/project-description/{uuid}-{name}``
    - ``PROJECT_FILESTORE``: ``{ws}/{proj}/filestore/{uuid}-{name}``
    - ``CASE_MINDMAP``: ``{ws}/{proj}/test/mindmap/{uuid}-{name}``
    - ``ISSUE_ATTACHMENT`` / ``ISSUE_DESCRIPTION``: ``{ws}/{proj}/issue/{issue_id}/{uuid}-{name}``
    - ``DRAFT_ISSUE_*``: ``{ws}/{proj}/draft-issue/{draft_issue_id}/{uuid}-{name}``
    - ``COMMENT_DESCRIPTION``: ``{ws}/{proj}/comment/{comment_id}/{uuid}-{name}``
    - ``PAGE_DESCRIPTION``: ``{ws}/{proj}/page/{page_id}/{uuid}-{name}``
    - ``CASE_ATTACHMENT``: ``{ws}/{proj}/test/{case_repository_id}/{case_id}/{uuid}-{name}``
    - ``CYCLE_FILE``: ``{ws}/{proj}/cycle/{cycle_id}/{uuid}-{name}``
    - ``RELEASE_FILE``: ``{ws}/{proj}/release/{release_id}/{uuid}-{name}``
    - ``PLAN_CASE_RECORD_FILE``: ``{ws}/{proj}/test/execution/{plan_case_record_id}/{uuid}-{name}``

    缺少关键 entity_id 时（仅适用于编辑器内嵌资源），key 会落入
    ``<scope>/temp/{asset_id}/{name}``，由后续 bulk 绑定接口迁移到正式位置。
    """

    name = _sanitize_filename(filename)
    uuid_prefix = uuid4().hex

    # 用户作用域：与 workspace/project 无关
    if entity_type in ("USER_AVATAR", "USER_COVER"):
        sub = "avatar" if entity_type == "USER_AVATAR" else "cover"
        owner = str(user_id) if user_id else "anonymous"
        return _join("user", owner, sub, f"{uuid_prefix}-{name}")

    # 仅 workspace 作用域
    if entity_type == "WORKSPACE_LOGO":
        if not workspace_id:
            raise ValueError("workspace_id is required for WORKSPACE_LOGO")
        return _join(str(workspace_id), "workspace-logo", f"{uuid_prefix}-{name}")

    if not workspace_id:
        raise ValueError(f"workspace_id is required for entity_type={entity_type}")

    # 工作区下的扁平/聚合资源
    if entity_type == "PROJECT_COVER":
        if not project_id:
            raise ValueError("project_id is required for PROJECT_COVER")
        return _join(
            str(workspace_id), str(project_id), "project-cover", f"{uuid_prefix}-{name}"
        )

    if entity_type == "PROJECT_DESCRIPTION":
        if not project_id:
            return _temp_key(
                asset_id, workspace_id=workspace_id, project_id=None, filename=name
            )
        return _join(
            str(workspace_id),
            str(project_id),
            "project-description",
            f"{uuid_prefix}-{name}",
        )

    if entity_type == "PROJECT_FILESTORE":
        if not project_id:
            raise ValueError("project_id is required for PROJECT_FILESTORE")
        return _join(
            str(workspace_id), str(project_id), "filestore", f"{uuid_prefix}-{name}"
        )

    if entity_type == "CASE_MINDMAP":
        if not project_id:
            raise ValueError("project_id is required for CASE_MINDMAP")
        return _join(
            str(workspace_id),
            str(project_id),
            "test",
            "mindmap",
            f"{uuid_prefix}-{name}",
        )

    # 项目作用域内、按业务实体分目录的资源
    scope = _scope_prefix(workspace_id=workspace_id, project_id=project_id)

    if entity_type in ("ISSUE_ATTACHMENT", "ISSUE_DESCRIPTION"):
        if not issue_id:
            return _temp_key(
                asset_id,
                workspace_id=workspace_id,
                project_id=project_id,
                filename=name,
            )
        return _join(scope, "issue", str(issue_id), f"{uuid_prefix}-{name}")

    if entity_type in ("DRAFT_ISSUE_ATTACHMENT", "DRAFT_ISSUE_DESCRIPTION"):
        if not draft_issue_id:
            return _temp_key(
                asset_id,
                workspace_id=workspace_id,
                project_id=project_id,
                filename=name,
            )
        return _join(scope, "draft-issue", str(draft_issue_id), f"{uuid_prefix}-{name}")

    if entity_type == "COMMENT_DESCRIPTION":
        if not comment_id:
            return _temp_key(
                asset_id,
                workspace_id=workspace_id,
                project_id=project_id,
                filename=name,
            )
        return _join(scope, "comment", str(comment_id), f"{uuid_prefix}-{name}")

    if entity_type == "PAGE_DESCRIPTION":
        if not page_id:
            return _temp_key(
                asset_id,
                workspace_id=workspace_id,
                project_id=project_id,
                filename=name,
            )
        return _join(scope, "page", str(page_id), f"{uuid_prefix}-{name}")

    if entity_type == "CASE_ATTACHMENT":
        if not project_id:
            raise ValueError("project_id is required for CASE_ATTACHMENT")
        if not case_id or not case_repository_id:
            return _temp_key(
                asset_id,
                workspace_id=workspace_id,
                project_id=project_id,
                filename=name,
            )
        return _join(
            scope,
            "test",
            str(case_repository_id),
            str(case_id),
            f"{uuid_prefix}-{name}",
        )

    if entity_type == "CYCLE_FILE":
        if not project_id or not cycle_id:
            raise ValueError("project_id and cycle_id are required for CYCLE_FILE")
        return _join(scope, "cycle", str(cycle_id), f"{uuid_prefix}-{name}")

    if entity_type == "RELEASE_FILE":
        if not project_id or not release_id:
            raise ValueError("project_id and release_id are required for RELEASE_FILE")
        return _join(scope, "release", str(release_id), f"{uuid_prefix}-{name}")

    if entity_type == "PLAN_CASE_RECORD_FILE":
        if not project_id or not plan_case_record_id:
            raise ValueError(
                "project_id and plan_case_record_id are required for PLAN_CASE_RECORD_FILE"
            )
        return _join(
            scope,
            "test",
            "execution",
            str(plan_case_record_id),
            f"{uuid_prefix}-{name}",
        )

    # 兜底：未知 entity_type 时回退到 workspace 根 + uuid 前缀的旧风格
    return _join(scope or str(workspace_id), f"{uuid_prefix}-{name}")


def _temp_key(
    asset_id: Optional[str],
    *,
    workspace_id: Optional[str],
    project_id: Optional[str],
    filename: str,
) -> str:
    """生成临时目录下的 key，要求 ``asset_id`` 必填，避免重名。"""

    if not asset_id:
        # 没有 asset_id 时仍生成一个一次性 uuid 作为防冲突子目录
        asset_id = uuid4().hex
    scope = _scope_prefix(workspace_id=workspace_id, project_id=project_id)
    return _join(scope, TEMP_FOLDER, str(asset_id), filename)


def is_temp_key(asset_key: str) -> bool:
    """判断给定 key 是否仍处于 temp 目录中。"""

    if not asset_key:
        return False
    parts = asset_key.split("/")
    return TEMP_FOLDER in parts


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
    """根据 entity_type 把 entity_identifier 转为 :func:`build_asset_key` 关键字参数。"""

    field = ENTITY_IDENTIFIER_FIELD.get(entity_type)
    if not field or not entity_identifier:
        return {}
    return {field: str(entity_identifier)}


# ---------------------------------------------------------------------------
# 特殊场景
# ---------------------------------------------------------------------------


def build_filestore_version_key(
    workspace_id: str, project_id: str, asset_id: str, filename: str
) -> str:
    """OnlyOffice 版本快照路径。"""

    name = _sanitize_filename(filename)
    ts = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    return _join(
        str(workspace_id),
        str(project_id),
        "filestore",
        str(asset_id),
        "versions",
        f"{ts}-{name}",
    )


def build_export_key(workspace_id: str, slug: str, token_id: str, date_str: str) -> str:
    """工作项导出 ZIP 的对象 key。"""

    short_token = (token_id or "")[:6]
    return _join(str(workspace_id), "export", f"{slug}-{short_token}-{date_str}.zip")


def filestore_version_prefix(workspace_id: str, project_id: str, asset_id: str) -> str:
    """OnlyOffice 版本恢复时用于校验 version_key 合法性的前缀。"""

    return (
        _join(
            str(workspace_id), str(project_id), "filestore", str(asset_id), "versions"
        )
        + "/"
    )
