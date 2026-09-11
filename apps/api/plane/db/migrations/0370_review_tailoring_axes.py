"""裁剪矩阵的两个轴落成显式的表。

原来纵轴是「工作区全部启用模板」自动铺满的，结果是**凡是没勾的格子都得写裁剪原因** ——
可很多评审跟这个项目本来就没关系，逼着为它们写理由只是噪音。改成两个轴都由人挑：
``ReviewTailoringProduct`` 是横轴，``ReviewTailoringTemplate`` 是纵轴（只存顶层评审，
它的评审活动跟着整块进矩阵）。

不需要回填：``0369`` 已经把存量裁剪表连同它生成的评审实例一起清空了。
"""

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0369_review_tailoring_drop_stage"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewTailoringProduct",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
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
                        related_name="review_tailoring_columns",
                        to="db.product",
                        verbose_name="产品",
                    ),
                ),
                (
                    "tailoring",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="axis_products",
                        to="db.reviewtailoring",
                        verbose_name="所属裁剪单",
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
            ],
            options={
                "verbose_name": "Review Tailoring Product",
                "verbose_name_plural": "Review Tailoring Products",
                "db_table": "review_tailoring_products",
                "ordering": ("product__identifier", "product__name", "id"),
            },
        ),
        migrations.CreateModel(
            name="ReviewTailoringTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(blank=True, null=True, verbose_name="Deleted At")),
                ("id", models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
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
                    "tailoring",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="axis_templates",
                        to="db.reviewtailoring",
                        verbose_name="所属裁剪单",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="tailoring_axis_entries",
                        to="db.stagereviewtemplate",
                        verbose_name="顶层评审",
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
            ],
            options={
                "verbose_name": "Review Tailoring Template",
                "verbose_name_plural": "Review Tailoring Templates",
                "db_table": "review_tailoring_templates",
                "ordering": ("template__stage__sort_order", "template__sort_order", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="reviewtailoringproduct",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tailoring", "product"),
                name="rtp_unique_tailoring_product_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="reviewtailoringtemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("tailoring", "template"),
                name="rtt_unique_tailoring_template_active",
            ),
        ),
    ]
