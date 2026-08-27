from django.db import migrations, models


class Migration(migrations.Migration):
    """需求类型的内置字段布局（顺序 + 是否纳入标准库）。

    空列表即缺省（内置列恒在自定义字段之前、执行期四列不纳入库），存量类型行为
    零变化，不需要回填。
    """

    dependencies = [
        ("db", "0342_remove_requirement_req_unique_library_code_active_and_more")
    ]

    operations = [
        migrations.AddField(
            model_name="requirementtype",
            name="builtin_field_layout",
            field=models.JSONField(
                blank=True, default=list, verbose_name="内置字段布局"
            ),
        ),
    ]
