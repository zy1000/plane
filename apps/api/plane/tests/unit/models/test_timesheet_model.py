from datetime import date, time
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from plane.db.models import TimeSheet
from plane.tests.factories import ProjectFactory


@pytest.mark.unit
class TestTimeSheetModel:
    @pytest.mark.django_db
    def test_rejects_overlapping_timesheet_for_same_member_and_date(self):
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
