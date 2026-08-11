import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """产品 ↔ 项目关联。

    产品此前是纯工作区级的，与 Project 之间没有任何外键 —— 这张表是唯一的桥。
    项目通过它确定自己能引用哪些产品的需求（候选池的第一道过滤）。

    ⚠️ 如果这台机器曾经跑过 2026-07 那条被废弃的 0294 分支（见
    docs/project-requirement-link-requirements.md 3.3），库里可能已经存在一张同名的
    product_projects 表，CreateModel 会报 relation already exists。那条分支从未提交，
    只在开发机上留下过 .pyc；遇到时手工 DROP TABLE 后重跑即可。
    """

    dependencies = [("db", "0326_requirement_type_logo_props_blank")]

    operations = [
        migrations.CreateModel(
            name="ProductProject",
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
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="product_projects",
                        to="db.product",
                        verbose_name="所属产品",
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
                "verbose_name": "Product Project",
                "verbose_name_plural": "Product Projects",
                "db_table": "product_projects",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="productproject",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("product", "project"),
                name="product_project_unique_when_deleted_at_null",
            ),
        ),
        migrations.AlterUniqueTogether(
            name="productproject",
            unique_together={("product", "project", "deleted_at")},
        ),
    ]
