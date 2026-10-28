"""产品分类 → 标准库受控一级模块的同步规则（实时跟随）。

规则（2026-10-28 用户拍板）：
- 库可选一个产品分类，也可为空；为空的库第一层模块自由维护（存量库全部为空）。
- 选了分类的库：建库时按分类的一级模块建根模块（``category_module`` 指回分类模块）；
  之后分类里新增 / 改名 / 排序 / 删除一级模块，所有用该分类的活库同步变化。
- 库里不能新增、改名、移动、删除第一层，也不能把子模块提成第一层；第一层下面随便建。
- 删分类模块时，若某个库在对应一级模块下还有子模块或条目，整体拦截（409），
  不做部分删除。
"""

from collections import defaultdict

from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from plane.db.models import (
    ProductCategoryModule,
    Requirement,
    RequirementLibrary,
    RequirementModule,
)

ROOT_LOCKED_CODE = "REQUIREMENT_MODULE_ROOT_LOCKED"
CATEGORY_IN_USE_CODE = "PRODUCT_CATEGORY_IN_USE"
CATEGORY_MODULE_IN_USE_CODE = "PRODUCT_CATEGORY_MODULE_IN_USE"


# ---------------------------------------------------------------------------
# 读：分类列表载荷（模块 + 需求数 + 在用库）
# ---------------------------------------------------------------------------


def _root_stats(library_ids):
    """这些库里每个根模块的子树统计：``{root_id: {"children": n, "items": m}}``，
    以及 ``{root_id: (library_id, category_module_id)}``。

    一次取模块、一次按模块聚合条目，内存里沿父链归到根，避免逐模块 COUNT。
    """
    modules = list(
        RequirementModule.objects.filter(library_id__in=library_ids).values(
            "id", "parent_id", "library_id", "category_module_id"
        )
    )
    parent_of = {m["id"]: m["parent_id"] for m in modules}
    root_meta = {
        m["id"]: (m["library_id"], m["category_module_id"])
        for m in modules
        if m["parent_id"] is None
    }

    def root_of(module_id):
        seen = set()
        current = module_id
        while parent_of.get(current) is not None and current not in seen:
            seen.add(current)
            current = parent_of[current]
        return current

    stats = defaultdict(lambda: {"children": 0, "items": 0})
    for m in modules:
        if m["parent_id"] is not None:
            stats[root_of(m["id"])]["children"] += 1
    item_rows = (
        Requirement.objects.filter(library_id__in=library_ids, module_id__isnull=False)
        .values("module_id")
        .annotate(n=Count("id"))
    )
    for row in item_rows:
        if row["module_id"] in parent_of:
            stats[root_of(row["module_id"])]["items"] += row["n"]
    return stats, root_meta


def build_category_payloads(categories):
    """分类列表的响应：每个分类带一级模块（含跨库需求数）与正在用它的活库。"""
    categories = list(categories)
    category_ids = [c.id for c in categories]
    modules_by_category = defaultdict(list)
    for module in ProductCategoryModule.objects.filter(
        category_id__in=category_ids
    ).order_by("sort_order", "created_at", "id"):
        modules_by_category[module.category_id].append(module)

    libraries = list(
        RequirementLibrary.objects.filter(product_category_id__in=category_ids)
        .select_related("requirement_type")
        .order_by("sort_order", "created_at", "id")
    )
    libraries_by_category = defaultdict(list)
    for library in libraries:
        libraries_by_category[library.product_category_id].append(library)

    stats, root_meta = _root_stats([library.id for library in libraries])
    items_by_category_module = defaultdict(int)
    for root_id, (_, category_module_id) in root_meta.items():
        if category_module_id:
            items_by_category_module[category_module_id] += stats[root_id]["items"]

    return [
        {
            "id": str(category.id),
            "name": category.name,
            "sort_order": category.sort_order,
            "modules": [
                {
                    "id": str(module.id),
                    "name": module.name,
                    "sort_order": module.sort_order,
                    "item_count": items_by_category_module.get(module.id, 0),
                }
                for module in modules_by_category.get(category.id, [])
            ],
            "libraries": [
                {
                    "id": str(library.id),
                    "name": library.name,
                    "requirement_type_detail": {
                        "id": str(library.requirement_type_id),
                        "name": library.requirement_type.name,
                        "logo_props": library.requirement_type.logo_props or {},
                    },
                }
                for library in libraries_by_category.get(category.id, [])
            ],
            "created_at": category.created_at,
            "updated_at": category.updated_at,
        }
        for category in categories
    ]


# ---------------------------------------------------------------------------
# 写：分类模块 → 库根模块
# ---------------------------------------------------------------------------


def _active_libraries(category_id):
    return RequirementLibrary.objects.filter(product_category_id=category_id)


def _ensure_library_root(library, category_module, actor=None):
    """给一个库补上某个分类模块对应的根模块（已有就跳过）。

    库里若恰好已有同名、未受控的根模块（理论上不会出现：有分类的库第一层全部受控），
    直接收编它，免得撞同级重名约束。
    """
    if RequirementModule.objects.filter(
        library=library, category_module=category_module
    ).exists():
        return
    existing = RequirementModule.objects.filter(
        library=library,
        parent__isnull=True,
        name=category_module.name,
        category_module__isnull=True,
    ).first()
    if existing is not None:
        existing.category_module = category_module
        existing.sort_order = category_module.sort_order
        existing.save(update_fields=["category_module", "sort_order", "updated_at"])
        return
    RequirementModule.objects.create(
        workspace_id=library.workspace_id,
        library=library,
        parent=None,
        name=category_module.name,
        sort_order=category_module.sort_order,
        category_module=category_module,
        created_by=actor,
    )


