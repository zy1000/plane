import re

from django.db import migrations, models


BACKFILL_BATCH_SIZE = 500

# 中文名挤不出 ASCII 前缀时的回落值
FALLBACK_IDENTIFIER = {"product": "PRD", "library": "LIB"}

IDENTIFIER_MAX_LENGTH = 12


def _seed_identifier(name, fallback):
    """从名称里挤一个 ASCII 前缀出来。

    中文名（本仓库的常态）会被完全滤掉 —— 那就回落到固定前缀，
    交给用户上线后自己在设置里改成有语义的值。
    """
    token = re.sub(r"[^A-Za-z0-9]", "", name or "").upper()[:8]
    if not token or not token[0].isalpha():
        return fallback
    return token


def _backfill(model, fallback):
    """按 (工作区, created_at) 顺序回填，工作区内查重后加数字后缀。

    apps.get_model 拿到的历史模型带的是**普通** Manager
    （SoftDeletionManager 没设 use_in_migrations），所以这里看得到软删的行 ——
    这正是我们要的：软删行也参与去重，免得它哪天被人恢复就撞唯一约束。
    """
    used_by_workspace = {}
    pending = []

    for row in model.objects.order_by("created_at", "id").iterator():
        taken = used_by_workspace.setdefault(row.workspace_id, set())
        base = _seed_identifier(row.name, fallback)
        candidate = base
        suffix = 1
        while candidate in taken:
            suffix += 1
            tail = str(suffix)
            candidate = f"{base[: IDENTIFIER_MAX_LENGTH - len(tail)]}{tail}"
        taken.add(candidate)
        row.identifier = candidate
        pending.append(row)
        if len(pending) >= BACKFILL_BATCH_SIZE:
            model.objects.bulk_update(pending, ["identifier"])
            pending = []

    if pending:
        model.objects.bulk_update(pending, ["identifier"])


def backfill_identifiers(apps, schema_editor):
    _backfill(apps.get_model("db", "Product"), FALLBACK_IDENTIFIER["product"])
    _backfill(
        apps.get_model("db", "RequirementLibrary"), FALLBACK_IDENTIFIER["library"]
    )


class Migration(migrations.Migration):
    """产品与标准库的标识 —— 需求编号（ECOM-1 / SEC-12）的前缀。

    NOT NULL 加到已有表：AddField 带 default="" + preserve_default=False，
    Postgres 11+ 只写 catalog 不重写表；随后 RunPython 把每行填成工作区内唯一，
    最后才 AddConstraint。三步必须同序 —— 先加约束会让存量行全撞空串。
    """

    dependencies = [("db", "0323_requirement_type_logo_props")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="identifier",
            field=models.CharField(
                db_index=True,
                default="",
                max_length=12,
                verbose_name="产品标识（需求编号前缀）",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="requirementlibrary",
            name="identifier",
            field=models.CharField(
                db_index=True,
                default="",
                max_length=12,
                verbose_name="标准库标识（条目编号前缀）",
            ),
            preserve_default=False,
        ),
        migrations.RunPython(
            backfill_identifiers, migrations.RunPython.noop, elidable=True
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("identifier", "workspace"),
                name="product_unique_identifier_workspace_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.CheckConstraint(
                check=models.Q(("identifier", ""), _negated=True),
                name="product_identifier_not_blank",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementlibrary",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "identifier"),
                name="requirement_library_unique_workspace_identifier_active",
            ),
        ),
        migrations.AddConstraint(
            model_name="requirementlibrary",
            constraint=models.CheckConstraint(
                check=models.Q(("identifier", ""), _negated=True),
                name="requirement_library_identifier_not_blank",
            ),
        ),
    ]
