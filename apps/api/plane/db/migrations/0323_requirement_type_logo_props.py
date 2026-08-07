from django.db import migrations, models


class Migration(migrations.Migration):
    """需求类型的图标配置，形状与 IssueType.logo_props 一致。

    存量行落成 {}，前端按缺省图标渲染，所以不需要数据迁移。
    """

    dependencies = [
        ('db', '0322_requirement_baseline_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='requirementtype',
            name='logo_props',
            field=models.JSONField(default=dict, verbose_name='图标配置'),
        ),
    ]
