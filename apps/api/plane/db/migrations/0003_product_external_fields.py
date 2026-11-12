# 产品加外部来源标识：简道云「产品」表单同步来的产品按远端 _id 认（plane/integrations/product_sync.py）。
# 与 Project.external_source / external_id 同口径。

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0002_field_linkage_rules"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="external_source",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="external_id",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
