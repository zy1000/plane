from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0445_workspace_user_work_preference")]
    operations = [
        migrations.AddField(model_name="issuefielddefinition", name="linkage", field=models.JSONField(default=dict, blank=True)),
        migrations.AddField(model_name="typeextrafield", name="linkage", field=models.JSONField(default=dict, blank=True)),
    ]
