from django.db import migrations


SORT_ORDER_STEP = 1000
BATCH_SIZE = 500


def _field_tree(fields):
    """字段行 -> 嵌套树。

    刻意在迁移里写一份本地副本，而不是 import plane.utils.requirement 的
    field_tree_from_specs —— 迁移必须能在应用代码往后演进之后仍然复现当时的行为。
    """
    children_by_parent = {}
    roots = []
    for field in fields:
        payload = {
            "id": str(field.id),
            "name": field.name,
            "field_type": field.field_type,
            "is_required": field.is_required,
            "is_active": field.is_active,
            "sort_order": field.sort_order,
            "config": field.config or {},
            "default_value": field.default_value,
            "field_category": field.field_category,
            "requirement_type_id": str(field.requirement_type_id),
            "children": [],
        }
        if field.parent_field_id:
            children_by_parent.setdefault(str(field.parent_field_id), []).append(payload)
        else:
            roots.append(payload)
    for payload in roots:
        payload["children"] = children_by_parent.get(payload["id"], [])
    return roots


def seed_schema_revisions(apps, schema_editor):
    """给每个已存在的需求类型写第 1 个字段结构修订。

    版本与变更项都以 PROTECT 引用修订行，所以修订必须先于任何审批动作存在 —— 一个从未
    编辑过字段结构的类型本来不会有修订，第一次提交评审时就会取不到。

    diff 留空：这是链条的起点，没有「上一修订」可比。
    """
    RequirementType = apps.get_model("db", "RequirementType")
    RequirementField = apps.get_model("db", "RequirementField")
    RequirementTypeSchemaRevision = apps.get_model("db", "RequirementTypeSchemaRevision")

    pending = []
    touched_ids = []
    for requirement_type in RequirementType.objects.filter(
        current_schema_revision=0
    ).iterator(chunk_size=BATCH_SIZE):
        fields = list(
            RequirementField.objects.filter(
                requirement_type=requirement_type, deleted_at__isnull=True
            ).order_by("sort_order", "created_at", "id")
        )
        pending.append(
            RequirementTypeSchemaRevision(
                requirement_type=requirement_type,
                revision=1,
                fields=_field_tree(fields),
                diff=[],
            )
        )
        touched_ids.append(requirement_type.id)
        if len(pending) >= BATCH_SIZE:
            RequirementTypeSchemaRevision.objects.bulk_create(pending)
            RequirementType.objects.filter(id__in=touched_ids).update(
                current_schema_revision=1
            )
            pending = []
            touched_ids = []

    if pending:
        RequirementTypeSchemaRevision.objects.bulk_create(pending)
        RequirementType.objects.filter(id__in=touched_ids).update(
            current_schema_revision=1
        )


def drop_seeded_revisions(apps, schema_editor):
    """回滚只清掉种子修订 —— 之后由应用写入的修订不在本迁移的职责范围内。"""
    RequirementType = apps.get_model("db", "RequirementType")
    RequirementTypeSchemaRevision = apps.get_model("db", "RequirementTypeSchemaRevision")
    RequirementTypeSchemaRevision.objects.filter(revision=1, diff=[]).delete()
    RequirementType.objects.filter(current_schema_revision=1).update(
        current_schema_revision=0
    )


class Migration(migrations.Migration):
    """给已存在的需求类型种下第一个字段结构修订。

    单独一个迁移而不是并进 0320：Postgres 不允许在同一个事务里对同一张表先 DDL 再 DML
    （pending trigger events），这也是 0313/0314/0315 拆成三步的原因。
    """

    dependencies = [
        ("db", "0320_requirement_per_item_approval"),
    ]

    operations = [
        migrations.RunPython(seed_schema_revisions, drop_seeded_revisions, elidable=False),
    ]
