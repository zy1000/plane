from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0237_drop_fileasset_asset"),
    ]

    operations = [
        migrations.AlterField(
            model_name="filepath",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("WORKSPACE", "Workspace"),
                    ("PROJECT", "Project"),
                    ("FILESTORE_ROOT", "Filestore Root"),
                    ("USER_FOLDER", "User Folder"),
                    ("ISSUE", "Issue"),
                    ("DRAFT_ISSUE", "Draft Issue"),
                    ("PAGE", "Page"),
                    ("TESTCASE", "Testcase"),
                    ("CYCLE", "Cycle"),
                    ("RELEASE", "Release"),
                    ("PLAN_CASE_RECORD", "Plan Case Record"),
                    ("USER_ROOT", "User Root"),
                    ("USER", "User"),
                    ("ISSUES_CATEGORY", "Issues Category"),
                    ("DRAFTS_CATEGORY", "Drafts Category"),
                    ("PAGES_CATEGORY", "Pages Category"),
                    ("CYCLES_CATEGORY", "Cycles Category"),
                    ("RELEASES_CATEGORY", "Releases Category"),
                    ("CASES_CATEGORY", "Cases Category"),
                    ("PLAN_CASE_RECORDS_CATEGORY", "Plan Case Records Category"),
                    ("TEMP_CATEGORY", "Temp Category"),
                    ("TEMP", "Temp"),
                ],
                max_length=32,
            ),
        ),
    ]
