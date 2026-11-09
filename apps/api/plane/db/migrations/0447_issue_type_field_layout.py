from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("db", "0446_field_linkage")]

    operations = [
        migrations.AddField(
            model_name="issuetype",
            name="field_layout",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
