"""第三步：删掉评审行上的成品 / 组件版本旧列，数据已在 0402 搬进子表。"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0402_backfill_stage_review_rows"),
    ]

    operations = [
        migrations.RemoveField(model_name="stagereview", name="akf_code"),
        migrations.RemoveField(model_name="stagereview", name="baseline_archive_code"),
        migrations.RemoveField(model_name="stagereview", name="component_version"),
        migrations.RemoveField(model_name="stagereview", name="components"),
        migrations.RemoveField(model_name="stagereview", name="product_config"),
        migrations.RemoveField(model_name="stagereview", name="production_quantity"),
    ]
