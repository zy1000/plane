from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_plan_case_assignee(apps, schema_editor):
    TestPlan = apps.get_model("db", "TestPlan")
    PlanCase = apps.get_model("db", "PlanCase")
    db_alias = schema_editor.connection.alias

    through_model = TestPlan.assignees.through
    through_fields = [field for field in through_model._meta.fields if field.is_relation]
    plan_field = next(
        field
        for field in through_fields
        if field.remote_field
        and getattr(field.remote_field.model._meta, "model_name", None) == "testplan"
    )
    user_field = next(field for field in through_fields if field is not plan_field)

    plan_attname = plan_field.attname
    user_attname = user_field.attname
    order_fields = [plan_attname]
    if any(field.name == "id" for field in through_model._meta.fields):
        order_fields.append("id")
    else:
        order_fields.append(user_attname)

    first_assignee_by_plan = {}
    through_queryset = through_model.objects.using(db_alias).order_by(*order_fields)
    for relation in through_queryset.iterator():
        plan_id = getattr(relation, plan_attname)
        if plan_id in first_assignee_by_plan:
            continue
        first_assignee_by_plan[plan_id] = getattr(relation, user_attname)

    if not first_assignee_by_plan:
        return

    for plan_id, assignee_id in first_assignee_by_plan.items():
        (
            PlanCase.objects.using(db_alias)
            .filter(
                plan_id=plan_id,
                assignee_id__isnull=True,
                deleted_at__isnull=True,
            )
            .update(assignee_id=assignee_id)
        )


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0272_overdue_record_snapshot_fields"),
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
        migrations.RunPython(backfill_plan_case_assignee, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="testplan",
            name="assignees",
        ),
    ]
