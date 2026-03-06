from __future__ import annotations

import os
from datetime import timedelta
from io import BytesIO
from typing import Optional
from urllib.parse import urlparse, urlunparse

from django.conf import settings
from minio import Minio
from minio.error import S3Error

from plane.utils.exception_logger import log_exception


class MinIOUtils:
    """MinIO 连接与对象操作工具类。"""

    _instance: Optional["MinIOUtils"] = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        secure: Optional[bool] = None,
        region: Optional[str] = None,
    ):
        """初始化 MinIO 客户端，优先使用传入参数，其次读取 Django 配置。"""
        if self._initialized:
            return
        raw_endpoint = endpoint or getattr(settings, "AWS_S3_ENDPOINT_URL", None) or ""
        self.endpoint, endpoint_secure = self._normalize_endpoint(raw_endpoint)
        self.access_key = access_key or getattr(settings, "AWS_ACCESS_KEY_ID", None) or "plane"
        self.secret_key = secret_key or getattr(settings, "AWS_SECRET_ACCESS_KEY", None) or "plane123456789"
        self.bucket_name = bucket_name or getattr(settings, "AWS_STORAGE_BUCKET_NAME", None) or "uploads"
        self.region = region or getattr(settings, "AWS_REGION", None) or None
        self.secure = endpoint_secure if secure is None else secure
        self.client = Minio(
            endpoint=self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=self.secure,
            region=self.region or None,
        )
        self._initialized = True

    @staticmethod
    def _normalize_endpoint(endpoint: str) -> tuple[str, bool]:
        """规范化 endpoint，返回 host:port 与是否使用 HTTPS。"""
        endpoint = (endpoint or "").strip()
        if not endpoint:
            return "localhost:9000", False
        if "://" not in endpoint:
            return endpoint.rstrip("/"), False
        parsed = urlparse(endpoint)
        netloc = parsed.netloc or parsed.path
        return netloc.rstrip("/"), parsed.scheme == "https"

    @staticmethod
    def _resolve_external_endpoint(request=None) -> tuple[Optional[str], Optional[str]]:
        """解析可被外部访问的 scheme/netloc，用于覆盖容器内网地址。"""
        if not getattr(settings, "USE_MINIO", False):
            return None, None

        if request and hasattr(request, "get_host"):
            scheme = "https" if os.environ.get("MINIO_ENDPOINT_SSL") == "1" else getattr(request, "scheme", "http")
            return scheme, request.get_host()

        web_url = os.environ.get("WEB_URL")
        if web_url:
            parsed_web = urlparse(web_url)
            if parsed_web.netloc:
                return parsed_web.scheme or "http", parsed_web.netloc

        return None, None

    def ensure_bucket(self, bucket_name: Optional[str] = None) -> bool:
        """确保目标 bucket 存在，不存在时自动创建。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            if not self.client.bucket_exists(target_bucket):
                self.client.make_bucket(target_bucket, location=self.region or None)
            return True
        except S3Error as exc:
            log_exception(exc)
            return False

    def upload_file(
        self,
        object_name: str,
        file_path: str,
        bucket_name: Optional[str] = None,
        content_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        """将本地文件上传到 MinIO。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            self.client.fput_object(
                bucket_name=target_bucket,
                object_name=object_name,
                file_path=file_path,
                content_type=content_type or "application/octet-stream",
                metadata=metadata,
            )
            return True
        except S3Error as exc:
            log_exception(exc)
            return False

    def upload_bytes(
        self,
        object_name: str,
        data: bytes | str,
        bucket_name: Optional[str] = 'file',
        content_type: str = "application/octet-stream",
        metadata: Optional[dict] = None,
    ) -> bool:
        """将字节内容或字符串上传到 MinIO。"""
        target_bucket = bucket_name or self.bucket_name
        self.ensure_bucket(target_bucket)
        raw = data.encode("utf-8") if isinstance(data, str) else data
        data_stream = BytesIO(raw)
        try:
            self.client.put_object(
                bucket_name=target_bucket,
                object_name=object_name,
                data=data_stream,
                length=len(raw),
                content_type=content_type,
                metadata=metadata,
            )
            return True
        except S3Error as exc:
            log_exception(exc)
            return False

    def get_object(self, object_name: str, bucket_name: Optional[str] = None):
        """获取对象响应流，供调用方按需读取。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            return self.client.get_object(bucket_name=target_bucket, object_name=object_name)
        except S3Error as exc:
            log_exception(exc)
            return None

    def get_object_data(self, object_name: str, bucket_name: Optional[str] = None) -> Optional[bytes]:
        """读取并返回对象的完整二进制内容。"""
        response = self.get_object(object_name=object_name, bucket_name=bucket_name)
        if response is None:
            return None
        try:
            return response.read()
        except S3Error as exc:
            log_exception(exc)
            return None
        finally:
            response.close()
            response.release_conn()

    def stat_object(self, object_name: str, bucket_name: Optional[str] = None) -> Optional[dict]:
        """获取对象元信息并转换为字典。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            stat = self.client.stat_object(bucket_name=target_bucket, object_name=object_name)
            return {
                "object_name": stat.object_name,
                "etag": stat.etag,
                "size": stat.size,
                "content_type": stat.content_type,
                "last_modified": stat.last_modified,
                "metadata": stat.metadata,
            }
        except S3Error as exc:
            log_exception(exc)
            return None

    def remove_object(self, object_name: str, bucket_name: Optional[str] = 'file') -> bool:
        """删除指定对象。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            self.client.remove_object(bucket_name=target_bucket, object_name=object_name)
            return True
        except S3Error as exc:
            log_exception(exc)
            return False

    def generate_presigned_get_url(
        self,
        object_name: str,
        expires_seconds: int = 3600,
        bucket_name: Optional[str] = None,
        response_headers: Optional[dict] = None,
        request=None,
    ) -> Optional[str]:
        """生成对象下载的预签名访问地址。"""
        target_bucket = bucket_name or self.bucket_name
        try:
            presigned_url = self.client.presigned_get_object(
                bucket_name=target_bucket,
                object_name=object_name,
                expires=timedelta(seconds=expires_seconds),
                response_headers=response_headers,
            )
            target_scheme, target_netloc = self._resolve_external_endpoint(request=request)
            if not target_scheme or not target_netloc:
                return presigned_url

            parsed = urlparse(presigned_url)
            return urlunparse(parsed._replace(scheme=target_scheme, netloc=target_netloc))
        except S3Error as exc:
            log_exception(exc)
            return None


def get_minio_utils() -> MinIOUtils:
    """返回 MinIOUtils 默认实例。"""
    return MinIOUtils()
