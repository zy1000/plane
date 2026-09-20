import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """测试计划评审：计划级评审人 + 计划用例评审状态 + 评审记录表。"""

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0375_remove_plan_case_assignees"),
    ]

    operations = [
        migrations.AddField(
            model_name="testplan",
            name="reviewer",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reviewed_test_plans",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="plancase",
            name="review_status",
            field=models.CharField(
                choices=[("未评审", "gray"), ("通过", "green"), ("不通过", "red")],
                default="未评审",
                verbose_name="PlanCase Review Status",
            ),
        ),
        migrations.CreateModel(
            name="PlanCaseReviewRecord",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(
                        auto_now=True, verbose_name="Last Modified At"
                    ),
                ),
                (
                    "deleted_at",
                    models.DateTimeField(
                        blank=True, null=True, verbose_name="Deleted At"
                    ),
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
                    "result",
                    models.CharField(
                        choices=[("通过", "green"), ("不通过", "red")],
                        default="通过",
                        verbose_name="PlanCaseReviewRecord Result",
                    ),
                ),
                (
                    "reason",
                    models.TextField(
                        blank=True,
                        null=True,
                        verbose_name="PlanCaseReviewRecord Reason",
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
                    "plan_case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="review_records",
                        to="db.plancase",
                    ),
                ),
                (
                    "reviewer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="plan_case_review_records",
                        to=settings.AUTH_USER_MODEL,
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
                "db_table": "test_plan_case_review_records",
                "ordering": ("-created_at",),
            },
        ),
    ]
