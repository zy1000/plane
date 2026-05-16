# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""一次性数据迁移命令：把历史 MinIO 对象搬运到由 ``FilePath`` 派生的新路径下，
同时给 ``FileAsset`` 补齐 ``path`` / ``filename`` 字段。

新的 MinIO key 完全由 :func:`plane.utils.file_path.compute_storage_key` 计算：

- 段位取 ``FilePath`` 节点链上的 ``entity_id``（业务节点）/ slug（分类节点）；
- 末段为 ``FileAsset.filename``，不再带 UUID 前缀；
- 同 ``path`` 下重名时由 :func:`plane.utils.file_path.dedup_filename` 自动追加
  ``(1)`` / ``(2)`` 后缀（本命令在内存维护已分配 filename 集合，避免同批内 race）。

适用场景：

1. 历史 ``FileAsset.asset`` 字段记录的 MinIO key（``{ws}/{uuid}-{name}`` 等格式）
   需要按新规则重算并物理 copy；
2. 历史 ``File`` 模型（被 Cycle/Release/PlanCaseRecord 通过 M2M 引用）位于独立
   ``file`` 桶下，需要跨桶复制到 ``uploads`` 桶并新建对应 ``FileAsset`` 行。

幂等保证：

- 已经迁移过的 asset（``path`` 非空 + ``filename`` 非空 + 对象在新 key 上）直接跳过；
- 旧 key == 新 key 时不发起 S3 调用，仅补字段；
- 单条失败回滚 path/filename 改动并打印日志，下次重跑可继续。

