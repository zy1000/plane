from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from plane.bgtasks import entity_status_email_task
from plane.db.models import (
    Cycle,
    CycleOverduePhase,
    Project,
    ProjectMember,
    Release,
    ReleaseOverduePhase,
    ReleaseStatus,
)
from plane.utils import overdue_reminder

BEIJING_TZ = ZoneInfo("Asia/Shanghai")


@pytest.mark.unit
class TestUpcomingOverdueReminder:
    @pytest.fixture
    def project(self, create_user, workspace):
        project = Project.objects.create(
            name="Reminder Project",
            identifier="REM",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(
            project=project,
            member=create_user,
            role=20,
            is_active=True,
        )
        return project

    @pytest.fixture
    def beijing_now(self):
        return datetime(2026, 6, 18, 9, 0, tzinfo=BEIJING_TZ)

    @pytest.fixture
    def captured_cycle_delays(self, monkeypatch):
        calls = []

        def fake_delay(**kwargs):
            calls.append(kwargs)

        monkeypatch.setattr(
            entity_status_email_task.dispatch_cycle_upcoming_overdue_email,
            "delay",
            fake_delay,
        )
        return calls

    @pytest.fixture
    def captured_release_delays(self, monkeypatch):
        calls = []

        def fake_delay(**kwargs):
            calls.append(kwargs)

        monkeypatch.setattr(
            entity_status_email_task.dispatch_release_upcoming_overdue_email,
            "delay",
            fake_delay,
        )
        return calls

    @pytest.fixture
    def allow_reminder_lock(self, monkeypatch):
        monkeypatch.setattr(overdue_reminder, "_acquire_reminder_lock", lambda key: True)

    def test_cycle_dev_phase_queues_owner_reminder(
        self,
        project,
        create_user,
        beijing_now,
        captured_cycle_delays,
        allow_reminder_lock,
    ):
        cycle = Cycle.objects.create(
            name="Cycle Dev",
            project=project,
            workspace=project.workspace,
            owned_by=create_user,
            status=Cycle.Status.IN_PROGRESS,
            test_handoff_date=beijing_now + timedelta(days=2),
            end_date=beijing_now + timedelta(days=5),
        )

        count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )

        assert count == 1
        assert len(captured_cycle_delays) == 1
        payload = captured_cycle_delays[0]
        assert payload["cycle_id"] == str(cycle.id)
        assert payload["phase"] == CycleOverduePhase.DEV
        assert payload["deadline_label"] == "转测日期"
        assert payload["deadline_date"] == "2026-06-20"
        assert payload["remaining_days"] == 2
        assert payload["reminder_slot"] == "09"

    def test_cycle_test_phase_queues_owner_reminder(
        self,
        project,
        create_user,
        beijing_now,
        captured_cycle_delays,
        allow_reminder_lock,
    ):
        cycle = Cycle.objects.create(
            name="Cycle Test",
            project=project,
            workspace=project.workspace,
            owned_by=create_user,
            status=Cycle.Status.TESTING,
            test_handoff_date=beijing_now - timedelta(days=3),
            end_date=beijing_now,
        )

        count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )

        assert count == 1
        payload = captured_cycle_delays[0]
        assert payload["phase"] == CycleOverduePhase.TEST
        assert payload["deadline_label"] == "结束日期"
        assert payload["deadline_date"] == "2026-06-18"
        assert payload["remaining_days"] == 0

    def test_release_dev_phase_queues_owner_reminder(
        self,
        project,
        create_user,
        beijing_now,
        captured_release_delays,
        allow_reminder_lock,
    ):
        release = Release.objects.create(
            name="Release Dev",
            project=project,
            workspace=project.workspace,
            lead=create_user,
            status=ReleaseStatus.IN_PROGRESS,
            test_handoff_date=date(2026, 6, 20),
            target_date=date(2026, 6, 25),
        )

        count = overdue_reminder.scan_releases_for_upcoming_overdue(
            [release],
            now=beijing_now,
            slot="09",
        )

        assert count == 1
        payload = captured_release_delays[0]
        assert payload["release_id"] == str(release.id)
        assert payload["phase"] == ReleaseOverduePhase.DEV
        assert payload["deadline_label"] == "转测日期"
        assert payload["deadline_date"] == "2026-06-20"
        assert payload["remaining_days"] == 2

    def test_release_test_phase_queues_owner_reminder(
        self,
        project,
        create_user,
        beijing_now,
        captured_release_delays,
        allow_reminder_lock,
    ):
        release = Release.objects.create(
            name="Release Test",
            project=project,
            workspace=project.workspace,
            lead=create_user,
            status=ReleaseStatus.TESTING,
            test_handoff_date=date(2026, 6, 12),
            target_date=date(2026, 6, 18),
        )

        count = overdue_reminder.scan_releases_for_upcoming_overdue(
            [release],
            now=beijing_now,
            slot="09",
        )

        assert count == 1
        payload = captured_release_delays[0]
        assert payload["phase"] == ReleaseOverduePhase.TEST
        assert payload["deadline_label"] == "结束日期"
        assert payload["deadline_date"] == "2026-06-18"
        assert payload["remaining_days"] == 0

    def test_skips_when_status_already_advanced_for_dev_phase(
        self,
        project,
        create_user,
        beijing_now,
        captured_cycle_delays,
        allow_reminder_lock,
    ):
        cycle = Cycle.objects.create(
            name="Cycle Advanced",
            project=project,
            workspace=project.workspace,
            owned_by=create_user,
            status=Cycle.Status.TESTING,
            test_handoff_date=beijing_now + timedelta(days=2),
            end_date=beijing_now + timedelta(days=5),
        )

        count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )

        assert count == 0
        assert captured_cycle_delays == []

    def test_skips_when_deadline_is_outside_upcoming_window(
        self,
        project,
        create_user,
        beijing_now,
        captured_cycle_delays,
        allow_reminder_lock,
    ):
        cycle = Cycle.objects.create(
            name="Cycle Later",
            project=project,
            workspace=project.workspace,
            owned_by=create_user,
            status=Cycle.Status.IN_PROGRESS,
            test_handoff_date=beijing_now + timedelta(days=3),
            end_date=beijing_now + timedelta(days=5),
        )

        count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )

        assert count == 0
        assert captured_cycle_delays == []

    def test_skips_duplicate_reminder_for_same_slot(
        self,
        project,
        create_user,
        beijing_now,
        captured_cycle_delays,
        monkeypatch,
    ):
        acquired_keys = set()

        def acquire_once(key):
            if key in acquired_keys:
                return False
            acquired_keys.add(key)
            return True

        monkeypatch.setattr(overdue_reminder, "_acquire_reminder_lock", acquire_once)
        cycle = Cycle.objects.create(
            name="Cycle Duplicate",
            project=project,
            workspace=project.workspace,
            owned_by=create_user,
            status=Cycle.Status.IN_PROGRESS,
            test_handoff_date=beijing_now + timedelta(days=2),
            end_date=beijing_now + timedelta(days=5),
        )

        first_count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )
        second_count = overdue_reminder.scan_cycles_for_upcoming_overdue(
            [cycle],
            now=beijing_now,
            slot="09",
        )

        assert first_count == 1
        assert second_count == 0
        assert len(captured_cycle_delays) == 1
