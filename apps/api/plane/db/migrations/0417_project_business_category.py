# 项目「产品类型」废弃，换成「业务分类」（2026-10-21）：
# - 删 product_type（CharField choices），存量值不保留
# - 新增 business_category → 系统字典 project_business_category，取值由简道云「研发项目」同步

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0416_risk_jiandaoyun_sync"),
    ]

    operations = [
        migrations.RemoveField(model_name="project", name="product_type"),
        migrations.AddField(
            model_name="project",
            name="business_category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="projects_by_business_category",
                to="db.datadictionaryitem",
                verbose_name="业务分类",
            ),
        ),
    ]
