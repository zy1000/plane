# 选择字段的选项来源：字段库字段、类型字段各加一个指向数据字典的外键（空 = 手动维护）。
# 字典值冗余在 options.choices 里，同步逻辑见 plane/utils/dictionary_field.py。

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0003_product_external_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='issuefielddefinition',
            name='dictionary',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='issue_field_definitions', to='db.datadictionary'),
        ),
        migrations.AddField(
            model_name='typeextrafield',
            name='dictionary',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.RESTRICT, related_name='type_extra_fields', to='db.datadictionary'),
        ),
    ]
