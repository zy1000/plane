from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_first_assignee(apps, schema_editor):
    """执行人改回单选：每个计划用例取 through 表第一条回填 assignee。"""
    PlanCase = apps.get_model("db", "PlanCase")
    through = PlanCase.assignees.through
    db_alias = schema_editor.connection.alias

    first_by_plan_case = {}
    for plan_case_id, user_id in (
        through.objects.using(db_alias)
        .order_by("plancase_id", "id")
        .values_list("plancase_id", "user_id")
        .iterator()
    ):
        first_by_plan_case.setdefault(plan_case_id, user_id)

    for plan_case_id, user_id in first_by_plan_case.items():
        PlanCase.objects.using(db_alias).filter(id=plan_case_id).update(
            assignee_id=user_id
        )


def copy_assignee_to_assignees(apps, schema_editor):
    """回滚：把单执行人 assignee 复制回多执行人 through 表。"""
    PlanCase = apps.get_model("db", "PlanCase")
    through = PlanCase.assignees.through
    db_alias = schema_editor.connection.alias

    rows = (
        PlanCase.objects.using(db_alias)
        .filter(assignee_id__isnull=False)
        .values_list("id", "assignee_id")
    )
    through.objects.using(db_alias).bulk_create(
        [
            through(plancase_id=plan_case_id, user_id=user_id)
            for plan_case_id, user_id in rows.iterator()
        ],
        batch_size=1000,
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):
    """与 0375 拆开：先加字段并把 through 表数据搬进本表列，再删 M2M 表结构。

    本迁移期间 FK 与 M2M 共存，所以 FK 的 related_name 不能取 M2M 的
    ``assigned_plan_cases``（会触发 fields.E304），这里沿用旧单选时代的
    ``plan_case_assignees``。
    """

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0373_review_tailoring_axis_activities"),
    ]

    operations = [
        migrations.AddField(
            model_name="plancase",
            name="assignee",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="plan_case_assignees",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(backfill_first_assignee, copy_assignee_to_assignees),
    ]
