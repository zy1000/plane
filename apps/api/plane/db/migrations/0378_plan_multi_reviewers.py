from django.conf import settings
from django.db import migrations, models


def copy_reviewer_to_reviewers(apps, schema_editor):
    """把单评审人 reviewer 复制进多评审人 through 表。"""
    TestPlan = apps.get_model("db", "TestPlan")
    through = TestPlan.reviewers.through
    db_alias = schema_editor.connection.alias

    rows = (
        TestPlan.objects.using(db_alias)
        .filter(reviewer_id__isnull=False)
        .values_list("id", "reviewer_id")
    )
    through.objects.using(db_alias).bulk_create(
        [
            through(testplan_id=plan_id, user_id=user_id)
            for plan_id, user_id in rows.iterator()
        ],
        batch_size=1000,
        ignore_conflicts=True,
    )


def restore_first_reviewer(apps, schema_editor):
    """回滚：每个计划取 through 表第一条回填 reviewer。"""
    TestPlan = apps.get_model("db", "TestPlan")
    through = TestPlan.reviewers.through
    db_alias = schema_editor.connection.alias

    first_by_plan = {}
    for plan_id, user_id in (
        through.objects.using(db_alias)
        .order_by("testplan_id", "id")
        .values_list("testplan_id", "user_id")
        .iterator()
    ):
        first_by_plan.setdefault(plan_id, user_id)

    for plan_id, user_id in first_by_plan.items():
        TestPlan.objects.using(db_alias).filter(id=plan_id).update(reviewer_id=user_id)

    # 本函数之后同一迁移里还要 ALTER test_plan（删 reviewers / 规则列），
    # 上面的 UPDATE 会留下延迟约束的待触发事件，不先结清 Postgres 会报
    # "cannot ALTER TABLE because it has pending trigger events"
    schema_editor.execute("SET CONSTRAINTS ALL IMMEDIATE")


class Migration(migrations.Migration):
    """测试计划评审人改为多人 + 通过规则（全部 / 任一 / 至少 N 人）。

    与 0379 拆开：RunPython 往 through 表插行后再删 test_plan 的 reviewer 列，
    避免 Postgres pending trigger 问题（同 0352 的理由）。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0377_alter_testcase_priority_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="testplan",
            name="reviewers",
            field=models.ManyToManyField(
                blank=True,
                db_table="test_plan_reviewers",
                related_name="reviewed_test_plans",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="testplan",
            name="review_approval_type",
            field=models.CharField(
                choices=[
                    ("any", "任一人通过"),
                    ("all", "全部通过"),
                    ("n_of_m", "至少 N 人通过"),
                ],
                default="all",
                max_length=10,
                verbose_name="TestPlan Review Approval Type",
            ),
        ),
        migrations.AddField(
            model_name="testplan",
            name="review_required_count",
            field=models.PositiveSmallIntegerField(
                blank=True, null=True, verbose_name="TestPlan Review Required Count"
            ),
        ),
        migrations.AddField(
            model_name="plancasereviewrecord",
            name="invalidated_at",
            field=models.DateTimeField(
                blank=True, null=True, verbose_name="PlanCaseReviewRecord Invalidated At"
            ),
        ),
        migrations.AlterField(
            model_name="plancase",
            name="review_status",
            field=models.CharField(
                choices=[
                    ("未评审", "gray"),
                    ("评审中", "blue"),
                    ("通过", "green"),
                    ("不通过", "red"),
                ],
                default="未评审",
                verbose_name="PlanCase Review Status",
            ),
        ),
        migrations.RunPython(copy_reviewer_to_reviewers, restore_first_reviewer),
    ]
