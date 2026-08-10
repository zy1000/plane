from django.db import migrations, models


BACKFILL_BATCH_SIZE = 500


def backfill_sequence_ids(apps, schema_editor):
    """按 (作用域, created_at) 顺序回填作用域内自增序号。

    三个作用域各自从 1 开始（requirement_owner_exactly_one 保证一行只落进一个）。
    历史模型带的是普通 Manager，所以软删的行也会拿到号 —— 这正是我们要的：
    后面加的唯一约束不带 deleted_at 条件，软删行同样占号。
    """
    Requirement = apps.get_model("db", "Requirement")
    counters = {}
    pending = []

    for row in Requirement.objects.order_by("created_at", "id").iterator():
        if row.product_id:
            scope = ("product", row.product_id)
        elif row.project_id:
            scope = ("project", row.project_id)
        else:
            scope = ("library", row.library_id)
        counters[scope] = counters.get(scope, 0) + 1
        row.sequence_id = counters[scope]
        pending.append(row)
        if len(pending) >= BACKFILL_BATCH_SIZE:
            Requirement.objects.bulk_update(pending, ["sequence_id"])
            pending = []

    if pending:
        Requirement.objects.bulk_update(pending, ["sequence_id"])


class Migration(migrations.Migration):
    """需求编号：作用域内自增序号 + 标准库导入溯源。

    存量行由 RunPython 按创建顺序补号，再加约束 —— 顺序不能颠倒。
    source_* 两列只由导入路径写入，存量行保持 NULL（历史导入无从追溯）。
    """

    dependencies = [("db", "0324_product_library_identifier")]

    operations = [
        migrations.AddField(
            model_name="requirement",
            name="sequence_id",
            field=models.PositiveIntegerField(
                default=1, verbose_name="作用域内自增序号"
            ),
            # 模型上刻意不给 default，见 Requirement.sequence_id 的注释
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirement",
            name="source_library_id",
            field=models.UUIDField(
                blank=True, db_index=True, null=True, verbose_name="来源标准库 ID"
            ),
        ),
        migrations.AddField(
            model_name="requirement",
            name="source_sequence_id",
            field=models.PositiveIntegerField(
                blank=True, null=True, verbose_name="来源标准库条目序号"
            ),
        ),
        migrations.RunPython(
            backfill_sequence_ids, migrations.RunPython.noop, elidable=True
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.UniqueConstraint(
                condition=models.Q(("product__isnull", False)),
                fields=("product", "sequence_id"),
                name="req_unique_product_sequence",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.UniqueConstraint(
                condition=models.Q(("project__isnull", False)),
                fields=("project", "sequence_id"),
                name="req_unique_project_sequence",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.UniqueConstraint(
                condition=models.Q(("library__isnull", False)),
                fields=("library", "sequence_id"),
                name="req_unique_library_sequence",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        ("source_library_id__isnull", True),
                        ("source_sequence_id__isnull", True),
                    ),
                    models.Q(
                        ("source_library_id__isnull", False),
                        ("source_sequence_id__isnull", False),
                    ),
                    _connector="OR",
                ),
                name="req_source_pair_consistent",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.CheckConstraint(
                check=models.Q(
                    ("library__isnull", True),
                    ("source_library_id__isnull", True),
                    _connector="OR",
                ),
                name="req_library_item_has_no_source",
            ),
        ),
    ]