def seed_library_root_modules(library, actor=None):
    """建库时按分类的一级模块建根模块。库没有分类时什么也不做。"""
    if not library.product_category_id:
        return
    for category_module in ProductCategoryModule.objects.filter(
        category_id=library.product_category_id
    ).order_by("sort_order", "created_at", "id"):
        _ensure_library_root(library, category_module, actor=actor)


def add_category_module(category, name, actor=None):
    with transaction.atomic():
        module = ProductCategoryModule.objects.create(
            workspace_id=category.workspace_id,
            category=category,
            name=name,
            created_by=actor,
        )
        for library in _active_libraries(category.id):
            _ensure_library_root(library, module, actor=actor)
    return module


MODULE_NAME_MAX_LENGTH = 30


def bulk_add_category_modules(category, raw_names, actor=None):
    """批量添加一级模块：去空格、去空行，按出现顺序追加。

    跳过的三种：分类里已有（exists）、本次输入里重复（duplicate）、超长（too_long）。
    返回 ``(created_names, skipped)``，skipped 是 ``[{"name", "reason"}]``。整批一个事务，
    每个新模块照常同步到所有用该分类的库。
    """
    existing = set(
        ProductCategoryModule.objects.filter(category=category).values_list(
            "name", flat=True
        )
    )
    seen = set()
    to_create, skipped = [], []
    for raw in raw_names:
        name = str(raw or "").strip()
        if not name:
            continue
        if len(name) > MODULE_NAME_MAX_LENGTH:
            skipped.append({"name": name, "reason": "too_long"})
        elif name in existing:
            skipped.append({"name": name, "reason": "exists"})
        elif name in seen:
            skipped.append({"name": name, "reason": "duplicate"})
        else:
            to_create.append(name)
        seen.add(name)
    with transaction.atomic():
        for name in to_create:
            add_category_module(category, name, actor=actor)
    return to_create, skipped


def rename_category_module(module, name, actor=None):
    with transaction.atomic():
        module.name = name
        module.updated_by = actor
        module.save(update_fields=["name", "updated_by", "updated_at"])
        RequirementModule.objects.filter(category_module=module).update(
            name=name, updated_at=timezone.now()
        )
    return module


def reorder_category_modules(category, ordered_modules, step):
    with transaction.atomic():
        for index, module in enumerate(ordered_modules):
            module.sort_order = (index + 1) * step
        ProductCategoryModule.objects.bulk_update(ordered_modules, ["sort_order"])
        for module in ordered_modules:
            RequirementModule.objects.filter(category_module=module).update(
                sort_order=module.sort_order
            )


def category_module_blockers(module):
    """删分类模块前的检查：对应根模块下还有子模块或条目的活库。"""
    roots = list(
        RequirementModule.objects.filter(category_module=module).select_related(
            "library"
        )
    )
    if not roots:
        return []
    stats, _ = _root_stats([root.library_id for root in roots])
    blockers = []
    for root in roots:
        stat = stats.get(root.id, {"children": 0, "items": 0})
        if stat["children"] or stat["items"]:
            blockers.append(
                {
                    "id": str(root.library_id),
                    "name": root.library.name,
                    "child_count": stat["children"],
                    "item_count": stat["items"],
                }
            )
    return blockers


def delete_category_module(module):
    """调用方先确认 category_module_blockers 为空。各库里的空根模块一起硬删。"""
    with transaction.atomic():
        for root in RequirementModule.objects.filter(category_module=module):
            root.delete(soft=False)
        module.delete()


def delete_category(category):
    """调用方先确认没有活库在用。已软删的库解除引用后再硬删（RESTRICT 会算上它们）。"""
    with transaction.atomic():
        RequirementLibrary.all_objects.filter(product_category=category).update(
            product_category=None
        )
        category.delete()


def libraries_using(category):
    return [
        {"id": str(library.id), "name": library.name}
        for library in _active_libraries(category.id).order_by(
            "sort_order", "created_at", "id"
        )
    ]


# ---------------------------------------------------------------------------
# 库侧拦截
# ---------------------------------------------------------------------------


def root_lock_message(library):
    category = library.product_category
    return f"一级模块由产品分类「{category.name}」统一维护，不能新增、改名、移动或删除。"


def root_lock_violation(library, *, module=None, data=None, deleting=False):
    """库侧对模块的写操作是否碰到受控的第一层。返回错误文案或 None。

    - 新建：parent 为空（建根）→ 违规
    - 改：受控模块的 name / parent / sort_order 有实际变化 → 违规；
      普通模块 parent 改成空（提成第一层）→ 违规
    - 删：受控模块 → 违规
    """
    if library is None or not library.product_category_id:
        return None
    data = data or {}
    if module is None:
        return root_lock_message(library) if not data.get("parent") else None
    locked = bool(module.category_module_id)
    if deleting:
        return root_lock_message(library) if locked else None
    if locked:
        if "name" in data and str(data.get("name") or "").strip() != module.name:
            return root_lock_message(library)
        if "parent" in data and data.get("parent"):
            return root_lock_message(library)
        if "sort_order" in data:
            try:
                changed = float(data.get("sort_order")) != float(module.sort_order)
            except (TypeError, ValueError):
                changed = True
            if changed:
                return root_lock_message(library)
        return None
    if "parent" in data and not data.get("parent"):
        return root_lock_message(library)
    return None


def locked_root_names(library):
    """有分类的库：第一层模块名集合（Excel 导入校验用）；没有分类返回 None。"""
    if library is None or not library.product_category_id:
        return None
    return set(
        RequirementModule.objects.filter(
            library=library, parent__isnull=True
        ).values_list("name", flat=True)
    )
