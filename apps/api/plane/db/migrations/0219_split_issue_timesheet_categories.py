# 工作项工时拆分：按 issue type 归类。
#
# - 新增 3 个工时类别：REQUIREMENT（需求）/ TASK（任务）/ BUG（缺陷）。
# - 将旧 ISSUE 类别置为 is_active=False（保留做数据兜底，不在前端菜单显示）。
# - 按 issue.type.name 回填历史「ISSUE」工时到新类别；未命中映射的保持在 ISSUE，
#   等运营补齐类型名映射后再做二次回填。

from django.db import migrations


NEW_CATEGORIES = [
    {
        "key": "REQUIREMENT",
        "name": "需求",
        "description": "挂在需求类工作项（史诗 / 特性 / 用户故事）上的工时。",
        "sort_order": 21,
    },
    {
        "key": "TASK",
        "name": "任务",
        "description": "挂在任务类工作项上的工时。",
        "sort_order": 22,
    },
    {
        "key": "BUG",
        "name": "缺陷",
        "description": "挂在缺陷类工作项上的工时。",
        "sort_order": 23,
    },
]

# 与 apps/api/plane/db/models/timesheet.py::ISSUE_TYPE_NAME_TO_CATEGORY_KEY 保持一致。
# 迁移期间不能 import 运行时模型，因此这里复制一份。
ISSUE_TYPE_NAME_TO_CATEGORY_KEY = {
    "史诗": "REQUIREMENT",
    "特性": "REQUIREMENT",
    "用户故事": "REQUIREMENT",
    "任务": "TASK",
    "缺陷": "BUG",
}


def seed_new_categories(apps, schema_editor):
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    for entry in NEW_CATEGORIES:
        TimesheetCategory.objects.update_or_create(
            key=entry["key"],
            defaults={
                "name": entry["name"],
                "description": entry["description"],
                "sort_order": entry["sort_order"],
                "is_active": True,
                "is_system": True,
            },
        )


def unseed_new_categories(apps, schema_editor):
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimesheetCategory.objects.filter(
        key__in=[entry["key"] for entry in NEW_CATEGORIES]
    ).delete()


def deactivate_generic_issue_category(apps, schema_editor):
    """把旧的通用 ISSUE 类别停用，使其不出现在前端菜单，但保留以兜底/做历史归档。"""
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimesheetCategory.objects.filter(key="ISSUE").update(is_active=False)


def reactivate_generic_issue_category(apps, schema_editor):
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimesheetCategory.objects.filter(key="ISSUE").update(is_active=True)


def backfill_issue_timesheets(apps, schema_editor):
    """把历史 category=ISSUE 的工时按 issue.type.name 重新分配到 REQUIREMENT/TASK/BUG。
    未命中映射的保持在 ISSUE。
    """
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimeSheet = apps.get_model("db", "TimeSheet")

    key_to_id = dict(TimesheetCategory.objects.values_list("key", "id"))
    issue_category_id = key_to_id.get("ISSUE")
    if not issue_category_id:
        return

    # 先按 issue 所属 type 的 name 分组批量更新
    updates = {}  # key -> set(timesheet_ids)
    qs = TimeSheet.objects.filter(
        category_id=issue_category_id, issue_id__isnull=False
    ).values_list("id", "issue__type__name")
    for ts_id, type_name in qs:
        target_key = ISSUE_TYPE_NAME_TO_CATEGORY_KEY.get(type_name)
        if not target_key:
            continue
        updates.setdefault(target_key, []).append(ts_id)

    for target_key, ids in updates.items():
        target_id = key_to_id.get(target_key)
        if not target_id or not ids:
            continue
        # 分批 update，避免一次传入过大的 IN 列表
        chunk = 500
        for i in range(0, len(ids), chunk):
            TimeSheet.objects.filter(id__in=ids[i : i + chunk]).update(
                category_id=target_id
            )


def revert_issue_timesheet_backfill(apps, schema_editor):
    """回滚：把 REQUIREMENT/TASK/BUG 的工时合并回 ISSUE。"""
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimeSheet = apps.get_model("db", "TimeSheet")

    key_to_id = dict(TimesheetCategory.objects.values_list("key", "id"))
    issue_category_id = key_to_id.get("ISSUE")
    target_ids = [
        key_to_id[key]
        for key in ("REQUIREMENT", "TASK", "BUG")
        if key in key_to_id
    ]
    if not issue_category_id or not target_ids:
        return
    TimeSheet.objects.filter(category_id__in=target_ids).update(
        category_id=issue_category_id
    )


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0218_timesheet_category"),
    ]

    operations = [
        migrations.RunPython(seed_new_categories, unseed_new_categories),
        migrations.RunPython(
            backfill_issue_timesheets, revert_issue_timesheet_backfill
        ),
        migrations.RunPython(
            deactivate_generic_issue_category, reactivate_generic_issue_category
        ),
    ]
