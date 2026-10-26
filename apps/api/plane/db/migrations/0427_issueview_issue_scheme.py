# 研发模式视图：IssueView 挂到模式方案上（project 为空），记下从哪个项目存上去的

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0426_issueview_scope"),
    ]

    operations = [
        migrations.AddField(
            model_name="issueview",
            name="issue_scheme",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="views",
                to="db.issuescheme",
            ),
        ),
        migrations.AddField(
            model_name="issueview",
            name="source_project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="db.project",
            ),
        ),
    ]
