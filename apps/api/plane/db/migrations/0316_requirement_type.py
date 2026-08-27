import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """把「需求模板」（Requirement.is_template=True）抽成独立的 RequirementType。

    纯结构迁移，不搬数据：旧列指向 requirements.id，新列指向 requirement_types.id，
    两者之间没有值的连续性。四个 AddField 都是无 default 的 NOT NULL，因此只有在
    相关表为空时才能成功 —— 有数据时会在 ALTER 处直接报错，而不是静默写脏。

    另注意 requirement_change_requests / requirement_change_items /
    requirement_versions / requirement_drafts 的 JSON 列内嵌了 "template_id" key，
    改名同样没有迁移兜底，这几张表也必须为空。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0315_requirement_detail_template_not_null"),
    ]

    operations = [
        # 1) 新表 —— 必须先于任何 to="db.requirementtype"
        migrations.CreateModel(
            name="RequirementType",
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
                ("name", models.CharField(max_length=255, verbose_name="需求类型名称")),
                ("description", models.TextField(blank=True, default="", verbose_name="需求类型描述")),
                ("is_active", models.BooleanField(default=True, verbose_name="是否启用")),
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
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
                        related_name="owned_requirement_types",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="负责人",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_types",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "db_table": "requirement_types",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="requirementtype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name"),
                name="requirement_type_unique_workspace_name_active",
            ),
        ),
        # 2) 先摘掉引用待删列的索引与约束
        migrations.RemoveIndex(
            model_name="requirementdetail",
            name="req_detail_req_template_sort",
        ),
        migrations.RemoveIndex(
            model_name="requirementdraftdetail",
            name="req_draft_detail_template_sort",
        ),
        migrations.RemoveConstraint(
            model_name="requirementfield",
            name="req_field_unique_requirement_builtin_key",
        ),
        migrations.RemoveConstraint(
            model_name="requirement",
            name="requirement_scope_by_template",
        ),
        migrations.RemoveConstraint(
            model_name="requirement",
            name="requirement_unique_workspace_template_title_active",
        ),
        # 3) 丢旧列
        migrations.RemoveField(model_name="requirementfield", name="requirement"),
        migrations.RemoveField(model_name="requirementlibrary", name="template"),
        migrations.RemoveField(model_name="requirementdetail", name="template"),
        migrations.RemoveField(model_name="requirementdraftdetail", name="template"),
        migrations.RemoveField(model_name="requirement", name="is_template"),
        migrations.RemoveField(model_name="requirement", name="template"),
        # 4) 加新列（空表，直接 NOT NULL 且无 default）
        migrations.AddField(
            model_name="requirementfield",
            name="requirement_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="fields",
                to="db.requirementtype",
                verbose_name="所属需求类型",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementlibrary",
            name="requirement_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="libraries",
                to="db.requirementtype",
                verbose_name="所选需求类型",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementdetail",
            name="requirement_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_details",
                to="db.requirementtype",
                verbose_name="所属需求类型",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementdraftdetail",
            name="requirement_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bound_draft_details",
                to="db.requirementtype",
                verbose_name="所属需求类型",
            ),
            preserve_default=False,
        ),
        # 5) 重建索引与约束
        migrations.AddIndex(
            model_name="requirementdetail",
            index=models.Index(
                fields=["requirement", "requirement_type", "sort_order"],
                name="req_detail_req_type_sort",
            ),
        ),
        migrations.AddIndex(
            model_name="requirementdraftdetail",
            index=models.Index(
                fields=["draft", "requirement_type", "sort_order"],
                name="req_draft_detail_type_sort",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementfield",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("builtin_key__isnull", False), ("deleted_at__isnull", True)
                ),
                fields=("requirement_type", "builtin_key"),
                name="req_field_unique_type_builtin_key",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("product__isnull", False), ("project__isnull", True)),
                    models.Q(("product__isnull", True), ("project__isnull", False)),
                    _connector="OR",
                ),
                name="requirement_scope_exactly_one",
            ),
        ),
    ]
