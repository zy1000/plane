from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0208_create_timesheet"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="timesheet",
            constraint=models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "issue"],
                condition=Q(issue__isnull=False, test_case__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_issue_slot_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="timesheet",
            constraint=models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "test_case"],
                condition=Q(test_case__isnull=False, issue__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_case_slot_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="timesheet",
            constraint=models.UniqueConstraint(
                fields=["member", "date", "start_time", "end_time", "project"],
                condition=Q(issue__isnull=True, test_case__isnull=True, deleted_at__isnull=True),
                name="timesheet_unique_member_project_slot_active",
            ),
        ),
    ]
