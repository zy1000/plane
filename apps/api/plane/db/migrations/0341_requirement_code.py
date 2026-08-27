from django.db import migrations, models


BACKFILL_BATCH_SIZE = 500


def backfill_library_codes(apps, schema_editor):
    """把存量库条目的编号回填为迁移前的显示值 f"{identifier}-{sequence_id}"。

    含软删行与软删库：source_display_id 读侧用 all_objects 反查来源条目，
    软删的来源条目也必须有 code，否则已导入产品的需求会丢失来源编号。
    历史模型带的是普通 Manager（不过滤软删），这里刻意不加 deleted_at 过滤。

    回填结果天然满足 req_unique_library_code_active：(library, sequence_id)
    全域唯一（req_unique_library_sequence 不带软删条件）。
    """
    Requirement = apps.get_model("db", "Requirement")
    RequirementLibrary = apps.get_model("db", "RequirementLibrary")

    identifiers = dict(RequirementLibrary.objects.values_list("id", "identifier"))
    pending = []

    for row in Requirement.objects.filter(library_id__isnull=False).iterator():
        row.code = f"{identifiers[row.library_id]}-{row.sequence_id}"
        pending.append(row)
        if len(pending) >= BACKFILL_BATCH_SIZE:
            Requirement.objects.bulk_update(pending, ["code"])
            pending = []

    if pending:
        Requirement.objects.bulk_update(pending, ["code"])


class Migration(migrations.Migration):
    """标准库条目编号改为用户手填的 code 列。

    存量条目回填为迁移前的显示值，再加约束 —— 顺序不能颠倒。
    产品/项目行保持 NULL，它们的编号仍由 identifier + sequence_id 读时拼接。
    """

    dependencies = [("db", "0340_requirementmodule_requirement_module_and_more")]

    operations = [
        migrations.AddField(
            model_name="requirement",
            name="code",
            field=models.CharField(
                blank=True, max_length=255, null=True, verbose_name="库条目编号（手填）"
            ),
        ),
        migrations.RunPython(
            backfill_library_codes, migrations.RunPython.noop, elidable=True
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("library__isnull", False), ("deleted_at__isnull", True)
                ),
                fields=("library", "code"),
                name="req_unique_library_code_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("library__isnull", False),
                    ("code__isnull", True),
                    _connector="OR",
                ),
                name="req_code_only_on_library_item",
            ),
        ),
    ]
