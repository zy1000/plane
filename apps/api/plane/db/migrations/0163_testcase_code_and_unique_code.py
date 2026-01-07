from django.db import migrations, models
import django.core.validators


def generate_testcase_code(apps, schema_editor):
    TestCase = apps.get_model("db", "TestCase")
    db_alias = schema_editor.connection.alias

    queryset = TestCase.objects.using(db_alias).filter(code__isnull=True)

    for repository_id in (
        queryset.values_list("repository_id", flat=True)
        .distinct()
        .order_by("repository_id")
    ):
        cases = (
            queryset.filter(repository_id=repository_id)
            .order_by("created_at", "id")
        )
        counter = 1
        for case in cases:
            prefix = "001"
            suffix = f"{counter:03d}"
            case.code = f"{prefix}-{suffix}"
            case.save(update_fields=["code"])
            counter += 1


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0162_casereviewrecord_confirmed"),
    ]

    operations = [
        migrations.AddField(
            model_name="testcase",
            name="code",
            field=models.CharField(
                max_length=7,
                null=True,
                verbose_name="TestCase Code",
                validators=[
                    django.core.validators.RegexValidator(
                        regex=r"^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$"
                    )
                ],
            ),
        ),
        migrations.RunPython(generate_testcase_code, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="testcase",
            name="code",
            field=models.CharField(
                max_length=7,
                verbose_name="TestCase Code",
                validators=[
                    django.core.validators.RegexValidator(
                        regex=r"^[A-Za-z0-9]{3}-[A-Za-z0-9]{3}$"
                    )
                ],
            ),
        ),
        migrations.AddConstraint(
            model_name="testcase",
            constraint=models.UniqueConstraint(
                fields=("repository", "code"),
                condition=models.Q(
                    ("deleted_at__isnull", True), ("repository__isnull", False)
                ),
                name="unique_case_repository_code_when_not_deleted",
            ),
        ),
    ]

