from django.db import migrations, models
from django.db.models import Count
from django.utils import timezone


def consolidate_duplicate_case_modules(apps, schema_editor):
    CaseModule = apps.get_model("db", "CaseModule")
    TestCase = apps.get_model("db", "TestCase")
    db_alias = schema_editor.connection.alias

    while True:
        duplicate_groups = list(
            CaseModule.objects.using(db_alias)
            .filter(deleted_at__isnull=True, repository_id__isnull=False)
            .values("repository_id", "parent_id", "name")
            .annotate(module_count=Count("id"))
            .filter(module_count__gt=1)
        )
        if not duplicate_groups:
            break

        for group in duplicate_groups:
            modules = list(
                CaseModule.objects.using(db_alias)
                .filter(
                    repository_id=group["repository_id"],
                    parent_id=group["parent_id"],
                    name=group["name"],
                    deleted_at__isnull=True,
                )
                .order_by("created_at", "id")
            )
            if len(modules) <= 1:
                continue

            keep_module = modules[0]
            duplicate_ids = [module.id for module in modules[1:]]

            TestCase.objects.using(db_alias).filter(module_id__in=duplicate_ids).update(
                module_id=keep_module.id
            )
            CaseModule.objects.using(db_alias).filter(parent_id__in=duplicate_ids).update(
                parent_id=keep_module.id
            )
            CaseModule.objects.using(db_alias).filter(id__in=duplicate_ids).update(
                deleted_at=timezone.now(),
                updated_at=timezone.now(),
            )


class Migration(migrations.Migration):
    dependencies = [
        ("db", "0286_seed_note_permissions"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="casemodule",
            name="unique_case_module_repository_name_when_not_deleted",
        ),
        migrations.RunPython(
            consolidate_duplicate_case_modules, migrations.RunPython.noop
        ),
        migrations.AddConstraint(
            model_name="casemodule",
            constraint=models.UniqueConstraint(
                fields=("repository", "name"),
                condition=models.Q(
                    ("deleted_at__isnull", True),
                    ("parent__isnull", True),
                    ("repository__isnull", False),
                ),
                name="unique_case_module_root_repo_name_not_deleted",
            ),
        ),
        migrations.AddConstraint(
            model_name="casemodule",
            constraint=models.UniqueConstraint(
                fields=("repository", "name", "parent"),
                condition=models.Q(
                    ("deleted_at__isnull", True),
                    ("parent__isnull", False),
                    ("repository__isnull", False),
                ),
                name="unique_case_module_child_repo_name_parent_not_deleted",
            ),
        ),
    ]
