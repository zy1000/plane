from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0289_requirement_requirementmodule_requirementattachment_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="name",
            field=models.CharField(max_length=255, verbose_name="Product Name"),
        ),
        migrations.AlterField(
            model_name="product",
            name="description_html",
            field=models.JSONField(blank=True, null=True, verbose_name="Product Description HTML"),
        ),
        migrations.AlterField(
            model_name="product",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="product_owner",
                to="db.user",
                verbose_name="Owner",
            ),
        ),
        migrations.AddField(
            model_name="fileasset",
            name="product",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="assets",
                to="db.product",
            ),
        ),
        migrations.AlterField(
            model_name="filepath",
            name="entity_type",
            field=models.CharField(
                choices=[
                    ("WORKSPACE", "Workspace"),
                    ("PROJECT", "Project"),
                    ("PRODUCT", "Product"),
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
