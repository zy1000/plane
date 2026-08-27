# 字段分类（standard / data）退化成一个开关。
#
# 这个枚举从头到尾只回答一件事：字段进不进标准库（utils/requirement.py 的
# get_library_field_specs 是唯一执行点）。两值互斥、没有第三种可能，做成枚举只是
# 让「标准字段 / 数据字段」这两个术语多存在了一阵子。
#
# 开发期直接换列，不做值映射：show_in_library 默认 True，等价于原来的 standard。

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0334_requirement_status_axis"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="requirementfield",
            name="field_category",
        ),
        migrations.AddField(
            model_name="requirementfield",
            name="show_in_library",
            field=models.BooleanField(default=True, verbose_name="纳入标准库"),
        ),
    ]
