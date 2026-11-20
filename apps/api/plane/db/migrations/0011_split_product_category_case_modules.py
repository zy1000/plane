"""产品模板的一级模块拆成需求 / 用例两份清单后的存量处理。

拆分前一份清单两类库共用，0010 加的 ``kind`` 默认把现有行全部算作需求清单。这里补上
用例那一份：有模板用例库在用的分类，把它现有的一级模块照搬成用例清单，用例库里的受控根
改指新行，库的第一层保持不变；没有用例库在用的分类，用例清单从空开始。

与 0010 分成两个文件：回退时要先改数据再删列，放在同一个事务里 Postgres 会报
pending trigger events。
"""

from django.db import migrations

KIND_REQUIREMENT = "requirement"
KIND_CASE = "case"


def copy_modules_for_case_repositories(apps, schema_editor):
    ProductCategoryModule = apps.get_model("db", "ProductCategoryModule")
    TestCaseRepository = apps.get_model("db", "TestCaseRepository")
    CaseModule = apps.get_model("db", "CaseModule")

    category_ids = set(
        TestCaseRepository._base_manager.filter(
            product_category__isnull=False, deleted_at__isnull=True
        ).values_list("product_category_id", flat=True)
    )
    for source in ProductCategoryModule._base_manager.filter(
        category_id__in=category_ids, kind=KIND_REQUIREMENT
    ):
        copy = ProductCategoryModule._base_manager.create(
            workspace_id=source.workspace_id,
            category_id=source.category_id,
            kind=KIND_CASE,
            name=source.name,
            sort_order=source.sort_order,
            created_by_id=source.created_by_id,
            updated_by_id=source.updated_by_id,
        )
        CaseModule._base_manager.filter(category_module_id=source.id).update(
            category_module_id=copy.id
        )
    # 剩下还指着需求清单的用例模块只可能是已软删用例库里的残留：解除引用
    CaseModule._base_manager.filter(
        category_module__kind=KIND_REQUIREMENT
    ).update(category_module=None)


def merge_case_modules_back(apps, schema_editor):
    """回退：用例清单并回一份。同名的并到需求那一行，否则直接改回，旧的唯一约束才能重建。"""
    ProductCategoryModule = apps.get_model("db", "ProductCategoryModule")
    CaseModule = apps.get_model("db", "CaseModule")

    for module in ProductCategoryModule._base_manager.filter(kind=KIND_CASE):
        twin = ProductCategoryModule._base_manager.filter(
            category_id=module.category_id, kind=KIND_REQUIREMENT, name=module.name
        ).first()
        if twin is None:
            module.kind = KIND_REQUIREMENT
            module.save(update_fields=["kind"])
        else:
            CaseModule._base_manager.filter(category_module_id=module.id).update(
                category_module_id=twin.id
            )
            module.delete()


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0010_product_category_module_kind"),
    ]

    operations = [
        migrations.RunPython(
            copy_modules_for_case_repositories, merge_case_modules_back
        ),
    ]
