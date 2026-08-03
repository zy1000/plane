from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    """明细行加上「归属标准库」这条腿。

    整个改动拆成 0310/0311/0312 三步，是被 Postgres 逼的：同一个事务里对一张表先
    做 DML 再做 DDL 会报 pending trigger events。所以 0310 只动
    requirement_details 的结构，0311 只搬数据，0312 只动 requirements 的结构 ——
    正向与反向都不会在一个事务里把 DML 和 DDL 混在同一张表上。
    """

    dependencies = [
        ('db', '0309_requirement_library'),
    ]

    operations = [
        migrations.AlterField(
            model_name='requirementdetail',
            name='requirement',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='details', to='db.requirement', verbose_name='所属需求'),
        ),
        migrations.AddField(
            model_name='requirementdetail',
            name='library',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='items', to='db.requirementlibrary', verbose_name='所属需求标准库'),
        ),
        migrations.AddConstraint(
            model_name='requirementdetail',
            constraint=models.CheckConstraint(check=models.Q(models.Q(('library__isnull', True), ('requirement__isnull', False)), models.Q(('library__isnull', False), ('requirement__isnull', True)), _connector='OR'), name='requirement_detail_owner_exactly_one'),
        ),
        migrations.AddIndex(
            model_name='requirementdetail',
            index=models.Index(fields=['library', 'sort_order'], name='req_detail_library_sort'),
        ),
    ]
