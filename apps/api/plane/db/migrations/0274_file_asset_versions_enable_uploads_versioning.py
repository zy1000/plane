import os
import uuid

import boto3
from botocore.config import Config
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


FILESTORE_ENTITY_TYPE = "PROJECT_FILESTORE"
NULL_VERSION_ID = "null"


def _build_s3_client():
    endpoint_url = os.environ.get("AWS_S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT_URL")
    bucket_name = os.environ.get("AWS_S3_BUCKET_NAME") or getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")

    missing = []
    if not endpoint_url:
        missing.append("AWS_S3_ENDPOINT_URL or MINIO_ENDPOINT_URL")
    if not bucket_name:
        missing.append("AWS_S3_BUCKET_NAME")
    if not access_key:
        missing.append("AWS_ACCESS_KEY_ID")
    if not secret_key:
        missing.append("AWS_SECRET_ACCESS_KEY")
    if missing:
        raise RuntimeError(f"Cannot enable uploads bucket versioning; missing {', '.join(missing)}")

    return (
        boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=os.environ.get("AWS_REGION"),
            config=Config(signature_version="s3v4"),
        ),
        bucket_name,
    )


def enable_uploads_versioning_and_backfill(apps, schema_editor):
    FileAsset = apps.get_model("db", "FileAsset")
    FileAssetVersion = apps.get_model("db", "FileAssetVersion")
    db_alias = schema_editor.connection.alias

    s3_client, bucket_name = _build_s3_client()
    s3_client.put_bucket_versioning(
        Bucket=bucket_name,
        VersioningConfiguration={"Status": "Enabled"},
    )

    assets = (
        FileAsset.objects.using(db_alias)
        .filter(
            entity_type=FILESTORE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
            version_id__isnull=True,
        )
        .iterator(chunk_size=500)
    )
    for asset in assets:
        attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
        asset.version_id = NULL_VERSION_ID
        asset.save(update_fields=["version_id"])
        FileAssetVersion.objects.using(db_alias).get_or_create(
            asset_id=asset.id,
            version_id=NULL_VERSION_ID,
            defaults={
                "alias": attrs.get("name") or asset.filename or "初始版本",
                "filename": asset.filename or attrs.get("name") or "",
                "content_type": attrs.get("type") or None,
                "size": float(asset.size or attrs.get("size") or 0),
                "etag": (
                    asset.storage_metadata.get("ETag")
                    if isinstance(asset.storage_metadata, dict)
                    else None
                ),
                "storage_metadata": asset.storage_metadata or {},
                "is_current": True,
                "created_by_id": asset.created_by_id,
            },
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0273_move_test_plan_assignee_to_plan_case"),
    ]

    operations = [
        migrations.AddField(
            model_name="fileasset",
            name="version_id",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.CreateModel(
            name="FileAssetVersion",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By")),
                ("updated_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("version_id", models.CharField(max_length=255)),
                ("alias", models.CharField(blank=True, max_length=255, null=True)),
                ("filename", models.CharField(default="", max_length=255)),
                ("content_type", models.CharField(blank=True, max_length=255, null=True)),
                ("size", models.FloatField(default=0)),
                ("etag", models.CharField(blank=True, max_length=255, null=True)),
                ("storage_metadata", models.JSONField(blank=True, default=dict, null=True)),
                ("is_current", models.BooleanField(default=False)),
                ("asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="versions", to="db.fileasset")),
            ],
            options={
                "verbose_name": "File Asset Version",
                "verbose_name_plural": "File Asset Versions",
                "db_table": "file_asset_versions",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="fileassetversion",
            index=models.Index(fields=["asset", "is_current"], name="fav_asset_current_idx"),
        ),
        migrations.AddIndex(
            model_name="fileassetversion",
            index=models.Index(fields=["version_id"], name="fav_version_id_idx"),
        ),
        migrations.AddConstraint(
            model_name="fileassetversion",
            constraint=models.UniqueConstraint(fields=("asset", "version_id"), name="fileassetversion_uniq_asset_version"),
        ),
        migrations.AddConstraint(
            model_name="fileassetversion",
            constraint=models.UniqueConstraint(condition=models.Q(deleted_at__isnull=True, is_current=True), fields=("asset",), name="fileassetversion_uniq_current_asset"),
        ),
        migrations.RunPython(enable_uploads_versioning_and_backfill, noop_reverse),
    ]
