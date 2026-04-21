from datetime import date, time
from decimal import Decimal

import pytest
from rest_framework import status

from plane.db.models import Project, TimeSheet, TimesheetCategory


def _ensure_categories_seeded():
    seeds = [
        ("PROJECT", "项目工时", 10),
        ("ISSUE", "工作项工时", 20),
        ("TEST_CASE", "测试工时", 30),
        ("SAMPLE", "送样工时", 40),
    ]
    for key, name, sort_order in seeds:
        TimesheetCategory.objects.update_or_create(
            key=key,
            defaults={
                "name": name,
                "sort_order": sort_order,
                "is_active": True,
                "is_system": True,
            },
        )


@pytest.mark.unit
class TestTimeSheetCopyPreviousWeekView:
    @pytest.mark.django_db
    def test_copies_previous_week_timesheets(self, session_client, workspace, create_user):
        _ensure_categories_seeded()
        project = Project.objects.create(
            name="Test Project",
            identifier="TST",
            workspace=workspace,
        )
        sample_cat = TimesheetCategory.objects.get(key="SAMPLE")

        TimeSheet.objects.create(
            member=create_user,
            project=project,
            date=date(2026, 4, 6),
            start_time=time(9, 0),
            end_time=time(10, 0),
            hours=Decimal("1.00"),
            description="周计划",
        )
        TimeSheet.objects.create(
            member=create_user,
            project=project,
            category=sample_cat,
            date=date(2026, 4, 8),
            start_time=time(13, 0),
            end_time=time(15, 0),
            hours=Decimal("2.00"),
            description="送样工时",
        )

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/timesheets/copy-previous-week/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source_count"] == 2
        assert response.data["created_count"] == 2
        assert response.data["skipped_count"] == 0
        assert len(response.data["timesheets"]) == 2

        copied_timesheets = list(
            TimeSheet.objects.filter(
                member=create_user,
                project=project,
                date__gte=date(2026, 4, 13),
                date__lte=date(2026, 4, 19),
            ).order_by("date", "start_time")
        )

        assert [timesheet.date for timesheet in copied_timesheets] == [
            date(2026, 4, 13),
            date(2026, 4, 15),
        ]
        assert [timesheet.description for timesheet in copied_timesheets] == [
            "周计划",
            "送样工时",
        ]
        # category 需要一同复制
        assert [timesheet.category.key for timesheet in copied_timesheets] == [
            "PROJECT",
            "SAMPLE",
        ]

    @pytest.mark.django_db
    def test_skips_conflicting_entries_in_target_week(self, session_client, workspace, create_user):
        _ensure_categories_seeded()
        project = Project.objects.create(
            name="Conflict Project",
            identifier="CFT",
            workspace=workspace,
        )

        TimeSheet.objects.create(
            member=create_user,
            project=project,
            date=date(2026, 4, 6),
            start_time=time(9, 0),
            end_time=time(10, 0),
            hours=Decimal("1.00"),
            description="上周例会",
        )
        TimeSheet.objects.create(
            member=create_user,
            project=project,
            date=date(2026, 4, 8),
            start_time=time(14, 0),
            end_time=time(16, 0),
            hours=Decimal("2.00"),
            description="上周开发",
        )
        TimeSheet.objects.create(
            member=create_user,
            project=project,
            date=date(2026, 4, 13),
            start_time=time(9, 0),
            end_time=time(10, 0),
            hours=Decimal("1.00"),
            description="本周已有工时",
        )

        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/timesheets/copy-previous-week/",
            {"week_start": "2026-04-13"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["source_count"] == 2
        assert response.data["created_count"] == 1
        assert response.data["skipped_count"] == 1
        assert len(response.data["timesheets"]) == 1
        assert response.data["timesheets"][0]["date"] == "2026-04-15"

        copied_timesheets = list(
            TimeSheet.objects.filter(
                member=create_user,
                project=project,
                date__gte=date(2026, 4, 13),
                date__lte=date(2026, 4, 19),
            ).order_by("date", "start_time")
        )

        assert len(copied_timesheets) == 2
        assert copied_timesheets[0].description == "本周已有工时"
        assert copied_timesheets[1].description == "上周开发"
