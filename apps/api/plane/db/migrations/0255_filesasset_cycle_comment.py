from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0254_cyclecomment"),
    ]

    operations = [
        migrations.AddField(
            model_name="fileasset",
            name="cycle_comment",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="assets",
                to="db.cyclecomment",
            ),
        ),
    ]
