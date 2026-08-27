from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """产品需求「集合化」：明细行绑定需求模板，模板必有标题/描述两个内置字段。

    与 0310/0311/0312 同样拆成三步，原因一致 —— 同一个事务里对一张表先做 DML 再做
    DDL 会被 Postgres 判为 pending trigger events。0313 只加可空列与索引，0314 只搬
    数据，0315 才收紧成 NOT NULL 并加约束。
    """

    dependencies = [
        ("db", "0312_drop_requirement_library"),
    ]

    operations = [
        migrations.AddField(
            model_name="requirementfield",
            name="builtin_key",
            field=models.CharField(
                blank=True,
                choices=[("title", "标题"), ("description", "描述")],
                max_length=20,
                null=True,
                verbose_name="内置字段标识（null 表示普通自定义字段）",
            ),
        ),
        migrations.AddField(
            model_name="requirementchangerequest",
            name="proposed_fields",
            field=models.JSONField(
                blank=True, default=list, verbose_name="提交时冻结的字段树"
            ),
        ),
        migrations.AddField(
            model_name="requirementdetail",
            name="template",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_details",
                to="db.requirement",
                verbose_name="所属需求模板",
            ),
        ),
        migrations.AddField(
            model_name="requirementdraftdetail",
            name="template",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_draft_details",
                to="db.requirement",
                verbose_name="所属需求模板",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementdetail",
            index=models.Index(
                fields=["requirement", "template", "sort_order"],
                name="req_detail_req_template_sort",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementdraftdetail",
            index=models.Index(
                fields=["draft", "template", "sort_order"],
                name="req_draft_detail_template_sort",
            ),
        ),
    ]
