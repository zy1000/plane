from django.db import migrations


SORT_ORDER_STEP = 1000


def library_requirements_to_items(apps, schema_editor):
    """把标准需求的明细行改挂到标准库上，再删掉中间那层标准需求。

    一个库里原本可能有多条标准需求，各自的 sort_order 都从头开始，直接合并会撞在
    一起；所以按「需求顺序 -> 行顺序」重新连号。
    """
    Requirement = apps.get_model("db", "Requirement")
    RequirementDetail = apps.get_model("db", "RequirementDetail")
    RequirementLibrary = apps.get_model("db", "RequirementLibrary")

    for library in RequirementLibrary.objects.all():
        position = 0
        requirements = Requirement.objects.filter(library_id=library.id).order_by(
            "sort_order", "created_at", "id"
        )
        for requirement in requirements:
            details = RequirementDetail.objects.filter(
                requirement_id=requirement.id
            ).order_by("sort_order", "created_at", "id")
            for detail in details:
                position += 1
                detail.requirement_id = None
                detail.library_id = library.id
                detail.sort_order = position * SORT_ORDER_STEP
                detail.save(update_fields=["requirement", "library", "sort_order"])

    Requirement.objects.filter(library__isnull=False).delete()


def items_to_library_requirements(apps, schema_editor):
    """回滚：每个库还原成一条标准需求，条目重新挂回去。

    原本可能有多条标准需求，那层划分在正向迁移里已经丢了，无法还原；合并成一条
    可以保证回滚不丢明细数据。
    """
    Requirement = apps.get_model("db", "Requirement")
    RequirementDetail = apps.get_model("db", "RequirementDetail")
    RequirementLibrary = apps.get_model("db", "RequirementLibrary")

    for library in RequirementLibrary.objects.select_related("template"):
        details = RequirementDetail.objects.filter(library_id=library.id).order_by(
            "sort_order", "created_at", "id"
        )
        if not details.exists():
            continue
        requirement = Requirement.objects.create(
            workspace_id=library.workspace_id,
            library_id=library.id,
            is_template=False,
            title=library.name,
            status="draft",
            owner_id=library.created_by_id or library.template.owner_id,
            approval_type="any",
            is_active=True,
            sort_order=SORT_ORDER_STEP,
        )
        details.update(requirement_id=requirement.id, library_id=None)


class Migration(migrations.Migration):
    """只搬数据，不碰结构 —— 见 0310 的说明。"""

    dependencies = [
        ('db', '0310_requirement_library_items'),
    ]

    operations = [
        migrations.RunPython(
            library_requirements_to_items,
            items_to_library_requirements,
        ),
    ]
