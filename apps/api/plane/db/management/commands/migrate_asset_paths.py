# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""一次性数据迁移命令：把历史 MinIO 对象搬运到统一的 ``uploads`` 桶下新路径。

适用场景：
  1. 历史 ``FileAsset`` 路径不规范（例如旧版本 ``{ws}/{uuid}-{name}``、平铺等），
     需要按 entity_type 重算 key 并复制到正式路径。
  2. 历史 ``File`` 模型（被 Cycle/Release/PlanCaseRecord 通过 M2M 引用）位于独立
     的 ``file`` 桶下，需要跨桶复制到 ``uploads`` 桶并新建对应 ``FileAsset`` 记录。

命令仅做幂等的 copy + DB 更新，原对象在不指定 ``--keep-old`` 时会被删除，确保
完成后所有路径均符合 :func:`plane.utils.asset_path.build_asset_key` 的规则。
"""

from __future__ import annotations

import os
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand

from plane.db.models import Cycle, FileAsset, PlanCaseRecord, Release, TestCase
from plane.db.models.asset import File
from plane.utils.asset_path import build_asset_key, is_temp_key


LEGACY_FILE_BUCKET = os.environ.get("LEGACY_FILE_BUCKET", "file")


def _build_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("AWS_S3_ENDPOINT_URL") or os.environ.get("MINIO_ENDPOINT_URL"),
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_REGION"),
        config=boto3.session.Config(signature_version="s3v4"),
    )


class Command(BaseCommand):
    help = "Migrate historical MinIO objects to the unified uploads bucket layout."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="只打印计划，不实际复制或更新数据库")
        parser.add_argument("--batch-size", type=int, default=200, help="每个事务批量处理的记录条数")
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

    # ------------------------------------------------------------------
    # FileAsset 路径迁移
    # ------------------------------------------------------------------

    def _migrate_fileassets(
        self,
        s3_client,
        bucket: str,
        *,
        dry_run: bool,
        keep_old: bool,
        batch_size: int,
        entity_types,
    ):
        qs = FileAsset.objects.filter(is_uploaded=True, is_deleted=False).exclude(asset__isnull=True).exclude(asset="")
        if entity_types:
            qs = qs.filter(entity_type__in=entity_types)

        total = qs.count()
        self.stdout.write(self.style.NOTICE(f"[FileAsset] 待检查记录 {total} 条"))

        stats = {"checked": 0, "skipped_same": 0, "skipped_temp": 0, "migrated": 0, "failed": 0}

        for offset in range(0, total, batch_size):
            for asset in qs[offset : offset + batch_size]:
                stats["checked"] += 1
                old_key = str(asset.asset)
                if not old_key:
                    continue
                if is_temp_key(old_key):
                    # temp 状态由 bulk endpoint 在绑定时迁移，这里不动
                    stats["skipped_temp"] += 1
                    continue

                try:
                    new_key = self._compute_new_key(asset)
                except ValueError as exc:
                    self.stdout.write(self.style.WARNING(f"[FileAsset {asset.id}] 跳过：{exc}"))
                    stats["failed"] += 1
                    continue

                if not new_key or new_key == old_key:
                    stats["skipped_same"] += 1
                    continue

                if dry_run:
                    self.stdout.write(f"[dry-run] {old_key}  ->  {new_key}")
                    stats["migrated"] += 1
                    continue

                if not self._copy(s3_client, bucket, old_key, bucket, new_key):
                    stats["failed"] += 1
                    continue

                FileAsset.objects.filter(pk=asset.pk).update(asset=new_key)
                stats["migrated"] += 1

                if not keep_old:
                    try:
                        s3_client.delete_object(Bucket=bucket, Key=old_key)
                    except ClientError as e:
                        self.stdout.write(self.style.WARNING(f"删除旧对象失败 {old_key}: {e}"))

        for k, v in stats.items():
            self.stdout.write(self.style.SUCCESS(f"[FileAsset] {k}: {v}"))

    def _compute_new_key(self, asset: FileAsset) -> Optional[str]:
        attrs = asset.attributes or {}
        filename = attrs.get("name") or os.path.basename(str(asset.asset)) or "file"

        project_id = asset.project_id
        case_repository_id: Optional[str] = None

        # CASE_ATTACHMENT 经 WorkspaceFileAssetEndpoint 上传时只填了 case_id，
        # 需通过 case -> repository 反查 project_id 与 repository_id，避免落入 temp。
        if asset.entity_type == FileAsset.EntityTypeContext.CASE_ATTACHMENT and asset.case_id:
            case = (
                TestCase.objects.filter(pk=asset.case_id)
                .select_related("repository")
                .only("id", "repository_id", "repository__project_id")
                .first()
            )
            if case:
                case_repository_id = str(case.repository_id) if case.repository_id else None
                if not project_id and case.repository_id:
                    project_id = case.repository.project_id

        # PROJECT_COVER 等场景下旧数据可能没填 project_id，但 entity_identifier 里
        # 实际记录的就是 project_id（绑定接口 put 时写入），用它兜底。
        if not project_id and asset.entity_identifier:
            project_id = asset.entity_identifier

        return build_asset_key(
            entity_type=asset.entity_type or "",
            filename=filename,
            workspace_id=str(asset.workspace_id) if asset.workspace_id else None,
            project_id=str(project_id) if project_id else None,
            user_id=str(asset.user_id) if asset.user_id else None,
            issue_id=str(asset.issue_id) if asset.issue_id else None,
            comment_id=str(asset.comment_id) if asset.comment_id else None,
            page_id=str(asset.page_id) if asset.page_id else None,
            draft_issue_id=str(asset.draft_issue_id) if asset.draft_issue_id else None,
            case_id=str(asset.case_id) if asset.case_id else None,
            case_repository_id=case_repository_id,
            cycle_id=str(asset.cycle_id) if asset.cycle_id else None,
            release_id=str(asset.release_id) if asset.release_id else None,
            plan_case_record_id=str(asset.plan_case_record_id) if asset.plan_case_record_id else None,
            asset_id=str(asset.id),
        )

    # ------------------------------------------------------------------
    # 旧 File 模型（cycle/release/plan_case_record）
    # ------------------------------------------------------------------

    def _migrate_legacy_files(
        self,
        s3_client,
        target_bucket: str,
        *,
        dry_run: bool,
        keep_old: bool,
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

                    # plan_case_record 通过 plan_case.plan 反查 workspace；若链路被删除，则视为孤儿
                    if fk_name == "plan_case_record" and not workspace_id:
                        plan_case = getattr(owner, "plan_case", None)
                        plan = getattr(plan_case, "plan", None) if plan_case else None
                        workspace_id = getattr(plan, "workspace_id", None)

                    fk_kwargs = {}
                    cycle_id = release_id = record_id = None
                    if fk_name == "cycle":
                        cycle_id = str(owner.id)
                        fk_kwargs["cycle_id"] = owner.id
                    elif fk_name == "release":
                        release_id = str(owner.id)
                        fk_kwargs["release_id"] = owner.id
                    else:
                        record_id = str(owner.id)
                        fk_kwargs["plan_case_record_id"] = owner.id

                    try:
                        new_key = build_asset_key(
                            entity_type=entity_type,
                            filename=legacy.name or "file",
                            workspace_id=str(workspace_id) if workspace_id else None,
                            project_id=str(project_id) if project_id else None,
                            cycle_id=cycle_id,
                            release_id=release_id,
                            plan_case_record_id=record_id,
                        )
                    except ValueError as exc:
                        self.stdout.write(self.style.WARNING(f"[LegacyFile {legacy.id}] 跳过：{exc}"))
                        stats["skipped"] += 1
                        continue

                    old_key = (legacy.path or "") + (legacy.name or "")

                    if dry_run:
                        self.stdout.write(f"[dry-run] {LEGACY_FILE_BUCKET}/{old_key}  ->  {target_bucket}/{new_key}")
                        stats["migrated"] += 1
                        continue

                    if not self._copy(s3_client, LEGACY_FILE_BUCKET, old_key, target_bucket, new_key):
                        stats["failed"] += 1
                        continue

                    FileAsset.objects.create(
                        attributes={"name": legacy.name, "type": "application/octet-stream", "size": int(legacy.size)},
                        asset=new_key,
                        size=int(legacy.size),
                        workspace_id=workspace_id,
                        project_id=project_id,
                        is_uploaded=True,
                        entity_type=entity_type,
                        **fk_kwargs,
                    )
                    stats["migrated"] += 1

                    if not keep_old:
                        try:
                            s3_client.delete_object(Bucket=LEGACY_FILE_BUCKET, Key=old_key)
                        except ClientError as e:
                            self.stdout.write(self.style.WARNING(f"删除旧 File 对象失败 {old_key}: {e}"))

                if not dry_run and not keep_old:
                    # 使用软删除（BaseModel.delete 会写 deleted_at）
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

    def _copy(self, s3_client, src_bucket: str, src_key: str, dst_bucket: str, dst_key: str) -> bool:
        try:
            s3_client.copy_object(
                Bucket=dst_bucket,
                CopySource={"Bucket": src_bucket, "Key": src_key},
                Key=dst_key,
            )
            return True
        except ClientError as e:
            self.stdout.write(self.style.ERROR(f"复制失败 {src_bucket}/{src_key} -> {dst_bucket}/{dst_key}: {e}"))
            return False

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        s3_client = _build_s3_client()
        bucket = options["unified_bucket"]
        dry_run = options["dry_run"]
        keep_old = options["keep_old"]
        batch_size = options["batch_size"]
        entity_types = options["entity_type"]

        self.stdout.write(
            self.style.NOTICE(
                f"目标桶={bucket} dry_run={dry_run} keep_old={keep_old} batch_size={batch_size} entity_types={entity_types}"
            )
        )

        if not options["skip_fileasset"]:
            self._migrate_fileassets(
                s3_client,
                bucket,
                dry_run=dry_run,
                keep_old=keep_old,
                batch_size=batch_size,
                entity_types=entity_types,
            )

        if not options["skip_legacy_file"]:
            self._migrate_legacy_files(
                s3_client,
                bucket,
                dry_run=dry_run,
                keep_old=keep_old,
            )

        self.stdout.write(self.style.SUCCESS("迁移命令执行完成"))
