# 需求 ↔ 测试用例关联表。继承 BaseModel 而非 ProjectBaseModel，所以没有 project
# 列，只有 workspace —— 原因见 db/models/requirement.py 的 RequirementTestCase。

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0335_requirement_field_show_in_library'),
    ]

    operations = [
        migrations.CreateModel(
            name='RequirementTestCase',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('case', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='case_requirements', to='db.testcase', verbose_name='关联测试用例')),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('requirement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='requirement_test_cases', to='db.requirement', verbose_name='关联需求')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace', verbose_name='工作区')),
            ],
            options={
                'verbose_name': 'Requirement Test Case',
                'verbose_name_plural': 'Requirement Test Cases',
                'db_table': 'requirement_test_cases',
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddConstraint(
            model_name='requirementtestcase',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('requirement', 'case'), name='requirement_test_case_unique_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='requirementtestcase',
            unique_together={('requirement', 'case', 'deleted_at')},
        ),
    ]
