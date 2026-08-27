from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


DRAFT_MIGRATION_BATCH_SIZE = 500


def _normalize_legacy_changing_status(apps, schema_editor):
    """`changing` 已从枚举删除 —— 变更审批期间复用 `in_review`。

    历史上该状态没有任何流程会写入，这里只是防御性归一。
    """
    Requirement = apps.get_model("db", "Requirement")
    Requirement.objects.filter(status="changing").update(status="published")


def _backfill_change_request_sequence(apps, schema_editor):
    """按需求内创建顺序回填 sequence_id，供后面的唯一约束落地。"""
    RequirementChangeRequest = apps.get_model("db", "RequirementChangeRequest")
    pending = []
    current_requirement_id = None
    sequence = 0

    queryset = RequirementChangeRequest.objects.order_by(
        "requirement_id", "created_at", "id"
    )
    for change_request in queryset.iterator():
        if change_request.requirement_id != current_requirement_id:
            current_requirement_id = change_request.requirement_id
            sequence = 0
        sequence += 1
        change_request.sequence_id = sequence
        pending.append(change_request)
        if len(pending) >= DRAFT_MIGRATION_BATCH_SIZE:
            RequirementChangeRequest.objects.bulk_update(pending, ["sequence_id"])
            pending = []
    if pending:
        RequirementChangeRequest.objects.bulk_update(pending, ["sequence_id"])


def _backfill_current_version(apps, schema_editor):
    Requirement = apps.get_model("db", "Requirement")
    RequirementVersion = apps.get_model("db", "RequirementVersion")

    latest_versions = (
        RequirementVersion.objects.filter(
            target_kind="requirement",
            deleted_at__isnull=True,
            requirement__isnull=False,
        )
        .values("requirement_id")
        .annotate(latest=models.Max("version"))
    )
    for row in latest_versions:
        Requirement.objects.filter(id=row["requirement_id"]).update(
            current_version=row["latest"]
        )


def _noop_reverse(apps, schema_editor):
    """回滚时不需要复原：以上都是补字段与归一化，正式表内容未被破坏性改写。"""


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0307_alter_requirementfield_field_type'),
    ]

    operations = [
        migrations.CreateModel(
            name='RequirementDraft',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('base_version', models.PositiveIntegerField(blank=True, null=True, verbose_name='基准版本号（null 表示首次发布草稿）')),
                ('snapshot', models.JSONField(blank=True, default=dict, verbose_name='草稿快照（meta + 字段定义）')),
            ],
            options={
                'db_table': 'requirement_drafts',
                'ordering': ('-updated_at',),
            },
        ),
        migrations.CreateModel(
            name='RequirementDraftDetail',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('data', models.JSONField(blank=True, default=dict, verbose_name='明细数据')),
                ('sort_order', models.FloatField(default=65535, verbose_name='排序')),
                ('version', models.PositiveIntegerField(default=1, verbose_name='当前版本')),
            ],
            options={
                'db_table': 'requirement_draft_details',
                'ordering': ('sort_order', 'created_at', 'id'),
            },
        ),
        migrations.AlterModelOptions(
            name='requirementchangeitem',
            options={'ordering': ('proposed_sort_order', 'created_at', 'id')},
        ),
        migrations.AddField(
            model_name='requirement',
            name='current_version',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='当前已发布版本号（null 表示从未发布）'),
        ),
        migrations.AddField(
            model_name='requirementchangeitem',
            name='target_kind',
            field=models.CharField(choices=[('requirement', '基本信息'), ('detail_data', '明细数据'), ('schema', '字段定义')], default='detail_data', max_length=20, verbose_name='变更目标类型'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='base_version',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='基准版本号（null 表示首次发布）'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='created_count',
            field=models.PositiveIntegerField(default=0, verbose_name='新增项数'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='changed_field_ids',
            field=models.JSONField(blank=True, default=list, verbose_name='本次变更涉及的字段 ID（供「仅显示变化列」使用）'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='deleted_count',
            field=models.PositiveIntegerField(default=0, verbose_name='删除项数'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='request_kind',
            field=models.CharField(choices=[('initial_publish', '首次发布'), ('change', '变更')], default='change', max_length=20, verbose_name='变更单类型（仅用于展示与统计）'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='sequence_id',
            field=models.PositiveIntegerField(default=1, verbose_name='需求内自增序号（用于展示 CR-001）'),
        ),
        migrations.AddField(
            model_name='requirementchangerequest',
            name='updated_count',
            field=models.PositiveIntegerField(default=0, verbose_name='修改项数'),
        ),
        migrations.AlterField(
            model_name='requirement',
            name='status',
            field=models.CharField(choices=[('draft', '草稿'), ('in_review', '评审中'), ('published', '已发布')], db_index=True, default='draft', max_length=30, verbose_name='需求状态'),
        ),
        migrations.AlterField(
            model_name='requirementchangerequest',
            name='target_kind',
            field=models.CharField(choices=[('requirement', '基本信息'), ('detail_data', '明细数据'), ('schema', '字段定义')], max_length=20, verbose_name='变更目标类型'),
        ),
        migrations.AlterField(
            model_name='requirementversion',
            name='target_kind',
            field=models.CharField(choices=[('requirement', '基本信息'), ('detail_data', '明细数据'), ('schema', '字段定义')], max_length=20, verbose_name='版本目标类型'),
        ),
        migrations.AddIndex(
            model_name='requirementchangeitem',
            index=models.Index(fields=['change_request', 'target_kind', 'proposed_sort_order'], name='req_change_item_request_kind'),
        ),
        migrations.AddIndex(
            model_name='requirementchangerequest',
            index=models.Index(fields=['requirement', '-created_at'], name='req_change_requirement_created'),
        ),
        migrations.RunPython(
            _normalize_legacy_changing_status,
            _noop_reverse,
            elidable=True,
        ),
        migrations.RunPython(
            _backfill_current_version,
            _noop_reverse,
            elidable=True,
        ),
        # sequence_id 必须先按需求内顺序回填，唯一约束才能落地
        migrations.RunPython(
            _backfill_change_request_sequence,
            _noop_reverse,
            elidable=True,
        ),
        migrations.AddConstraint(
            model_name='requirementchangerequest',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('requirement', 'sequence_id'), name='req_change_unique_requirement_sequence_active'),
        ),
        migrations.AddField(
            model_name='requirementdraftdetail',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='requirementdraftdetail',
            name='draft',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='details', to='db.requirementdraft', verbose_name='所属草稿'),
        ),
        migrations.AddField(
            model_name='requirementdraftdetail',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='created_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='product',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='requirement_drafts', to='db.product', verbose_name='所属产品'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='project',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='requirement_drafts', to='db.project', verbose_name='所属项目'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='requirement',
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='draft', to='db.requirement', verbose_name='所属需求'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='updated_by',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By'),
        ),
        migrations.AddField(
            model_name='requirementdraft',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='requirement_drafts', to='db.workspace', verbose_name='所属工作区'),
        ),
        migrations.AddIndex(
            model_name='requirementdraftdetail',
            index=models.Index(fields=['draft', 'sort_order'], name='req_draft_detail_draft_sort'),
        ),
    ]
