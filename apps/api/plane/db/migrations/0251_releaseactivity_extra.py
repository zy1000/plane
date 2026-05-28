# Generated for release activity extra field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0250_release_activity"),
    ]

    operations = [
        migrations.AddField(
            model_name="releaseactivity",
            name="extra",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
