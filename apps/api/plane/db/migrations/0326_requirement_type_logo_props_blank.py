from django.db import migrations, models


class Migration(migrations.Migration):
    """logo_props 补上 blank=True。

    0323 加这个字段时只给了 default=dict。RequirementTypeSerializer 的
    create/update 会调 full_clean()，而 Django 对没有 blank=True 的字段把 {}
    判成「此字段不能为空」—— 于是不带图标创建需求类型一律 400。
    纯 state 变更，不产生任何 DDL。
    """

    dependencies = [("db", "0325_requirement_sequence_and_source")]

    operations = [
        migrations.AlterField(
            model_name="requirementtype",
            name="logo_props",
            field=models.JSONField(blank=True, default=dict, verbose_name="图标配置"),
        ),
    ]
