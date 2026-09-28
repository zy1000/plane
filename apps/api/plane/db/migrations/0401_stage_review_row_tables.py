"""O 阶段评审的成品与组件版本改成表格，第一步：建两张子表。旧列留到 0403 再删。"""

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0400_review_project_stage_swap"),
    ]

    operations = [
        migrations.CreateModel(
            name="StageReviewFinishedGood",
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
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                ("akf_code", models.CharField(blank=True, default="", max_length=255, verbose_name="AKF 编号")),
                ("production_quantity", models.PositiveIntegerField(blank=True, null=True, verbose_name="生产数量")),
                ("product_config", models.CharField(blank=True, default="", max_length=255, verbose_name="产品配置")),
                (
                    "baseline_archive_code",
                    models.CharField(blank=True, default="", max_length=255, verbose_name="数据基线归档编号"),
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
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "stage_review",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="finished_goods",
                        to="db.stagereview",
                        verbose_name="所属评审",
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
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Stage Review Finished Good",
                "verbose_name_plural": "Stage Review Finished Goods",
                "db_table": "stage_review_finished_goods",
                "ordering": ("sort_order", "created_at"),
                "indexes": [models.Index(fields=["stage_review", "sort_order"], name="srfg_review_sort")],
            },
        ),
        migrations.CreateModel(
            name="StageReviewComponentVersion",
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
                ("sort_order", models.FloatField(default=65535, verbose_name="排序")),
                ("component", models.CharField(blank=True, default="", max_length=255, verbose_name="组件")),
                ("version", models.CharField(blank=True, default="", max_length=255, verbose_name="版本")),
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
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_%(class)s",
                        to="db.project",
                    ),
                ),
                (
                    "stage_review",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="component_versions",
                        to="db.stagereview",
                        verbose_name="所属评审",
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
                        related_name="workspace_%(class)s",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Stage Review Component Version",
                "verbose_name_plural": "Stage Review Component Versions",
                "db_table": "stage_review_component_versions",
                "ordering": ("sort_order", "created_at"),
                "indexes": [models.Index(fields=["stage_review", "sort_order"], name="srcv_review_sort")],
            },
        ),
    ]
