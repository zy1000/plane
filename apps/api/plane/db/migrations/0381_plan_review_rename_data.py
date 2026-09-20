from django.db import migrations
from django.db.models import OuterRef, Subquery

# 改名前后的状态值对照（value 即页面展示文案）
STATUS_RENAMES = (("未评审", "未复核"), ("评审中", "复核中"))


def rename_forward(apps, schema_editor):
    PlanCase = apps.get_model("db", "PlanCase")
    TestPlan = apps.get_model("db", "TestPlan")
    db_alias = schema_editor.connection.alias

    for old, new in STATUS_RENAMES:
        PlanCase.objects.using(db_alias).filter(review_status=old).update(
            review_status=new
        )

    # any（任一人通过）与「至少 1 人通过」语义等价，统一收敛到 n_of_m
    TestPlan.objects.using(db_alias).filter(review_approval_type="any").update(
        review_approval_type="n_of_m", review_required_count=1
    )


def rename_backward(apps, schema_editor):
    PlanCase = apps.get_model("db", "PlanCase")
    TestPlan = apps.get_model("db", "TestPlan")
    db_alias = schema_editor.connection.alias

    for old, new in STATUS_RENAMES:
        PlanCase.objects.using(db_alias).filter(review_status=new).update(
            review_status=old
        )

    TestPlan.objects.using(db_alias).filter(
        review_approval_type="n_of_m", review_required_count=1
    ).update(review_approval_type="any", review_required_count=None)


def backfill_plan_case_record(apps, schema_editor):
    """把已有复核记录挂到它当时复核的那一次执行上。

    取同一 plan_case 下、创建时间不晚于该复核记录的最近一条执行记录。
    """
    PlanCaseRecord = apps.get_model("db", "PlanCaseRecord")
    PlanCaseReviewRecord = apps.get_model("db", "PlanCaseReviewRecord")
    db_alias = schema_editor.connection.alias

    latest_record = (
        PlanCaseRecord.objects.using(db_alias)
        .filter(
            plan_case_id=OuterRef("plan_case_id"),
            created_at__lte=OuterRef("created_at"),
        )
        .order_by("-created_at")
        .values("id")[:1]
    )
    PlanCaseReviewRecord.objects.using(db_alias).filter(
        plan_case_record__isnull=True
    ).update(plan_case_record_id=Subquery(latest_record))


def clear_plan_case_record(apps, schema_editor):
    PlanCaseReviewRecord = apps.get_model("db", "PlanCaseReviewRecord")
    db_alias = schema_editor.connection.alias
    PlanCaseReviewRecord.objects.using(db_alias).update(plan_case_record_id=None)


class Migration(migrations.Migration):
    """0380 的数据侧：状态值改名、any 规则收敛、复核记录回填所属执行记录。"""

    dependencies = [
        ("db", "0380_plan_review_rename_schema"),
    ]

    operations = [
        migrations.RunPython(rename_forward, rename_backward),
        migrations.RunPython(backfill_plan_case_record, clear_plan_case_record),
    ]