由于本命令由 ``0236_run_migrate_asset_paths`` 自动触发，这时 ``0237_drop_fileasset_asset``
还没有执行，``file_assets.asset`` 列仍存在但 Django 模型已经不感知，所以读老 key
全部走原生 SQL。
"""

from __future__ import annotations

import json
import os
from typing import Optional
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from plane.db.models import Cycle, FileAsset, PlanCaseRecord, Release, TestCase
from plane.db.models.asset import File, FilePath
from plane.utils.asset_path import _sanitize_filename
from plane.utils.asset_upload import build_asset_metadata
from plane.utils.file_path import (
    build_resolver,
    compute_storage_key_for_path,
    dedup_filename,
)


LEGACY_FILE_BUCKET = os.environ.get("LEGACY_FILE_BUCKET", "file")

# 老 key 末段常见格式：``{32 位 hex uuid}-{原文件名}``。
# 用纯字符串切分，不引入 re 编译开销。
_UUID_PREFIX_LEN = 32 + 1  # 32-char hex + '-'


def _build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("AWS_S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION"),
        config=boto3.session.Config(signature_version="s3v4"),
    )


def _strip_uuid_prefix(name: str) -> str:
    """``{32hex}-{filename}`` → ``filename``；不匹配则原样返回。"""
    if not name or len(name) <= _UUID_PREFIX_LEN:
        return name
    prefix, sep, rest = name.partition("-")
    if sep == "-" and len(prefix) == 32 and all(c in "0123456789abcdef" for c in prefix.lower()):
        return rest
    return name


def _legacy_assets_iter(entity_types):
    """绕过 ORM 用原生 SQL 拉历史 ``asset`` 列。

    ``file_assets.asset`` 列在 0237 之前都存在，但 Django 模型已经不再声明该字段，
    所以只能走 cursor。返回 ``(id, asset_key)`` 二元组。
    """
    sql = (
        "SELECT id, asset FROM file_assets "
        "WHERE is_uploaded = TRUE AND is_deleted = FALSE "
        "AND asset IS NOT NULL AND asset <> ''"
    )
    params: list = []
    if entity_types:
        placeholders = ", ".join(["%s"] * len(entity_types))
        sql += f" AND entity_type IN ({placeholders})"
        params.extend(entity_types)
    sql += " ORDER BY created_at"
    with connection.cursor() as cur:
        cur.execute(sql, params)
        for row in cur.fetchall():
            yield row[0], row[1]


class Command(BaseCommand):
    help = "Backfill FileAsset.path/filename & move MinIO objects to FilePath-derived keys."
    _asset_column_exists_cache: Optional[bool] = None

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="只打印计划，不实际复制或更新数据库")
        parser.add_argument(
            "--entity-type",
            action="append",
            default=None,
            help="可多次指定，仅迁移指定 entity_type 的 FileAsset",
        )
        parser.add_argument("--keep-old", action="store_true", help="保留旧对象，不在迁移后删除")
        parser.add_argument(
            "--skip-fileasset",
            action="store_true",
            help="跳过 FileAsset 体系的迁移，仅处理 Cycle/Release/PlanCaseRecord 旧 File",
        )
        parser.add_argument(
            "--skip-legacy-file",
            action="store_true",
            help="跳过旧 File 模型迁移，仅处理 FileAsset",
        )
        parser.add_argument(
            "--unified-bucket",
            default=settings.AWS_STORAGE_BUCKET_NAME,
            help="目标桶名（默认取 settings.AWS_STORAGE_BUCKET_NAME）",
        )

    # ------------------------------------------------------------------ S3

    def _copy(
        self,
        s3_client,
        src_bucket: str,
        src_key: str,
        dst_bucket: str,
        dst_key: str,
        *,
        metadata: Optional[dict] = None,
        content_type: Optional[str] = None,
    ) -> bool:
        try:
            extra = {
                "Bucket": dst_bucket,
                "CopySource": {"Bucket": src_bucket, "Key": src_key},
                "Key": dst_key,
            }
            if metadata:
                extra["Metadata"] = metadata
                extra["MetadataDirective"] = "REPLACE"
                if content_type:
                    extra["ContentType"] = content_type
            s3_client.copy_object(**extra)
            return True
        except Exception as e:  # noqa: BLE001
            # 同时兜住 ClientError（服务端拒绝）与 ParamValidationError（客户端校验
            # 不通过，例如 metadata 含非 ASCII 字符）。
            self.stdout.write(
                self.style.ERROR(
                    f"复制失败 {src_bucket}/{src_key} -> {dst_bucket}/{dst_key}: "
                    f"{type(e).__name__}: {e}"
                )
            )
            return False

    # ------------------------------------------------------------------ FileAsset

    @staticmethod
    def _object_exists(s3_client, bucket: str, key: str) -> bool:
        try:
            s3_client.head_object(Bucket=bucket, Key=key)
            return True
        except ClientError as e:
            err = (e.response or {}).get("Error", {}) if hasattr(e, "response") else {}
            code = str(err.get("Code", "") or "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            return False

    def _fileasset_asset_column_exists(self) -> bool:
        """检测当前 schema 是否仍保留 ``file_assets.asset`` 列。"""
        if self._asset_column_exists_cache is not None:
            return self._asset_column_exists_cache
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM pg_attribute
                WHERE attrelid = %s::regclass
                  AND attname = 'asset'
                  AND NOT attisdropped
                LIMIT 1
                """,
                ["file_assets"],
            )
            self._asset_column_exists_cache = cur.fetchone() is not None
        return self._asset_column_exists_cache

    def _create_legacy_fileasset_row(
        self,
        *,
        asset_id,
        attributes: dict,
        filename: str,
        storage_key: str,
        path_id,
        size: int,
        workspace_id,
        project_id,
        entity_type: str,
        fk_kwargs: dict,
        storage_metadata: Optional[dict],
        created_by_id=None,
    ):
        """为 legacy File 创建一条 FileAsset。

        关键点：
        - 在 0236 执行时，数据库里 ``asset`` 列仍是 NOT NULL，而 ORM 模型已移除该字段；
        - 因此当检测到该列存在时，改走 raw SQL 显式写 ``asset=storage_key``；
        - 0237 之后列已删除，则退回 ORM create。
        """
        common_kwargs = {
            "id": asset_id,
            "attributes": attributes,
            "filename": filename,
            "size": int(size),
            "workspace_id": workspace_id,
            "project_id": project_id,
            "is_uploaded": True,
            "entity_type": entity_type,
            "storage_metadata": storage_metadata or {},
            "path_id": path_id,
            "created_by_id": created_by_id,
            **fk_kwargs,
        }

        if not self._fileasset_asset_column_exists():
            return FileAsset.objects.create(**common_kwargs)

        now = timezone.now()
        columns = [
            "id",
            "created_at",
            "updated_at",
            "attributes",
            "asset",
            "filename",
            "size",
            "is_deleted",
            "is_archived",
            "is_uploaded",
            "entity_type",
            "workspace_id",
            "project_id",
            "storage_metadata",
            "path_id",
            "created_by_id",
        ]
        params = [
            str(asset_id),
            now,
            now,
            json.dumps(attributes or {}),
            storage_key,
            filename,
            float(size),
            False,
            False,
            True,
            entity_type,
            str(workspace_id) if workspace_id else None,
            str(project_id) if project_id else None,
            json.dumps(storage_metadata or {}),
            str(path_id) if path_id else None,
            str(created_by_id) if created_by_id else None,
        ]
        for key, value in fk_kwargs.items():
            columns.append(key)
            params.append(str(value) if value else None)

        placeholders = ", ".join(["%s"] * len(columns))
        sql = f"INSERT INTO file_assets ({', '.join(columns)}) VALUES ({placeholders})"
        with connection.cursor() as cur:
            cur.execute(sql, params)
        return FileAsset.objects.get(pk=asset_id)

    def _migrate_fileassets(
        self,
        s3_client,
        bucket: str,
        *,
        dry_run: bool,
        keep_old: bool,
        entity_types,
        resolver,
    ):
        stats = {
            "checked": 0,
            "skipped_same": 0,
            "migrated": 0,
            "failed": 0,
            "missing_context": 0,
        }

        # 本次 run 内部累计已分配的 (path_id, filename) 集合，
        # 避免同一批多条 asset 撞同名而 dedup_filename 给出相同结果。
        taken_in_batch: dict[int, set] = {}

        rows = list(_legacy_assets_iter(entity_types))
        self.stdout.write(self.style.NOTICE(f"[FileAsset] 待检查记录 {len(rows)} 条"))

        for asset_id, old_key in rows:
            stats["checked"] += 1
            if not old_key:
                continue
            try:
                asset = FileAsset.objects.select_related(
                    "workspace", "project", "issue", "comment", "comment__issue", "page",
                    "case", "cycle", "release",
                    "plan_case_record", "plan_case_record__plan_case",
                    "plan_case_record__plan_case__case",
                    "draft_issue", "user",
                ).get(pk=asset_id)
            except FileAsset.DoesNotExist:
                continue

            # 1) 算出末段 filename：优先取 attributes.name，其次去 uuid 前缀
            attrs = asset.attributes or {}
            raw_name = attrs.get("name") if isinstance(attrs, dict) else None
            if not raw_name:
                raw_name = _strip_uuid_prefix(os.path.basename(old_key)) or "file"
            requested_name = _sanitize_filename(raw_name)

            # 2) 解析新 FilePath（缺上下文时走 _temp 兜底节点）
            leaf = resolver.resolve_for_asset(asset)
            if leaf is None:
                stats["missing_context"] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f"[FileAsset {asset.id}] 无法 resolve FilePath（workspace 缺失），跳过"
                    )
                )
                continue

            # 3) dedup filename（同 path 已有重名时加 (1)(2) 后缀）
            extra_taken = taken_in_batch.setdefault(leaf.pk, set())
            new_filename = dedup_filename(
                leaf.pk,
                requested_name,
                exclude_asset_id=asset.pk,
                extra_taken=extra_taken,
            )
            extra_taken.add(new_filename)

            new_key = compute_storage_key_for_path(leaf, new_filename)
            content_type = (attrs.get("type") if isinstance(attrs, dict) else "") \
                or "application/octet-stream"

            # 4) 老 key 与新 key 一致：只补 path/filename 即可
            if new_key == old_key:
                stats["skipped_same"] += 1
                if dry_run:
                    continue
                FileAsset.objects.filter(pk=asset.pk).update(
                    path=leaf, filename=new_filename
                )
                continue

            if dry_run:
                self.stdout.write(f"[dry-run] {old_key}  ->  {new_key}")
                stats["migrated"] += 1
                continue

            # 5) 先把 path/filename 切到 new 位置，让 build_asset_metadata 能算出新 display-path
            previous_path_id = asset.path_id
            previous_filename = asset.filename
            with transaction.atomic():
                FileAsset.objects.filter(pk=asset.pk).update(
                    path=leaf, filename=new_filename
                )
                asset.refresh_from_db(fields=["path", "filename"])

            metadata = build_asset_metadata(asset)

            ok = self._copy(
                s3_client, bucket, old_key, bucket, new_key,
                metadata=metadata, content_type=content_type,
            )
            if not ok:
                # 兜底幂等：如果 old_key 已被上一次中断任务删除，但 new_key 已存在，
                # 说明对象实际上已经搬迁成功，此时只需保留 DB 新 path/filename。
                if self._object_exists(s3_client, bucket, new_key):
                    stats["migrated"] += 1
                    continue
                # 回滚 DB 修改：避免对象在老位置但 DB 已经写了新 path/filename
                FileAsset.objects.filter(pk=asset.pk).update(
                    path_id=previous_path_id, filename=previous_filename
                )
                stats["failed"] += 1
                continue

            stats["migrated"] += 1

            if not keep_old:
                try:
                    s3_client.delete_object(Bucket=bucket, Key=old_key)
                except ClientError as e:
                    self.stdout.write(self.style.WARNING(f"删除旧对象失败 {old_key}: {e}"))

        for k, v in stats.items():
            self.stdout.write(self.style.SUCCESS(f"[FileAsset] {k}: {v}"))

    # ------------------------------------------------------------------ Legacy File

    def _migrate_legacy_files(
        self,
        s3_client,
        target_bucket: str,
        *,
        dry_run: bool,
        keep_old: bool,
        resolver,
    ):
        stats = {"checked": 0, "migrated": 0, "skipped": 0, "failed": 0}

        legacy_relations = (
            ("CYCLE_FILE", FileAsset.EntityTypeContext.CYCLE_FILE, Cycle, "cycles", "cycle"),
            ("RELEASE_FILE", FileAsset.EntityTypeContext.RELEASE_FILE, Release, "releases", "release"),
            (
                "PLAN_CASE_RECORD_FILE",
                FileAsset.EntityTypeContext.PLAN_CASE_RECORD_FILE,
                PlanCaseRecord,
                "plan_case_records",
                "plan_case_record",
            ),
        )

        taken_in_batch: dict[int, set] = {}

        for label, entity_type, _model, related_name, fk_name in legacy_relations:
            self.stdout.write(self.style.NOTICE(f"[LegacyFile] 处理 {label} 关联记录"))
            files_qs = (
                File.objects.filter(deleted_at__isnull=True)
                .prefetch_related(related_name)
                .all()
            )
            for legacy in files_qs:
                related_owners = list(getattr(legacy, related_name).all())
                if not related_owners:
                    continue
                stats["checked"] += 1
                for owner in related_owners:
                    workspace_id = getattr(owner, "workspace_id", None)
                    project_id = getattr(owner, "project_id", None) or self._derive_project_id(owner, fk_name)

                    # plan_case_record 通过 plan_case.plan 反查 workspace
                    if fk_name == "plan_case_record" and not workspace_id:
                        plan_case = getattr(owner, "plan_case", None)
                        plan = getattr(plan_case, "plan", None) if plan_case else None
                        workspace_id = getattr(plan, "workspace_id", None)

                    fk_kwargs = {}
                    if fk_name == "cycle":
                        fk_kwargs["cycle_id"] = owner.id
                    elif fk_name == "release":
                        fk_kwargs["release_id"] = owner.id
                    else:
                        fk_kwargs["plan_case_record_id"] = owner.id

                    old_key = (legacy.path or "") + (legacy.name or "")
                    raw_name = legacy.name or "file"
                    requested_name = _sanitize_filename(raw_name)
                    attrs = {
                        "name": raw_name,
                        "type": "application/octet-stream",
                        "size": int(legacy.size),
                    }
                    storage_meta = getattr(legacy, "storage_metadata", None) or {}
                    created_by_id = getattr(legacy, "created_by_id", None)

                    # 幂等：若已为该 owner + filename 建过 asset，则跳过创建
                    existing = FileAsset.objects.filter(
                        entity_type=entity_type,
                        filename=requested_name,
                        is_deleted=False,
                        **fk_kwargs,
                    ).first()
                    if existing is not None:
                        continue

                    if dry_run:
                        # 预演阶段不落库、不创建 path 节点，仅给出目标形态提示
                        self.stdout.write(
                            f"[dry-run] {LEGACY_FILE_BUCKET}/{old_key}  ->  {target_bucket}/<{label}>/{requested_name}"
                        )
                        stats["migrated"] += 1
                        continue

                    draft_asset = FileAsset(
                        id=uuid4(),
                        attributes=attrs,
                        size=int(legacy.size),
                        workspace_id=workspace_id,
                        project_id=project_id,
                        is_uploaded=True,
                        entity_type=entity_type,
                        storage_metadata=storage_meta,
                        created_by_id=created_by_id,
                        **fk_kwargs,
                    )
                    leaf = resolver.resolve_for_asset(draft_asset)
                    if leaf is None:
                        stats["skipped"] += 1
                        continue
                    extra = taken_in_batch.setdefault(leaf.pk, set())
                    new_filename = dedup_filename(
                        leaf.pk,
                        requested_name,
                        extra_taken=extra,
                    )
                    extra.add(new_filename)
                    new_key = compute_storage_key_for_path(leaf, new_filename)

                    try:
                        new_asset = self._create_legacy_fileasset_row(
                            asset_id=draft_asset.pk,
                            attributes=attrs,
                            filename=new_filename,
                            storage_key=new_key,
                            path_id=leaf.pk,
                            size=int(legacy.size),
                            workspace_id=workspace_id,
                            project_id=project_id,
                            entity_type=entity_type,
                            fk_kwargs=fk_kwargs,
                            storage_metadata=storage_meta,
                            created_by_id=created_by_id,
                        )
                    except Exception as exc:  # noqa: BLE001
                        stats["failed"] += 1
                        self.stdout.write(
                            self.style.ERROR(
                                f"[LegacyFile] 创建 FileAsset 失败 legacy={legacy.id} owner={owner.id}: {exc}"
                            )
                        )
                        continue

                    metadata = build_asset_metadata(new_asset)

                    if not self._copy(
                        s3_client, LEGACY_FILE_BUCKET, old_key, target_bucket, new_key,
                        metadata=metadata, content_type="application/octet-stream",
                    ):
                        new_asset.delete()
                        stats["failed"] += 1
                        continue

                    stats["migrated"] += 1

                    if not keep_old:
                        try:
                            s3_client.delete_object(Bucket=LEGACY_FILE_BUCKET, Key=old_key)
                        except ClientError as e:
                            self.stdout.write(self.style.WARNING(f"删除旧 File 对象失败 {old_key}: {e}"))

                if not dry_run and not keep_old:
                    try:
                        legacy.delete()
                    except Exception as exc:  # noqa: BLE001
                        self.stdout.write(self.style.WARNING(f"软删 File {legacy.id} 失败: {exc}"))

        for k, v in stats.items():
            self.stdout.write(self.style.SUCCESS(f"[LegacyFile] {k}: {v}"))

    @staticmethod
    def _derive_project_id(owner, fk_name):
        if fk_name == "plan_case_record":
            plan_case = getattr(owner, "plan_case", None)
            plan = getattr(plan_case, "plan", None) if plan_case else None
            return getattr(plan, "project_id", None)
        return getattr(owner, "project_id", None)

    # ------------------------------------------------------------------ entrypoint

    def handle(self, *args, **options):
        s3_client = _build_s3_client()
        bucket = options["unified_bucket"]
        dry_run = options["dry_run"]
        keep_old = options["keep_old"]
        entity_types = options["entity_type"]

        resolver = build_resolver(FilePathModel=FilePath)

        self.stdout.write(
            self.style.NOTICE(
                f"目标桶={bucket} dry_run={dry_run} keep_old={keep_old} "
                f"entity_types={entity_types}"
            )
        )

        if not options["skip_fileasset"]:
            self._migrate_fileassets(
                s3_client,
                bucket,
                dry_run=dry_run,
                keep_old=keep_old,
                entity_types=entity_types,
                resolver=resolver,
            )

        if not options["skip_legacy_file"]:
            self._migrate_legacy_files(
                s3_client,
                bucket,
                dry_run=dry_run,
                keep_old=keep_old,
                resolver=resolver,
            )

        self.stdout.write(self.style.SUCCESS("迁移命令执行完成"))
