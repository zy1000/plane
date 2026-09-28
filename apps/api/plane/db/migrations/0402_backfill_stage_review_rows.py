"""第二步：把评审行上原来的单值搬进两张子表。

- 成品四列（AKF 编号 / 生产数量 / 产品配置 / 基线归档号）里只要有一列填过，就变成成品表
  的第一行；旧的「组件」列不属于成品，不搬；
- 组件版本那段文本按行拆开，每行按第一个冒号（全角 / 半角）切成「组件 / 版本」，
  没有冒号的整行落在「版本」里，超长截到 255。

软删的评审同样搬（历史模型是裸 Manager），恢复时数据还在。反向不做：多行压不回单值。
"""

import re

from django.db import migrations

SORT_ORDER_STEP = 10000
COLON = re.compile(r"[：:]")


def backfill(apps, schema_editor):
    StageReview = apps.get_model("db", "StageReview")
    FinishedGood = apps.get_model("db", "StageReviewFinishedGood")
    ComponentVersion = apps.get_model("db", "StageReviewComponentVersion")

    goods, versions = [], []
    rows = StageReview.objects.values(
        "id",
        "project_id",
        "workspace_id",
        "created_by_id",
        "deleted_at",
        "akf_code",
        "production_quantity",
        "product_config",
        "baseline_archive_code",
        "component_version",
    )
    for row in rows.iterator():
        base = {
            "stage_review_id": row["id"],
            "project_id": row["project_id"],
            "workspace_id": row["workspace_id"],
            "created_by_id": row["created_by_id"],
            "updated_by_id": row["created_by_id"],
            "deleted_at": row["deleted_at"],
        }
        if (
            row["akf_code"]
            or row["production_quantity"] is not None
            or row["product_config"]
            or row["baseline_archive_code"]
        ):
            goods.append(
                FinishedGood(
                    **base,
                    sort_order=SORT_ORDER_STEP,
                    akf_code=row["akf_code"],
                    production_quantity=row["production_quantity"],
                    product_config=row["product_config"],
                    baseline_archive_code=row["baseline_archive_code"],
                )
            )
        lines = [line.strip() for line in (row["component_version"] or "").splitlines()]
        for index, line in enumerate(line for line in lines if line):
            parts = COLON.split(line, maxsplit=1)
            component, version = (parts[0], parts[1]) if len(parts) == 2 else ("", line)
            versions.append(
                ComponentVersion(
                    **base,
                    sort_order=(index + 1) * SORT_ORDER_STEP,
                    component=component.strip()[:255],
                    version=version.strip()[:255],
                )
            )
    FinishedGood.objects.bulk_create(goods, batch_size=1000)
    ComponentVersion.objects.bulk_create(versions, batch_size=1000)


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0401_stage_review_row_tables"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
