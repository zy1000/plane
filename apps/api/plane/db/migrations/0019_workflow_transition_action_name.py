# 工作流流转加「操作名称」：详情页流转按钮上的文字，为空时界面用目标状态名

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0018_issue_product"),
    ]

    operations = [
        migrations.AddField(
            model_name="workflowtransition",
            name="action_name",
            field=models.CharField(blank=True, default="", max_length=64, verbose_name="操作名称"),
        ),
    ]
