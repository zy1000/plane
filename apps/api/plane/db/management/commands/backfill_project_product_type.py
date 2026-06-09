# Django imports
from django.core.management.base import BaseCommand
from django.db.models import Q

# Module imports
from plane.db.models import Project

# KF 前缀与产品类型的映射（更具体的前缀放在前面优先匹配）
KF_PREFIX_RULES = (
    ("KF01P", "PLC"),
    ("KF01M", "wM-Bus"),
    ("KF01S", "RS485"),
    ("KF12", "电表"),
    ("KF14", "水表"),
    ("KF16", "气表"),
)

DEFAULT_PRODUCT_TYPE = "电表"


def classify_product_type(name):
    """根据项目名称推断 product_type。

    - 名称不含 "KF" -> 电表
    - 含 "KF" 时，从 "KF" 出现的位置开始按前缀匹配，命中即返回对应类型
    - 含 "KF" 但未命中任何前缀 -> 默认电表
    """
    text = (name or "").upper()
    idx = text.find("KF")
    if idx == -1:
        return DEFAULT_PRODUCT_TYPE

    segment = text[idx:]
    for prefix, product_type in KF_PREFIX_RULES:
        if segment.startswith(prefix):
            return product_type

    return DEFAULT_PRODUCT_TYPE


class Command(BaseCommand):
    help = (
        "补全 product_type 为空的项目数据（优先用 pms_project_name，其次用 name 推断）"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="只预览将要补全的结果，不写入数据库",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)

        # product_type 为空：NULL 或空字符串
        projects = Project.objects.filter(
            Q(product_type__isnull=True) | Q(product_type="")
        ).iterator()

        total = 0
        updated = 0
        skipped = 0
        to_update = []

        for project in projects:
            total += 1

            # 已有非空 product_type 的直接跳过（防御性判断，兼容仅含空白的情况）
            if (project.product_type or "").strip():
                skipped += 1
                continue

            source_name = (project.pms_project_name or "").strip() or (
                project.name or ""
            )
            product_type = classify_product_type(source_name)

            project.product_type = product_type
            to_update.append(project)
            updated += 1
            self.stdout.write(
                f"  {project.identifier} | {source_name} -> {product_type}"
            )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] 共扫描 {total} 个项目，将补全 {updated} 个，跳过 {skipped} 个（未写入数据库）"
                )
            )
            return

        if to_update:
            Project.objects.bulk_update(to_update, ["product_type"], batch_size=500)

        self.stdout.write(
            self.style.SUCCESS(
                f"完成：共扫描 {total} 个项目，补全 {updated} 个，跳过 {skipped} 个"
            )
        )
