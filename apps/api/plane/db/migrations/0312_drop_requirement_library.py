from django.db import migrations, models


class Migration(migrations.Migration):
    """0311 搬完数据后，这里才拆掉 requirement.library 这一层作用域。"""

    dependencies = [
        ('db', '0311_requirement_library_items_data'),
    ]

    operations = [
        # 作用域约束引用了 requirement.library 列，必须先删约束才能删列
        migrations.RemoveConstraint(
            model_name='requirement',
            name='requirement_scope_by_template',
        ),
        migrations.RemoveField(
            model_name='requirement',
            name='library',
        ),
        migrations.AddConstraint(
            model_name='requirement',
            constraint=models.CheckConstraint(check=models.Q(models.Q(('is_template', True), ('product__isnull', True), ('project__isnull', True)), models.Q(('is_template', False), models.Q(models.Q(('product__isnull', False), ('project__isnull', True)), models.Q(('product__isnull', True), ('project__isnull', False)), _connector='OR')), _connector='OR'), name='requirement_scope_by_template'),
        ),
    ]
