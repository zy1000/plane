import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """把「需求集合」拆掉：Requirement 变成需求条目本身，审批上移到 RequirementBaseline。

    纯结构迁移，不搬数据。旧的 requirements 表是集合层，新的 requirements 表是
    原来的 requirement_details，两者之间没有值的连续性，所以直接删表重建 ——
    有数据时 DeleteModel 会因外键或残留行直接失败，而不是静默写脏。

    因此以下表都必须为空：
      requirements / requirement_details / requirement_draft_details /
      requirement_drafts / requirement_approvers / requirement_change_requests /
      requirement_change_items / requirement_change_approvals / requirement_versions

    另注意 requirement_drafts / requirement_change_items / requirement_versions 的
    JSON 列内嵌了 "requirement" 与 "details" 两个 key（现在叫 "baseline" 与
    "requirements"），改名同样没有迁移兜底。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0316_requirement_type"),
    ]

    operations = [
        # 1) 先摘掉引用待删列的索引与约束
        migrations.RemoveIndex(
            model_name="requirementchangerequest",
            name="req_change_requirement_created",
        ),
        migrations.RemoveConstraint(
            model_name="requirementchangerequest",
            name="req_change_unique_requirement_sequence_active",
        ),
        migrations.RemoveConstraint(
            model_name="requirementapprover",
            name="req_approver_unique_requirement_approver_active",
        ),
        # 2) 丢掉指向旧 Requirement 的外键
        migrations.RemoveField(model_name="requirementapprover", name="requirement"),
        migrations.RemoveField(
            model_name="requirementchangerequest", name="requirement"
        ),
        migrations.RemoveField(model_name="requirementversion", name="requirement"),
        migrations.RemoveField(model_name="requirementdraft", name="requirement"),
        # 3) 删掉旧模型（表必须为空）
        migrations.DeleteModel(name="RequirementDetail"),
        migrations.DeleteModel(name="RequirementDraftDetail"),
        migrations.DeleteModel(name="Requirement"),
        # 4) 新的基线层
        migrations.CreateModel(
            name="RequirementBaseline",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "草稿"),
                            ("in_review", "评审中"),
                            ("published", "已发布"),
                        ],
                        db_index=True,
                        default="draft",
                        max_length=30,
                        verbose_name="基线状态",
                    ),
                ),
                (
                    "approval_type",
                    models.CharField(
                        choices=[
                            ("any", "任一人通过"),
                            ("all", "全部通过"),
                            ("n_of_m", "至少 N 人通过"),
                        ],
                        default="any",
                        max_length=10,
                        verbose_name="审批通过规则",
                    ),
                ),
                (
                    "required_count",
                    models.PositiveSmallIntegerField(
                        blank=True,
                        null=True,
                        verbose_name="最少通过人数（仅 N_OF_M 模式生效）",
                    ),
                ),
                (
                    "current_version",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        verbose_name="当前已发布版本号（null 表示从未发布）",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "owner",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="owned_requirement_baselines",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="负责人",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_baselines",
                        to="db.product",
                        verbose_name="所属产品",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_baselines",
                        to="db.project",
                        verbose_name="所属项目",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_baselines",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "db_table": "requirement_baselines",
                "ordering": ("-updated_at",),
            },
        ),
        # 5) 新的需求条目层（复用 requirements 表名）
        migrations.CreateModel(
            name="Requirement",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        blank=True, default="", max_length=255, verbose_name="需求标题"
                    ),
                ),
                (
                    "description_html",
                    models.TextField(blank=True, null=True, verbose_name="需求描述 HTML"),
                ),
                (
                    "data",
                    models.JSONField(blank=True, default=dict, verbose_name="自定义字段数据"),
                ),
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                ("version", models.PositiveIntegerField(default=1, verbose_name="当前版本")),
                (
                    "last_changed_version",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        verbose_name="最后一次发生变更的基线版本号（null 表示尚未随基线发布过）",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "library",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="db.requirementlibrary",
                        verbose_name="所属需求标准库",
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirements",
                        to="db.product",
                        verbose_name="所属产品",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirements",
                        to="db.project",
                        verbose_name="所属项目",
                    ),
                ),
                (
                    "requirement_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="requirements",
                        to="db.requirementtype",
                        verbose_name="所属需求类型",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirements",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "db_table": "requirements",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        # 6) 草稿行
        migrations.CreateModel(
            name="RequirementDraftRow",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                (
                    "title",
                    models.CharField(
                        blank=True, default="", max_length=255, verbose_name="需求标题"
                    ),
                ),
                (
                    "description_html",
                    models.TextField(blank=True, null=True, verbose_name="需求描述 HTML"),
                ),
                (
                    "data",
                    models.JSONField(blank=True, default=dict, verbose_name="自定义字段数据"),
                ),
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                ("version", models.PositiveIntegerField(default=1, verbose_name="当前版本")),
                (
                    "last_changed_version",
                    models.PositiveIntegerField(
                        blank=True,
                        null=True,
                        verbose_name="最后一次发生变更的基线版本号",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="%(class)s_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "draft",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rows",
                        to="db.requirementdraft",
                        verbose_name="所属草稿",
                    ),
                ),
                (
                    "requirement_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="draft_rows",
                        to="db.requirementtype",
                        verbose_name="所属需求类型",
                    ),
                ),
            ],
            options={
                "db_table": "requirement_draft_rows",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        # 7) 把四个外键以 baseline 加回来（空表，直接 NOT NULL / nullable 按模型定义）
        migrations.AddField(
            model_name="requirementapprover",
            name="baseline",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="approvers",
                to="db.requirementbaseline",
                verbose_name="所属基线",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementchangerequest",
            name="baseline",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="change_requests",
                to="db.requirementbaseline",
                verbose_name="目标基线",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementdraft",
            name="baseline",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="draft",
                to="db.requirementbaseline",
                verbose_name="所属基线",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementversion",
            name="baseline",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="versions",
                to="db.requirementbaseline",
                verbose_name="所属基线",
            ),
        ),
        # 8) target_kind 的取值集合变了（requirement 现在指条目，meta 组改叫 baseline）
        migrations.AlterField(
            model_name="requirementchangeitem",
            name="target_kind",
            field=models.CharField(
                choices=[
                    ("baseline", "审批配置"),
                    ("schema", "字段定义"),
                    ("requirement", "需求条目"),
                ],
                default="requirement",
                max_length=20,
                verbose_name="变更目标类型",
            ),
        ),
        migrations.AlterField(
            model_name="requirementchangerequest",
            name="target_kind",
            field=models.CharField(
                choices=[
                    ("baseline", "审批配置"),
                    ("schema", "字段定义"),
                    ("requirement", "需求条目"),
                ],
                max_length=20,
                verbose_name="变更目标类型",
            ),
        ),
        migrations.AlterField(
            model_name="requirementchangerequest",
            name="sequence_id",
            field=models.PositiveIntegerField(
                default=1, verbose_name="基线内自增序号（用于展示 CR-001）"
            ),
        ),
        migrations.AlterField(
            model_name="requirementversion",
            name="target_kind",
            field=models.CharField(
                choices=[
                    ("baseline", "审批配置"),
                    ("schema", "字段定义"),
                    ("requirement", "需求条目"),
                ],
                max_length=20,
                verbose_name="版本目标类型",
            ),
        ),
        # 9) 索引与约束
        migrations.AddIndex(
            model_name="requirement",
            index=models.Index(
                fields=["product", "sort_order"], name="req_product_sort"
            ),
        ),
        migrations.AddIndex(
            model_name="requirement",
            index=models.Index(
                fields=["project", "sort_order"], name="req_project_sort"
            ),
        ),
        migrations.AddIndex(
            model_name="requirement",
            index=models.Index(
                fields=["library", "sort_order"], name="req_library_sort"
            ),
        ),
        migrations.AddIndex(
            model_name="requirement",
            index=models.Index(
                fields=["product", "requirement_type", "sort_order"],
                name="req_product_type_sort",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        ("library__isnull", True),
                        ("product__isnull", False),
                        ("project__isnull", True),
                    ),
                    models.Q(
                        ("library__isnull", True),
                        ("product__isnull", True),
                        ("project__isnull", False),
                    ),
                    models.Q(
                        ("library__isnull", False),
                        ("product__isnull", True),
                        ("project__isnull", True),
                    ),
                    _connector="OR",
                ),
                name="requirement_owner_exactly_one",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementdraftrow",
            index=models.Index(
                fields=["draft", "sort_order"], name="req_draft_row_sort"
            ),
        ),
        migrations.AddIndex(
            model_name="requirementdraftrow",
            index=models.Index(
                fields=["draft", "requirement_type", "sort_order"],
                name="req_draft_row_type_sort",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementbaseline",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("product__isnull", False), ("project__isnull", True)),
                    models.Q(("product__isnull", True), ("project__isnull", False)),
                    _connector="OR",
                ),
                name="req_baseline_scope_exactly_one",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementbaseline",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        ("approval_type", "n_of_m"), ("required_count__gte", 1)
                    ),
                    models.Q(
                        models.Q(("approval_type", "n_of_m"), _negated=True),
                        ("required_count__isnull", True),
                    ),
                    _connector="OR",
                ),
                name="req_baseline_required_count_consistent",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementbaseline",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("deleted_at__isnull", True), ("product__isnull", False)
                ),
                fields=("product",),
                name="req_baseline_unique_product_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementbaseline",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("deleted_at__isnull", True), ("project__isnull", False)
                ),
                fields=("project",),
                name="req_baseline_unique_project_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementapprover",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("baseline", "approver"),
                name="req_approver_unique_baseline_approver_active",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementchangerequest",
            index=models.Index(
                fields=["baseline", "-created_at"],
                name="req_change_baseline_created",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementchangerequest",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("baseline", "sequence_id"),
                name="req_change_unique_baseline_sequence_active",
            ),
        ),
    ]
