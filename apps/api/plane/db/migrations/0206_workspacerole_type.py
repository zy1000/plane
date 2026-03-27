from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0205_seed_permissions"),
    ]

    operations = [
        migrations.AddField(
            model_name="workspacerole",
            name="type",
            field=models.CharField(
                choices=[
                    ("workspace", "工作区角色"),
                    ("project_template", "项目角色模板"),
                ],
                db_index=True,
                default="workspace",
                max_length=20,
            ),
        ),
    ]
