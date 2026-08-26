import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

BACKFILL_BATCH_SIZE = 500


def backfill_product_fields(apps, schema_editor):
    """code ← name；start_date ← created_at 的日期；两位负责人 ← owner。

    六个字典字段留空：此时用户还没录任何字典值，前端在下次编辑时强制补齐。
    历史 Manager 看得见软删行，一起回填 —— 条件唯一只看未软删行，name 在未软删行内已唯一，不会撞。
    """
    Product = apps.get_model("db", "Product")
    pending = []
    for row in Product.objects.order_by("created_at", "id").iterator():
        # name 为空的极端行回落 identifier，别撞 product_code_not_blank
        row.code = (row.name or "").strip() or row.identifier
        row.start_date = row.created_at.date() if row.created_at else None
        row.project_lead_id = row.owner_id
        row.test_lead_id = row.owner_id
        pending.append(row)
        if len(pending) >= BACKFILL_BATCH_SIZE:
            Product.objects.bulk_update(
                pending, ["code", "start_date", "project_lead", "test_lead"]
            )
            pending = []
    if pending:
        Product.objects.bulk_update(
            pending, ["code", "start_date", "project_lead", "test_lead"]
        )


class Migration(migrations.Migration):
    """产品扩展字段：代号 / 字典类字段 / 启动日期 / 负责人 / 型号 / 阶段关闭日期。

    NOT NULL 的 code 加到已有表：AddField 带 default="" + preserve_default=False，
    随后 RunPython 回填，最后才 AddConstraint —— 三步必须同序，先加约束会让存量行全撞空串。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0346_data_dictionary"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="code",
            field=models.CharField(default="", max_length=255, verbose_name="产品代号"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="product",
            name="stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_stage",
                to="db.datadictionaryitem",
                verbose_name="产品阶段",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="category",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_category",
                to="db.datadictionaryitem",
                verbose_name="产品类别",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="status",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_status",
                to="db.datadictionaryitem",
                verbose_name="产品状态",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="hardware_level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_hardware_level",
                to="db.datadictionaryitem",
                verbose_name="硬件研发等级",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="structure_level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_structure_level",
                to="db.datadictionaryitem",
                verbose_name="结构研发等级",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="software_level",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="products_by_software_level",
                to="db.datadictionaryitem",
                verbose_name="软件研发等级",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="start_date",
            field=models.DateField(blank=True, null=True, verbose_name="启动日期"),
        ),
        migrations.AddField(
            model_name="product",
            name="project_lead",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="project_lead_products",
                to=settings.AUTH_USER_MODEL,
                verbose_name="项目负责人",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="test_lead",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="test_lead_products",
                to=settings.AUTH_USER_MODEL,
                verbose_name="测试负责人",
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="model_number",
            field=models.CharField(
                blank=True, max_length=255, null=True, verbose_name="产品型号"
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="external_model",
            field=models.CharField(
                blank=True, max_length=255, null=True, verbose_name="外部型号"
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="o_phase_close_date",
            field=models.DateField(blank=True, null=True, verbose_name="O阶段关闭日期"),
        ),
        migrations.AddField(
            model_name="product",
            name="v_phase_close_date",
            field=models.DateField(blank=True, null=True, verbose_name="V阶段关闭日期"),
        ),
        migrations.RunPython(
            backfill_product_fields, migrations.RunPython.noop, elidable=True
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("code", "workspace"),
                name="product_unique_code_workspace_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.CheckConstraint(
                check=models.Q(("code", ""), _negated=True),
                name="product_code_not_blank",
            ),
        ),
    ]
