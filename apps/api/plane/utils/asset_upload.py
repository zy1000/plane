# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""统一组装 (asset_key, S3 metadata) 并签发 presigned POST。

所有上传入口（issue/case/cycle/release/page/draft/comment/user/workspace/...）
都应走 :func:`presigned_post_for_asset`，避免每个 view 重复手写 metadata 三件套。

设计要点：

- 物理 key 完全由 ``FileAsset.storage_key`` 派生（FilePath 链 + filename）；
  调用方在 ``FileAsset.objects.create(...)`` 时只需提供 ``attributes.name``、FK 与
  entity_type，``save()`` 钩子会自动 resolve path、做 filename 去重。
- ``display-path`` 同样取自 ``asset.display_path`` 计算属性，统一与 API 响应中的
  路径展示。
- ``original-name`` 优先取 ``attributes.name``，回退到 ``asset.filename``。
"""

from __future__ import annotations

from typing import Optional

from plane.settings.storage import S3Storage, _sanitize_meta_value


def build_asset_metadata(asset, *, original_name: Optional[str] = None) -> dict:
    """根据 FileAsset 实例拼出写入 S3 user-defined metadata 的字典。

    返回值 key 用 hyphen，落到 MinIO 上会带 ``X-Amz-Meta-`` 前缀。

    所有 value 在此处统一走 :func:`_sanitize_meta_value`：S3/MinIO 把 user metadata
    当 HTTP header 处理，HTTP header 仅允许 ASCII。中文等多字节字符会被 RFC 5987
    风格的 ``quote()`` 转义。如此一来不论调用方走 S3Storage 封装还是直接 boto3
    （比如 ``migrate_asset_paths`` 命令）都不会再被 boto 的 ASCII 校验顶回来。
    """
    if original_name is None:
        attrs = getattr(asset, "attributes", None) or {}
        original_name = (
            attrs.get("name")
            if isinstance(attrs, dict)
            else None
        )
    if not original_name:
        # 兜底：从 FileAsset.filename 末段反推（已经过 _sanitize_filename 处理）
        original_name = getattr(asset, "filename", "") or ""

    # 优先复用 FileAsset.display_path 计算属性
    display_path = ""
    try:
        cached = getattr(asset, "display_path", None)
        if cached:
            display_path = cached
    except Exception:
        display_path = ""

    return {
        "display-path": _sanitize_meta_value(display_path),
        "original-name": _sanitize_meta_value(original_name or ""),
        "asset-id": _sanitize_meta_value(
            str(asset.pk) if getattr(asset, "pk", None) else ""
        ),
    }


def presigned_post_for_asset(
    *,
    request,
    asset,
    file_type: str,
    file_size: int,
    asset_key: Optional[str] = None,
    storage: Optional[S3Storage] = None,
):
    """统一签发 presigned POST：默认从 ``asset.storage_key`` 拿 key、组装 metadata。

    传 ``asset_key`` 显式指定时优先生效（极少数老 view 不依赖 FileAsset）。
    """
    if storage is None:
        storage = S3Storage(request=request)
    object_name = asset_key
    if not object_name:
        try:
            object_name = asset.storage_key
        except Exception:
            object_name = None
    if not object_name:
        raise ValueError(
            "storage_key is empty (asset.path / asset.filename not yet bound)"
        )

    metadata = build_asset_metadata(asset)
    return storage.generate_presigned_post(
        object_name=object_name,
        file_type=file_type,
        file_size=file_size,
        metadata=metadata,
    )
