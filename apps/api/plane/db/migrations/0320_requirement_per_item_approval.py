import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """审批单位从「整条基线」下沉到「每一条需求」。

    新增：
      RequirementApprovalPolicy     —— 原 RequirementBaseline 去掉 status / current_version
      RequirementTypeSchemaRevision —— 字段结构的不可变修订链（变更轨迹 + 历史版本渲染）
      Requirement 的三列           —— approved_version / approved_row_version /
                                       pending_change_item

    RequirementChangeItem.schema_revision、base_row_version 与 RequirementVersion 的
    requirement_type / schema_revision 都是无 default 的 NOT NULL：0319 已保证这两张表
    为空，有残留行时会在 ALTER 处直接报错，而不是悄悄补一个没有意义的默认值。

    基线的新语义（一组 (需求, 版本) 的不可变命名快照）属于第二阶段，这里不建。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0319_requirement_drop_baseline_approval"),
    ]

    operations = [
        migrations.CreateModel(
            name="RequirementApprovalPolicy",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                (
                    "approval_type",
                    models.CharField(
                        choices=[("any", "任一人通过"), ("all", "全部通过"), ("n_of_m", "至少 N 人通过")],
                        default="any",
                        max_length=10,
                        verbose_name="审批通过规则",
                    ),
                ),
                (
                    "required_count",
                    models.PositiveSmallIntegerField(blank=True, null=True, verbose_name="最少通过人数（仅 N_OF_M 模式生效）"),
                ),
            ],
            options={
                "db_table": "requirement_approval_policies",
                "ordering": ("-updated_at",),
            },
        ),
        migrations.CreateModel(
            name="RequirementTypeSchemaRevision",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("revision", models.PositiveIntegerField(verbose_name="类型内自增修订号")),
                ("fields", models.JSONField(verbose_name="本次修订之后的完整字段树")),
                ("diff", models.JSONField(blank=True, default=list, verbose_name="相对上一修订的差异")),
            ],
            options={
                "db_table": "requirement_type_schema_revisions",
                "ordering": ("-revision",),
            },
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="created_by",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By"),
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="updated_by",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By"),
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="owner",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="owned_requirement_approval_policies", to=settings.AUTH_USER_MODEL, verbose_name="负责人"),
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="product",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="requirement_approval_policies", to="db.product", verbose_name="所属产品"),
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="project",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="requirement_approval_policies", to="db.project", verbose_name="所属项目"),
        ),
        migrations.AddField(
            model_name="requirementapprovalpolicy",
            name="workspace",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="requirement_approval_policies", to="db.workspace", verbose_name="所属工作区"),
        ),
        migrations.AddField(
            model_name="requirementtypeschemarevision",
            name="created_by",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_created_by", to=settings.AUTH_USER_MODEL, verbose_name="Created By"),
        ),
        migrations.AddField(
            model_name="requirementtypeschemarevision",
            name="updated_by",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_updated_by", to=settings.AUTH_USER_MODEL, verbose_name="Last Modified By"),
        ),
        migrations.AddField(
            model_name="requirementtypeschemarevision",
            name="requirement_type",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="schema_revisions", to="db.requirementtype", verbose_name="所属需求类型"),
        ),
        migrations.AddField(
            model_name="requirementtype",
            name="current_schema_revision",
            field=models.PositiveIntegerField(default=0, verbose_name="当前字段结构修订号（0 表示尚未产生修订）"),
        ),
        migrations.AddField(
            model_name="requirementapprover",
            name="policy",
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.CASCADE, related_name="approvers", to="db.requirementapprovalpolicy", verbose_name="所属审批配置"),
            preserve_default=False,
        ),
        # --- 需求行上的审批态三列 ---
        migrations.AddField(
            model_name="requirement",
            name="approved_version",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="最后一次通过审批的版本号（null 表示从未通过审批）"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="approved_row_version",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="通过审批那一刻的 version 值"),
        ),
        migrations.AddField(
            model_name="requirement",
            name="pending_change_item",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="db.requirementchangeitem", verbose_name="待审批的变更项（null 表示不在评审中）"),
        ),
        migrations.AlterField(
            model_name="requirement",
            name="version",
            field=models.PositiveIntegerField(default=1, verbose_name="乐观锁计数（每次写入 +1）"),
        ),
        # --- 变更项 ---
        migrations.AddField(
            model_name="requirementchangeitem",
            name="requirement_type",
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.PROTECT, related_name="change_items", to="db.requirementtype", verbose_name="所属需求类型"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementchangeitem",
            name="schema_revision",
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.PROTECT, related_name="change_items", to="db.requirementtypeschemarevision", verbose_name="提交时的字段结构修订"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementchangeitem",
            name="base_row_version",
            field=models.PositiveIntegerField(default=1, verbose_name="提交时的 version 乐观锁值"),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="requirementchangeitem",
            name="base_version",
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name="提交时的 approved_version（新增时为空）"),
        ),
        migrations.AlterField(
            model_name="requirementchangeitem",
            name="target_id",
            field=models.UUIDField(db_index=True, verbose_name="目标需求 ID"),
        ),
        # --- 变更单 ---
        migrations.AlterField(
            model_name="requirementchangerequest",
            name="sequence_id",
            field=models.PositiveIntegerField(default=1, verbose_name="作用域内自增序号（用于展示 CR-001）"),
        ),
        # --- 版本 ---
        migrations.AddField(
            model_name="requirementversion",
            name="requirement_type",
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.PROTECT, related_name="versions", to="db.requirementtype", verbose_name="所属需求类型"),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementversion",
            name="schema_revision",
            field=models.ForeignKey(default=None, on_delete=django.db.models.deletion.PROTECT, related_name="versions", to="db.requirementtypeschemarevision", verbose_name="本版对应的字段结构修订"),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="requirementversion",
            name="target_id",
            field=models.UUIDField(db_index=True, verbose_name="需求 ID"),
        ),
        migrations.AlterField(
            model_name="requirementversion",
            name="snapshot",
            field=models.JSONField(verbose_name="行内容快照"),
        ),
        # --- 索引 ---
        migrations.AddIndex(
            model_name="requirement",
            index=models.Index(condition=models.Q(("pending_change_item__isnull", False)), fields=["pending_change_item"], name="req_pending_change_item"),
        ),
        migrations.AddIndex(
            model_name="requirementchangeitem",
            index=models.Index(fields=["change_request", "proposed_sort_order"], name="req_change_item_request_sort"),
        ),
        migrations.AddIndex(
            model_name="requirementchangeitem",
            index=models.Index(fields=["target_id", "-created_at"], name="req_change_item_target_time"),
        ),
        migrations.AddIndex(
            model_name="requirementchangeitem",
            index=models.Index(fields=["change_request", "requirement_type"], name="req_change_item_request_type"),
        ),
        migrations.AddIndex(
            model_name="requirementchangerequest",
            index=models.Index(fields=["product", "-created_at"], name="req_change_product_created"),
        ),
        migrations.AddIndex(
            model_name="requirementchangerequest",
            index=models.Index(fields=["project", "-created_at"], name="req_change_project_created"),
        ),
        migrations.AddIndex(
            model_name="requirementversion",
            index=models.Index(fields=["target_id", "-version"], name="req_version_target_version"),
        ),
        migrations.AddIndex(
            model_name="requirementtypeschemarevision",
            index=models.Index(fields=["requirement_type", "created_at"], name="req_schema_revision_type_time"),
        ),
        # --- 约束 ---
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("approved_row_version__isnull", True), ("approved_version__isnull", True)),
                    models.Q(("approved_row_version__isnull", False), ("approved_version__isnull", False)),
                    _connector="OR",
                ),
                name="req_approved_version_pair_consistent",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(("approved_version__isnull", True), ("status", "draft"))
                | (models.Q(("approved_version__isnull", False)) & ~models.Q(("status", "draft"))),
                name="req_draft_status_iff_never_approved",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("library__isnull", True),
                    models.Q(
                        ("approved_version__isnull", True),
                        ("library__isnull", False),
                        ("pending_change_item__isnull", True),
                        ("status", "draft"),
                    ),
                    _connector="OR",
                ),
                name="req_library_item_never_approved",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprover",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("policy", "approver"),
                name="req_approver_unique_policy_approver_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementchangerequest",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("product__isnull", False)),
                fields=("product", "sequence_id"),
                name="req_change_unique_product_sequence_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementchangerequest",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("project__isnull", False)),
                fields=("project", "sequence_id"),
                name="req_change_unique_project_sequence_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementversion",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("target_id", "version"),
                name="req_version_unique_target_version_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementtypeschemarevision",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("requirement_type", "revision"),
                name="req_schema_revision_unique_type_revision",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprovalpolicy",
            constraint=models.CheckConstraint(
                check=models.Q(("product__isnull", False), ("project__isnull", True))
                | models.Q(("product__isnull", True), ("project__isnull", False)),
                name="req_policy_scope_exactly_one",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprovalpolicy",
            constraint=models.CheckConstraint(
                check=models.Q(("approval_type", "n_of_m"), ("required_count__gte", 1))
                | (~models.Q(("approval_type", "n_of_m")) & models.Q(("required_count__isnull", True))),
                name="req_policy_required_count_consistent",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprovalpolicy",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("product__isnull", False)),
                fields=("product",),
                name="req_policy_unique_product_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprovalpolicy",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True), ("project__isnull", False)),
                fields=("project",),
                name="req_policy_unique_project_active",
            ),
        ),
    ]
