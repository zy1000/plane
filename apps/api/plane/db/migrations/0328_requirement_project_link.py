import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """需求 ↔ 项目引用关联，含项目内交付阶段。

    需求本体仍归属产品，这张表只表达引用与项目内进度。刻意不复用
    Requirement.project —— 那是排他归属，搬过去会重新取号并让历史行的作用域与活行
    对不上，详见 RequirementProject 的 docstring。

    stage 放在关联行上而不是需求本体上：同一条需求在 A 项目已发布、B 项目还没开工，
    一个字段存不下。
    """

    dependencies = [("db", "0327_product_project_link")]

    operations = [
        migrations.CreateModel(
            name="RequirementProject",
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
                (
                    "stage",
                    models.CharField(
                        choices=[
                            ("linked", "已立项"),
                            ("planned", "已排期"),
                            ("in_progress", "研发中"),
                            ("done", "研发完毕"),
                            ("released", "已发布"),
                        ],
                        db_index=True,
                        default="linked",
                        max_length=20,
                        verbose_name="项目内阶段",
                    ),
                ),
                (
                    "sort_order",
                    models.FloatField(default=65535, verbose_name="项目内排序"),
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
                    "requirement",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="requirement_projects",
                        to="db.requirement",
                        verbose_name="关联需求",
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
                "verbose_name": "Requirement Project",
                "verbose_name_plural": "Requirement Projects",
                "db_table": "requirement_projects",
                "ordering": ("sort_order", "-created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="requirementproject",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("requirement", "project"),
                name="requirement_project_unique_when_deleted_at_null",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="requirementproject",
            unique_together={("requirement", "project", "deleted_at")},
        ),
    ]
