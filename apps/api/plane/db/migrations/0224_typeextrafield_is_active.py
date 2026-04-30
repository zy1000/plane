from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0223_typeextrafield_typeextrafieldvalue_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="typeextrafield",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
