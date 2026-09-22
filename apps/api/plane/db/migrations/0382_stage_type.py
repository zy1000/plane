import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """阶段类型表 + 评审模板上的可空 stage_type 列。

    三步换列的第一步：0382 建表加列、0383 回填、0384 删旧列并改名。分三个迁移是为了让
    RunPython 跑在「两列并存」的那一刻 —— 一步到位的 AlterField 会直接丢掉阶段归属。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0381_plan_review_rename_data"),
    ]

    operations = [
        migrations.CreateModel(
            name="StageType",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(blank=True, null=True, verbose_name="Deleted At"),
                ),
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
                ("code", models.CharField(max_length=64, verbose_name="编码")),
                ("name", models.CharField(max_length=255, verbose_name="名称")),
                (
                    "description",
                    models.TextField(blank=True, default="", verbose_name="描述"),
                ),
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                (
                    "is_system",
                    models.BooleanField(default=False, verbose_name="是否预置"),
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
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stage_types",
                        to="db.workspace",
                        verbose_name="所属工作区",
                    ),
                ),
            ],
            options={
                "verbose_name": "Stage Type",
                "verbose_name_plural": "Stage Types",
                "db_table": "stage_types",
                "ordering": ("sort_order", "created_at", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="stagetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "code"),
                name="stage_type_unique_workspace_code_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="stagetype",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name"),
                name="stage_type_unique_workspace_name_active",
            ),
        ),
        migrations.AddField(
            model_name="stagereviewtemplate",
            name="stage_type",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="review_templates",
                to="db.stagetype",
                verbose_name="阶段",
            ),
        ),
    ]
