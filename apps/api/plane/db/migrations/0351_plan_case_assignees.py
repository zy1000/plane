from django.conf import settings
from django.db import migrations, models


def copy_assignee_to_assignees(apps, schema_editor):
    """把单执行人 assignee 复制进多执行人 through 表（软删行一并复制，无害）。"""
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
    )


def restore_first_assignee(apps, schema_editor):
    """回滚：每个计划用例取 through 表第一条回填 assignee。"""
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
        PlanCase.objects.using(db_alias).filter(id=plan_case_id).update(assignee_id=user_id)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("db", "0350_requirement_attachments"),
    ]

    operations = [
        migrations.AddField(
            model_name="plancase",
            name="assignees",
            field=models.ManyToManyField(
                blank=True,
                related_name="assigned_plan_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(copy_assignee_to_assignees, restore_first_assignee),
    ]
