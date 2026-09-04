"""产品封面下线：软删存量封面资产行，再去掉 Product 上的两个封面列。

FileAsset.EntityTypeContext 里的 PRODUCT_COVER 成员已在模型层移除，存量行的
entity_type 字符串仍是 "PRODUCT_COVER"（TextChoices 无 DB 约束），软删后不会再被任何
接口取到。MinIO 上的对象刻意保留，便于回滚。
"""

from django.db import migrations
from django.utils import timezone


def soft_delete_product_cover_assets(apps, schema_editor):
    FileAsset = apps.get_model("db", "FileAsset")
    FileAsset.objects.filter(entity_type="PRODUCT_COVER", deleted_at__isnull=True).update(
        deleted_at=timezone.now()
    )


def noop(apps, schema_editor):
    """不反向恢复：软删时间戳丢了也不影响回滚后重新上传封面。"""


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0355_seed_project_code_dictionary"),
    ]

    operations = [
        migrations.RunPython(soft_delete_product_cover_assets, noop),
        migrations.RemoveField(model_name="product", name="cover_image"),
        migrations.RemoveField(model_name="product", name="cover_image_asset"),
    ]
