# 需求 ↔ 工作项从一对多放宽为多对多。
#
# 之前唯一约束落在 issue 单列（一条工作项至多挂一条需求），现在改成
# (requirement, issue) 复合唯一（软删条件唯一），与 RequirementCycle /
# RequirementRelease / RequirementTestCase 同构。related_name 一并从单数
# issue_requirement 改成 issue_requirements —— 对 DB 是 no-op，但迁移状态必须跟上。
#
# 方向是「收紧 → 放宽」：老数据不可能违反新约束，无需数据迁移，也不会有冲突行。
# 由 makemigrations 生成，未手工改动操作顺序。

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0337_requirement_priority_labels'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='requirementissue',
            name='requirement_issue_unique_issue_when_deleted_at_null',
        ),
        migrations.AlterUniqueTogether(
            name='requirementissue',
            unique_together=set(),
        ),
        migrations.AlterField(
            model_name='requirementissue',
            name='issue',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='issue_requirements', to='db.issue', verbose_name='关联工作项'),
        ),
        migrations.AlterUniqueTogether(
            name='requirementissue',
            unique_together={('requirement', 'issue', 'deleted_at')},
        ),
        migrations.AddConstraint(
            model_name='requirementissue',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('requirement', 'issue'), name='requirement_issue_unique_when_deleted_at_null'),
        ),
    ]
