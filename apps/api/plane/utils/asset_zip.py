"""附件批量下载：把若干 FileAsset 打包成 zip 响应。

与文件库（filestore explorer）的 batch-download 保持一致的行为：从 S3/MinIO 逐个
读取对象写入内存 zip，重名文件按 ``name (1).ext`` 递增去重。
"""

from __future__ import annotations

import io
import os
import zipfile
from typing import Iterable

from django.http import StreamingHttpResponse

from plane.db.models import FileAsset
from plane.settings.storage import S3Storage
from plane.utils.asset_path import _sanitize_filename


def _dedupe_name(name: str, used_names: set[str]) -> str:
    if name not in used_names:
        used_names.add(name)
        return name

    base, ext = os.path.splitext(name)
    counter = 1
    while True:
        candidate = f"{base} ({counter}){ext}"
        if candidate not in used_names:
            used_names.add(candidate)
            return candidate
        counter += 1


def build_assets_zip_response(
    request, assets: Iterable[FileAsset], zip_filename: str
) -> StreamingHttpResponse:
    """把资产列表打包成 zip 并返回可直接下发的响应。"""

    storage = S3Storage(request=request)
    zip_buffer = io.BytesIO()
    used_names: set[str] = set()

    with zipfile.ZipFile(
        zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED, allowZip64=True
    ) as archive:
        for asset in assets:
            key = asset.storage_key
            if not key:
                continue
            obj = storage.get_object(object_name=key)
            if not obj or "Body" not in obj:
                continue
            body = obj["Body"]
            try:
                content = body.read()
            finally:
                try:
                    body.close()
                except Exception:
                    pass
            raw_name = (asset.attributes or {}).get("name") or asset.filename or "file"
            archive.writestr(
                _dedupe_name(_sanitize_filename(raw_name), used_names), content
            )

    zip_buffer.seek(0)
    response = StreamingHttpResponse(zip_buffer, content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{zip_filename}"'
    return response
