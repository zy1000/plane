# Generated for in-page view tabs: IssueView.scope (issues / defects / requirements)

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0425_remove_workspace_roles_copied_to_projects"),
    ]

    operations = [
        migrations.AddField(
            model_name="issueview",
            name="scope",
            field=models.CharField(
                choices=[("issues", "Issues"), ("defects", "Defects"), ("requirements", "Requirements")],
                db_index=True,
                default="issues",
                max_length=32,
            ),
        ),
    ]
