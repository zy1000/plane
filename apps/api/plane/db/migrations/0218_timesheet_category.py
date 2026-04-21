# 工时类别字典：新增 TimesheetCategory 表，TimeSheet 增加 category 外键，
# 为已存在的工时记录按 issue / test_case 归属回填类别。

import uuid

from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


CATEGORY_SEED = [
    {
        "key": "PROJECT",
        "name": "项目",
        "description": "直接挂在项目上、不绑定具体工作项或测试用例的工时。",
        "sort_order": 10,
    },
    {
        "key": "ISSUE",
        "name": "工作项工时",
        "description": "挂在工作项（issue）上的工时。",
        "sort_order": 20,
    },
    {
        "key": "TEST_CASE",
        "name": "测试",
        "description": "挂在测试用例（test case）上的工时。",
        "sort_order": 30,
    },
    {
        "key": "SAMPLE",
        "name": "送样",
        "description": "挂在项目上的送样类工时，独立于项目工时统计。",
        "sort_order": 40,
    },
]


def seed_categories(apps, schema_editor):
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    for entry in CATEGORY_SEED:
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


def unseed_categories(apps, schema_editor):
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")
    TimesheetCategory.objects.filter(
        key__in=[entry["key"] for entry in CATEGORY_SEED]
    ).delete()


def backfill_timesheet_category(apps, schema_editor):
    TimeSheet = apps.get_model("db", "TimeSheet")
    TimesheetCategory = apps.get_model("db", "TimesheetCategory")

    key_to_id = dict(TimesheetCategory.objects.values_list("key", "id"))
    issue_id = key_to_id.get("ISSUE")
    test_case_id = key_to_id.get("TEST_CASE")
    project_id = key_to_id.get("PROJECT")

    if not (issue_id and test_case_id and project_id):
        return

    TimeSheet.objects.filter(
        category__isnull=True, issue__isnull=False
    ).update(category_id=issue_id)
    TimeSheet.objects.filter(
        category__isnull=True, test_case__isnull=False
    ).update(category_id=test_case_id)
    TimeSheet.objects.filter(category__isnull=True).update(category_id=project_id)


def noop_reverse_backfill(apps, schema_editor):
    # 回滚时直接将 category 置空即可；字段删除由 AlterField/RemoveField 处理
    TimeSheet = apps.get_model("db", "TimeSheet")
    TimeSheet.objects.update(category=None)


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0217_project_pms_project_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="TimesheetCategory",
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
                    "key",
                    models.CharField(max_length=32, unique=True, verbose_name="类别编码"),
                ),
                ("name", models.CharField(max_length=64, verbose_name="类别名称")),
                ("description", models.TextField(blank=True, default="", verbose_name="描述")),
                ("sort_order", models.PositiveIntegerField(default=0, verbose_name="排序")),
                ("is_active", models.BooleanField(default=True, verbose_name="是否启用")),
                ("is_system", models.BooleanField(default=False, verbose_name="是否系统预置")),
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
                "verbose_name": "工时类别",
                "verbose_name_plural": "工时类别",
                "db_table": "timesheet_categories",
                "ordering": ("sort_order", "key"),
            },
        ),
        migrations.RunPython(seed_categories, unseed_categories),
        migrations.AddField(
            model_name="timesheet",
            name="category",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="timesheets",
                to="db.timesheetcategory",
                verbose_name="工时类别",
            ),
        ),
        migrations.RunPython(backfill_timesheet_category, noop_reverse_backfill),
        migrations.AlterField(
            model_name="timesheet",
            name="category",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="timesheets",
                to="db.timesheetcategory",
                verbose_name="工时类别",
            ),
        ),
        # 项目级唯一约束重写：按 (category, project) 组合唯一，允许同一时间段同一项目
        # 的「项目工时」和「送样工时」共存。
        migrations.RemoveConstraint(
            model_name="timesheet",
            name="timesheet_unique_member_project_slot_active",
        ),
        migrations.AddConstraint(
            model_name="timesheet",
            constraint=models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "category", "project"],
                condition=Q(
                    issue__isnull=True,
                    test_case__isnull=True,
                    deleted_at__isnull=True,
                ),
                name="timesheet_unique_member_cat_project_slot",
            ),
        ),
        migrations.AddIndex(
            model_name="timesheet",
            index=models.Index(fields=["category"], name="idx_timesheet_category"),
        ),
    ]
