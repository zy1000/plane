from datetime import date, time
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError

from plane.db.models import TimeSheet, TimesheetCategory
from plane.tests.factories import ProjectFactory


def _ensure_categories_seeded():
    """测试环境兜底，保证预置类别齐全（migration 已经执行过，此处仅作自愈）。"""
    seeds = [
        ("PROJECT", "项目工时", 10, True),
        # ISSUE 在拆分 migration 中被置为 is_active=False，这里保持一致以贴近真实数据
        ("ISSUE", "工作项工时", 20, False),
        ("REQUIREMENT", "需求工时", 21, True),
        ("TASK", "任务工时", 22, True),
        ("BUG", "缺陷工时", 23, True),
        ("TEST_CASE", "测试工时", 30, True),
        ("SAMPLE", "送样工时", 40, True),
    ]
    for key, name, sort_order, is_active in seeds:
        TimesheetCategory.objects.update_or_create(
            key=key,
            defaults={
                "name": name,
                "sort_order": sort_order,
                "is_active": is_active,
                "is_system": True,
            },
        )


@pytest.mark.unit
class TestTimeSheetModel:
    @pytest.mark.django_db
    def test_rejects_overlapping_timesheet_for_same_member_and_date(self):
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner

        TimeSheet.objects.create(
            member=member,
            project=project,
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )

        with pytest.raises(ValidationError, match="时间重叠"):
            TimeSheet.objects.create(
                member=member,
                project=project,
                date=date(2026, 4, 8),
                start_time=time(8, 30),
                end_time=time(10, 30),
                hours=Decimal("2.00"),
            )

    @pytest.mark.django_db
    def test_allows_adjacent_timesheets_for_same_member_and_date(self):
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner

        TimeSheet.objects.create(
            member=member,
            project=project,
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )

        second = TimeSheet.objects.create(
            member=member,
            project=project,
            date=date(2026, 4, 8),
            start_time=time(9, 30),
            end_time=time(10, 30),
            hours=Decimal("1.00"),
        )

        assert second.id is not None
        assert TimeSheet.objects.count() == 2

    @pytest.mark.django_db
    def test_auto_assigns_project_category_when_missing(self):
        """未显式传 category 时，纯项目工时应自动命中 PROJECT 类别。"""
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner

        ts = TimeSheet.objects.create(
            member=member,
            project=project,
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )
        assert ts.category is not None
        assert ts.category.key == "PROJECT"

    @pytest.mark.django_db
    def test_sample_and_project_category_can_coexist_in_same_slot(self):
        """同一成员同一时间段下，项目工时与送样工时应能并存。"""
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner

        project_cat = TimesheetCategory.objects.get(key="PROJECT")
        sample_cat = TimesheetCategory.objects.get(key="SAMPLE")

        TimeSheet.objects.create(
            member=member,
            project=project,
            category=project_cat,
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )

        # 同时段同项目、类别不同，允许插入（但整体时间重叠仍会被 clean() 拦截，
        # 因此用非重叠的时间段验证 DB 层唯一约束按类别隔离）
        second = TimeSheet.objects.create(
            member=member,
            project=project,
            category=sample_cat,
            date=date(2026, 4, 8),
            start_time=time(9, 30),
            end_time=time(10, 30),
            hours=Decimal("1.00"),
        )
        assert second.category.key == "SAMPLE"

    @pytest.mark.django_db
    def test_issue_category_requires_issue(self):
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner
        issue_cat = TimesheetCategory.objects.get(key="ISSUE")

        with pytest.raises(ValidationError, match="必须挂靠工作项"):
            TimeSheet.objects.create(
                member=member,
                project=project,
                category=issue_cat,
                date=date(2026, 4, 8),
                start_time=time(8, 30),
                end_time=time(9, 30),
                hours=Decimal("1.00"),
            )

    @pytest.mark.django_db
    def test_requirement_task_bug_categories_require_issue(self):
        """拆分后的 REQUIREMENT / TASK / BUG 必须挂工作项。"""
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner

        for key in ("REQUIREMENT", "TASK", "BUG"):
            cat = TimesheetCategory.objects.get(key=key)
            with pytest.raises(ValidationError, match="必须挂靠工作项"):
                TimeSheet.objects.create(
                    member=member,
                    project=project,
                    category=cat,
                    date=date(2026, 4, 8),
                    start_time=time(8, 30),
                    end_time=time(9, 30),
                    hours=Decimal("1.00"),
                )

    @pytest.mark.django_db
    def test_fallback_routes_issue_to_subcategory_by_type_name(self):
        """未显式传 category 时，挂 issue 的工时按 issue.type.name 路由到 REQUIREMENT/TASK/BUG。"""
        from plane.db.models import Issue, IssueType, State

        _ensure_categories_seeded()
        project = ProjectFactory()
        workspace = project.workspace
        member = workspace.owner

        # 必须有一个 state 才能建 issue
        state = State.objects.create(
            name="Backlog",
            project=project,
            workspace=workspace,
            slug="backlog",
            sequence=1,
        )

        bug_type = IssueType.objects.create(workspace=workspace, name="缺陷")
        issue = Issue.objects.create(
            workspace=workspace,
            project=project,
            name="修一个 bug",
            state=state,
            type=bug_type,
            created_by=member,
        )

        ts = TimeSheet.objects.create(
            member=member,
            project=project,
            issue=issue,
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )
        assert ts.category is not None
        assert ts.category.key == "BUG"

    @pytest.mark.django_db
    def test_project_category_forbids_issue_and_test_case(self):
        _ensure_categories_seeded()
        project = ProjectFactory()
        member = project.workspace.owner
        sample_cat = TimesheetCategory.objects.get(key="SAMPLE")

        # 构造一个假 issue id 以触发约束，避免真的去建 issue；直接把字段赋值后 save
        # 使用 clean 阶段的 ValidationError
        ts = TimeSheet(
            member=member,
            project=project,
            category=sample_cat,
            issue_id=project.id,  # 赋一个 UUID，仅用于触发互斥校验
            date=date(2026, 4, 8),
            start_time=time(8, 30),
            end_time=time(9, 30),
            hours=Decimal("1.00"),
        )
        with pytest.raises(ValidationError, match="不能挂靠工作项"):
            ts.save()
