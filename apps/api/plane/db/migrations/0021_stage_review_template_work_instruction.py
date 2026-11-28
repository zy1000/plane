from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0020_requirement_rule_field_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="stagereviewtemplate",
            name="work_instruction",
            field=models.TextField(blank=True, default="", verbose_name="工作指引"),
        ),
    ]
