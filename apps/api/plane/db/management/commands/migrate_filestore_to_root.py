from __future__ import annotations

from django.core.management.base import BaseCommand

from plane.db.models import FileAsset
from plane.settings.storage import S3Storage
from plane.utils.asset_path import _sanitize_filename
from plane.utils.file_path import (
    build_resolver,
    dedup_filename,
    rebind_asset_to_path,
)


class Command(BaseCommand):
    help = (
        "将 PROJECT_FILESTORE 资产规整到 FILESTORE_ROOT 节点下。"
        "默认 dry-run，只打印迁移计划。\n\n"
        "分桶语义：\n"
        "  - noop                   已经挂在 FILESTORE_ROOT 上且 filename 非空，无操作；\n"
        "  - null_bound             path=NULL 且 is_uploaded=False（占位行），直接 bind 到 root；\n"
        "  - null_uploaded_skipped  path=NULL 且 is_uploaded=True：旧 S3 key 已不可知，仅警告不动；\n"
        "  - rebound                path 存在但不是 FILESTORE_ROOT，走 S3 copy + DB 改 path/filename；\n"
        "  - failed                 workspace 缺失或 rebind 物理失败。"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=True,
            help="仅打印迁移计划（默认开启）",
        )
        parser.add_argument(
            "--no-dry-run",
            action="store_false",
            dest="dry_run",
            help="执行真实迁移（copy + delete + 更新 path/filename）",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="每批处理条数（默认 200）",
        )

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        batch_size = int(options["batch_size"] or 200)

        resolver = build_resolver()
        storage = None if dry_run else S3Storage()

        queryset = FileAsset.objects.filter(
            entity_type=FileAsset.EntityTypeContext.PROJECT_FILESTORE,
            is_deleted=False,
        ).select_related(
            "workspace",
            "project",
            "path",
            "created_by",
        )

        # 五类分桶：见 Command.help。
        stats = {
            "checked": 0,
            "noop": 0,
            "null_bound": 0,
            "null_uploaded_skipped": 0,
            "rebound": 0,
            "failed": 0,
        }
        # 本次 run 在同一目标 path 下已分配的 filename，防止同批次撞名。
        taken_in_batch: dict[int, set] = {}

        self.stdout.write(
            self.style.NOTICE(
                f"开始执行 migrate_filestore_to_root dry_run={dry_run} batch_size={batch_size}"
            )
        )

        for asset in queryset.iterator(chunk_size=batch_size):
            stats["checked"] += 1
            try:
                new_leaf = resolver.resolve_for_asset(asset)
                if new_leaf is None:
                    # workspace 缺失，无法构造任何路径
                    self.stdout.write(
                        self.style.WARNING(
                            f"[asset={asset.id}] 无法 resolve FILESTORE_ROOT（workspace 缺失），跳过"
                        )
                    )
                    stats["failed"] += 1
                    continue

                # 1) 已经挂在 FILESTORE_ROOT 上且 filename 非空，完全跳过
                if asset.path_id == new_leaf.pk and (asset.filename or ""):
                    stats["noop"] += 1
                    continue

                # 2) path=NULL：分两类处理
                if asset.path_id is None:
                    if asset.is_uploaded:
                        # 历史 FileAsset.asset 列已在 0237 被 drop，旧 S3 key 已不可知。
                        # 直接绑 path=root 会让 FE 看到一个对应 S3 不存在的破损行；
                        # 这里仅警告，留给人工兜底。
                        self.stdout.write(
                            self.style.WARNING(
                                f"[asset={asset.id}] path=NULL is_uploaded=True 旧 S3 key 不可知，跳过；"
                                f"attributes={asset.attributes}"
                            )
                        )
                        stats["null_uploaded_skipped"] += 1
                        continue

                    # 未上传成功的占位行：直接 bind 到 FILESTORE_ROOT，不涉及 S3。
                    desired_name = asset.filename or _sanitize_filename(
                        (asset.attributes or {}).get("name") or "file"
                    )
                    extra_taken = taken_in_batch.setdefault(new_leaf.pk, set())
                    new_filename = dedup_filename(
                        new_leaf.pk,
                        desired_name,
                        exclude_asset_id=asset.pk,
                        extra_taken=extra_taken,
                    )
                    if dry_run:
                        self.stdout.write(
                            f"[dry-run] asset={asset.id} path=NULL -> root({new_leaf.pk}) "
                            f"filename='{new_filename}' (is_uploaded=False)"
                        )
                        stats["null_bound"] += 1
                        continue

                    # 用 update() 绕过 FileAsset.save() 钩子：避免 path=None 时 save
                    # 再次触发 resolve_path_for_asset 制造时序与并发问题。
                    FileAsset.objects.filter(pk=asset.pk).update(
                        path=new_leaf, filename=new_filename
                    )
                    extra_taken.add(new_filename)
                    stats["null_bound"] += 1
                    continue

                # 3) path 存在但不在 FILESTORE_ROOT：走 rebind 流程（S3 copy + DB 改 path/filename + 删旧）
                if dry_run:
                    desired_name = asset.filename or _sanitize_filename(
                        (asset.attributes or {}).get("name") or "file"
                    )
                    extra_taken = taken_in_batch.setdefault(new_leaf.pk, set())
                    new_filename = dedup_filename(
                        new_leaf.pk,
                        desired_name,
                        exclude_asset_id=asset.pk,
                        extra_taken=extra_taken,
                    )
                    extra_taken.add(new_filename)
                    self.stdout.write(
                        f"[dry-run] asset={asset.id} path={asset.path_id}->root({new_leaf.pk}) "
                        f"filename='{asset.filename}'->'{new_filename}'"
                    )
                    stats["rebound"] += 1
                    continue

                if rebind_asset_to_path(asset, storage=storage, resolver=resolver):
                    stats["rebound"] += 1
                else:
                    # rebind 在 key 不变但 path FK 不一致时也会修正 path（返回 False 但已落字段）
                    asset.refresh_from_db(fields=["path", "filename"])
                    if asset.path_id == new_leaf.pk and (asset.filename or ""):
                        stats["rebound"] += 1
                    else:
                        stats["failed"] += 1
            except Exception as exc:  # noqa: BLE001
                stats["failed"] += 1
                self.stdout.write(
                    self.style.ERROR(f"[asset={asset.id}] 迁移失败: {type(exc).__name__}: {exc}")
                )

        for key, value in stats.items():
            self.stdout.write(self.style.SUCCESS(f"{key}: {value}"))
