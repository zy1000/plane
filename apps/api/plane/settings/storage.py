# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
import uuid
from typing import Optional

# Third party imports
import boto3
from botocore.exceptions import ClientError
from urllib.parse import quote

# Module imports
from plane.utils.exception_logger import log_exception
from storages.backends.s3boto3 import S3Boto3Storage


def _sanitize_meta_value(value) -> str:
    """把 user-defined metadata 的 value 转成可放进 HTTP header 的 ASCII 字符串。

    AWS / MinIO 把 user metadata 当 HTTP header 处理，HTTP header 不支持非 ASCII。
    这里用 RFC 5987 风格 ``quote()`` 转义中文等多字节字符，运维侧反向 ``unquote``
    即可还原 ``工作区A/项目A/工作项/工作项B`` 这种展示路径。
    """
    if value is None:
        return ""
    text = str(value)
    try:
        text.encode("ascii")
        return text
    except UnicodeEncodeError:
        return quote(text, safe="/-_.")


class S3Storage(S3Boto3Storage):
    def url(self, name, parameters=None, expire=None, http_method=None):
        return name

    """S3 storage class to generate presigned URLs for S3 objects"""

    def __init__(self, request=None):
        # Get the AWS credentials and bucket name from the environment
        self.aws_access_key_id = os.environ.get("AWS_ACCESS_KEY_ID")
        # Use the AWS_SECRET_ACCESS_KEY environment variable for the secret key
        self.aws_secret_access_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
        # Use the AWS_S3_BUCKET_NAME environment variable for the bucket name
        self.aws_storage_bucket_name = os.environ.get("AWS_S3_BUCKET_NAME")
        # Use the AWS_REGION environment variable for the region
        self.aws_region = os.environ.get("AWS_REGION")
        # Use the AWS_S3_ENDPOINT_URL environment variable for the endpoint URL
        self.aws_s3_endpoint_url = os.environ.get("AWS_S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT_URL")
        # Use the SIGNED_URL_EXPIRATION environment variable for the expiration time (default: 3600 seconds)
        self.signed_url_expiration = int(os.environ.get("SIGNED_URL_EXPIRATION", "3600"))

        if os.environ.get("USE_MINIO") == "1":
            # Determine protocol based on environment variable
            if os.environ.get("MINIO_ENDPOINT_SSL") == "1":
                endpoint_protocol = "https"
            else:
                endpoint_protocol = request.scheme if request else "http"
            # Create an S3 client for MinIO
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.aws_region,
                endpoint_url=(f"{endpoint_protocol}://{request.get_host()}" if request else self.aws_s3_endpoint_url),
                config=boto3.session.Config(signature_version="s3v4"),
            )
        else:
            # Create an S3 client
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=self.aws_access_key_id,
                aws_secret_access_key=self.aws_secret_access_key,
                region_name=self.aws_region,
                endpoint_url=self.aws_s3_endpoint_url,
                config=boto3.session.Config(signature_version="s3v4"),
            )

    def generate_presigned_post(
        self,
        object_name,
        file_type,
        file_size,
        expiration=None,
        metadata: Optional[dict] = None,
    ):
        """Generate a presigned URL to upload an S3 object.

        ``metadata`` 会被转换为 ``x-amz-meta-<key>`` 表单字段并加入 presigned POST
        的 ``Fields`` 与 ``Conditions``。前端通过 ``signedURLResponse.upload_data.fields``
        逐项 append 到 FormData，浏览器会作为 HTTP header 一起送给 S3/MinIO，最终
        以对象 user-defined metadata 形式落盘，供运维侧 ``mc stat`` 直接看见业务路径。
        值会被 :func:`_sanitize_meta_value` 转成 ASCII，确保中文等多字节字符也能写入。
        """
        if expiration is None:
            expiration = self.signed_url_expiration
        fields = {"Content-Type": file_type}

        conditions = [
            {"bucket": self.aws_storage_bucket_name},
            ["content-length-range", 1, file_size],
            {"Content-Type": file_type},
        ]

        # Add condition for the object name (key)
        if object_name.startswith("${filename}"):
            conditions.append(["starts-with", "$key", object_name[: -len("${filename}")]])
        else:
            fields["key"] = object_name
            conditions.append({"key": object_name})

        # Inject user-defined metadata as x-amz-meta-* fields
        if metadata:
            for raw_key, raw_value in metadata.items():
                if raw_value is None:
                    continue
                header = f"x-amz-meta-{str(raw_key).strip().lower()}"
                value = _sanitize_meta_value(raw_value)
                fields[header] = value
                conditions.append({header: value})

        # Generate the presigned POST URL
        try:
            # Generate a presigned URL for the S3 object
            response = self.s3_client.generate_presigned_post(
                Bucket=self.aws_storage_bucket_name,
                Key=object_name,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=expiration,
            )
        # Handle errors
        except ClientError as e:
            print(f"Error generating presigned POST URL: {e}")
            return None

        return response

    def _get_content_disposition(self, disposition, filename=None):
        """Helper method to generate Content-Disposition header value"""
        if filename is None:
            filename = uuid.uuid4().hex

        if filename:
            # Encode the filename to handle special characters
            encoded_filename = quote(filename)
            return f"{disposition}; filename*=UTF-8''{encoded_filename}"
        return disposition

    def generate_presigned_url(
        self,
        object_name,
        expiration=None,
        http_method="GET",
        disposition="inline",
        filename=None,
        version_id=None,
    ):
        """Generate a presigned URL to share an S3 object"""
        if expiration is None:
            expiration = self.signed_url_expiration
        content_disposition = self._get_content_disposition(disposition, filename)
        params = {
            "Bucket": self.aws_storage_bucket_name,
            "Key": str(object_name),
            "ResponseContentDisposition": content_disposition,
        }
        if version_id:
            params["VersionId"] = str(version_id)
        try:
            response = self.s3_client.generate_presigned_url(
                "get_object",
                Params=params,
                ExpiresIn=expiration,
                HttpMethod=http_method,
            )
        except ClientError as e:
            log_exception(e)
            return None

        # The response contains the presigned URL
        return response

    def get_object_metadata(self, object_name, version_id=None):
        """Get the metadata for an S3 object"""
        params = {"Bucket": self.aws_storage_bucket_name, "Key": object_name}
        if version_id:
            params["VersionId"] = str(version_id)
        try:
            response = self.s3_client.head_object(**params)
        except ClientError as e:
            log_exception(e)
            return None

        return {
            "ContentType": response.get("ContentType"),
            "ContentLength": response.get("ContentLength"),
            "LastModified": (response.get("LastModified").isoformat() if response.get("LastModified") else None),
            "ETag": response.get("ETag"),
            "Metadata": response.get("Metadata", {}),
            "VersionId": response.get("VersionId"),
        }

    def get_bucket_versioning(self):
        """Get bucket versioning configuration."""
        try:
            return self.s3_client.get_bucket_versioning(Bucket=self.aws_storage_bucket_name)
        except ClientError as e:
            log_exception(e)
            return None

    def enable_bucket_versioning(self):
        """Enable versioning for the configured bucket."""
        try:
            return self.s3_client.put_bucket_versioning(
                Bucket=self.aws_storage_bucket_name,
                VersioningConfiguration={"Status": "Enabled"},
            )
        except ClientError as e:
            log_exception(e)
            return None

    def copy_object(
        self,
        object_name,
        new_object_name,
        metadata: Optional[dict] = None,
        content_type: Optional[str] = None,
        source_version_id: Optional[str] = None,
    ):
        """Copy an S3 object to a new location.

        当传入 ``metadata`` 时，使用 ``MetadataDirective='REPLACE'`` 覆盖目标对象
        的 user-defined metadata；用于迁移命令、bulk 绑定 temp→final 等场景给
        新位置补上 display-path / original-name / asset-id 这些标记。
        """
        try:
            extra: dict = {}
            if metadata:
                extra["MetadataDirective"] = "REPLACE"
                extra["Metadata"] = {
                    str(k).strip().lower(): _sanitize_meta_value(v)
                    for k, v in metadata.items()
                    if v is not None
                }
                # MinIO 在 REPLACE 模式下要求一并指定 ContentType，否则会清掉源对象的
                if content_type:
                    extra["ContentType"] = content_type
            copy_source = {"Bucket": self.aws_storage_bucket_name, "Key": object_name}
            if source_version_id:
                copy_source["VersionId"] = str(source_version_id)
            response = self.s3_client.copy_object(
                Bucket=self.aws_storage_bucket_name,
                CopySource=copy_source,
                Key=new_object_name,
                **extra,
            )
        except ClientError as e:
            log_exception(e)
            return None

        return response

    def get_object(self, object_name: str, version_id=None) -> Optional[dict]:
        """Fetch an object from S3/MinIO using boto3 get_object."""
        params = {"Bucket": self.aws_storage_bucket_name, "Key": str(object_name)}
        if version_id:
            params["VersionId"] = str(version_id)
        try:
            return self.s3_client.get_object(**params)
        except ClientError as e:
            log_exception(e)
            return None

    def upload_file(
        self,
        file_obj,
        object_name: str,
        content_type: str = None,
        extra_args: dict = {},
    ) -> bool:
        """Upload a file directly to S3"""
        try:
            if content_type:
                extra_args["ContentType"] = content_type

            self.s3_client.upload_fileobj(
                file_obj,
                self.aws_storage_bucket_name,
                object_name,
                ExtraArgs=extra_args,
            )
            return True
        except ClientError as e:
            log_exception(e)
            return False

    def delete_files(self, object_names):
        """Delete an S3 object"""
        try:
            self.s3_client.delete_objects(
                Bucket=self.aws_storage_bucket_name,
                Delete={"Objects": [{"Key": object_name} for object_name in object_names]},
            )
            return True
        except ClientError as e:
            log_exception(e)
            return False

    def delete_object_version(self, object_name: str, version_id: str) -> bool:
        """Physically delete one specific object version."""
        if not object_name or not version_id:
            return False
        try:
            self.s3_client.delete_object(
                Bucket=self.aws_storage_bucket_name,
                Key=str(object_name),
                VersionId=str(version_id),
            )
            return True
        except ClientError as e:
            log_exception(e)
            return False

    def delete_object_versions(self, versions: list[dict]) -> bool:
        """Physically delete many object versions.

        Each item must include ``Key`` and ``VersionId``. This helper is used for
        versioned buckets where deleting without VersionId would create a delete marker.
        """
        objects = [
            {"Key": str(item["Key"]), "VersionId": str(item["VersionId"])}
            for item in versions
            if item.get("Key") and item.get("VersionId")
        ]
        if not objects:
            return True
        try:
            for start in range(0, len(objects), 1000):
                self.s3_client.delete_objects(
                    Bucket=self.aws_storage_bucket_name,
                    Delete={"Objects": objects[start : start + 1000], "Quiet": True},
                )
            return True
        except ClientError as e:
            log_exception(e)
            return False

    def list_object_versions(self, object_name: str) -> list[dict]:
        """List object versions and delete markers for one exact key."""
        if not object_name:
            return []
        results: list[dict] = []
        try:
            paginator = self.s3_client.get_paginator("list_object_versions")
            for page in paginator.paginate(Bucket=self.aws_storage_bucket_name, Prefix=str(object_name)):
                for item in page.get("Versions", []):
                    if item.get("Key") == str(object_name):
                        results.append({**item, "IsDeleteMarker": False})
                for item in page.get("DeleteMarkers", []):
                    if item.get("Key") == str(object_name):
                        results.append({**item, "IsDeleteMarker": True})
        except ClientError as e:
            log_exception(e)
            return []
        return results

    def delete_all_object_versions(self, object_name: str) -> bool:
        """Physically delete all versions and delete markers for an object key."""
        versions = self.list_object_versions(object_name)
        return self.delete_object_versions(
            [
                {"Key": item.get("Key"), "VersionId": item.get("VersionId")}
                for item in versions
                if item.get("Key") and item.get("VersionId")
            ]
        )
