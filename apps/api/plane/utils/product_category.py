"""产品分类 → 标准库受控一级模块的同步规则（实时跟随）。

规则（2026-10-28 用户拍板）：
- 库可选一个产品分类，也可为空；为空的库第一层模块自由维护（存量库全部为空）。
- 选了分类的库：建库时按分类的一级模块建根模块（``category_module`` 指回分类模块）；
  之后分类里新增 / 改名 / 排序 / 删除一级模块，所有用该分类的活库同步变化。
- 库里不能新增、改名、移动、删除第一层，也不能把子模块提成第一层；第一层下面随便建。
- 删分类模块时，若某个库在对应一级模块下还有子模块或条目，整体拦截（409），
  不做部分删除。

2026-11-02 起模板用例库（``TestCaseRepository`` is_template=True）同样可选产品模板，
规则与标准库一致：根模块 ``CaseModule.category_module`` 指回分类模块，条目是用例。
分类载荷与拦截列表里两类库合在一个 ``libraries`` 列表，用 ``kind`` 区分。

并发：建库生成根模块与分类的每次写入都先锁分类行（``lock_category``），彼此排队，
免得「建库读模块列表」和「加模块找在用库」互相看不见对方未提交的数据而漏建根。
加锁顺序统一为 分类行 → 分类模块行 → 库里的根模块。
"""

import uuid
from collections import defaultdict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from plane.db.models import (
    CaseModule,
    ProductCategory,
    ProductCategoryModule,
    Requirement,
    RequirementLibrary,
    RequirementModule,
    TestCase,
    TestCaseRepository,
)

ROOT_LOCKED_CODE = "REQUIREMENT_MODULE_ROOT_LOCKED"
CASE_ROOT_LOCKED_CODE = "CASE_MODULE_ROOT_LOCKED"
CATEGORY_IN_USE_CODE = "PRODUCT_CATEGORY_IN_USE"
CATEGORY_MODULE_IN_USE_CODE = "PRODUCT_CATEGORY_MODULE_IN_USE"

LIBRARY_KIND_REQUIREMENT = "requirement"
LIBRARY_KIND_CASE = "case"


# ---------------------------------------------------------------------------
# 读：分类列表载荷（模块 + 需求数 + 在用库）
# ---------------------------------------------------------------------------


def _fold_root_stats(modules, item_rows, owner_field):
    """把模块行与「每个模块的条目数」沿父链归到根：``{root_id: {"children": n, "items": m}}``，
    以及 ``{root_id: (owner_id, category_module_id)}``。
    """
    parent_of = {m["id"]: m["parent_id"] for m in modules}
    root_meta = {
        m["id"]: (m[owner_field], m["category_module_id"])
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
    for row in item_rows:
        if row["module_id"] in parent_of:
            stats[root_of(row["module_id"])]["items"] += row["n"]
    return stats, root_meta


def _root_stats(library_ids):
    """标准库：一次取模块、一次按模块聚合需求，内存里沿父链归到根，避免逐模块 COUNT。"""
    modules = list(
        RequirementModule.objects.filter(library_id__in=library_ids).values(
            "id", "parent_id", "library_id", "category_module_id"
        )
    )
    item_rows = (
        Requirement.objects.filter(library_id__in=library_ids, module_id__isnull=False)
        .values("module_id")
        .annotate(n=Count("id"))
    )
    return _fold_root_stats(modules, item_rows, "library_id")


def _case_root_stats(repository_ids):
    """模板用例库：同 ``_root_stats``，条目是用例。

    用例按「挂在这些库的模块上」统计，不按 TestCase.repository 过滤：update-module
    不校验同库，别的库的用例也可能挂进来，删根时会被级联硬删，必须算进去。
    """
    modules = list(
        CaseModule.objects.filter(repository_id__in=repository_ids).values(
            "id", "parent_id", "repository_id", "category_module_id"
        )
    )
    item_rows = (
        TestCase.objects.filter(module__repository_id__in=repository_ids)
        .values("module_id")
        .annotate(n=Count("id"))
    )
    return _fold_root_stats(modules, item_rows, "repository_id")


def build_category_payloads(categories):
    """分类列表的响应：每个分类带一级模块（含跨库条目数 = 需求数 + 用例数）与正在用它的
    活库（标准库在前、模板用例库在后，``kind`` 区分）。"""
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

    repositories = list(
        TestCaseRepository.objects.filter(
            product_category_id__in=category_ids
        ).order_by("created_at", "id")
    )
    repositories_by_category = defaultdict(list)
    for repository in repositories:
        repositories_by_category[repository.product_category_id].append(repository)

    items_by_category_module = defaultdict(int)
    for stats, root_meta in (
        _root_stats([library.id for library in libraries]),
        _case_root_stats([repository.id for repository in repositories]),
    ):
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
                    "kind": LIBRARY_KIND_REQUIREMENT,
                    "requirement_type_detail": {
                        "id": str(library.requirement_type_id),
                        "name": library.requirement_type.name,
                        "logo_props": library.requirement_type.logo_props or {},
                    },
                }
                for library in libraries_by_category.get(category.id, [])
            ]
            + [
                {
                    "id": str(repository.id),
                    "name": repository.name,
                    "kind": LIBRARY_KIND_CASE,
                    "requirement_type_detail": None,
                }
                for repository in repositories_by_category.get(category.id, [])
            ],
            "created_at": category.created_at,
            "updated_at": category.updated_at,
        }
        for category in categories
    ]


# ---------------------------------------------------------------------------
# 写：分类模块 → 库根模块
# ---------------------------------------------------------------------------


def lock_category(category_id):
    """锁住分类行，须在事务里调用。建库生成根模块与分类的每次写入都先调它。"""
    list(
        ProductCategory.objects.filter(pk=category_id)
        .select_for_update()
        .values_list("id", flat=True)
    )


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
    """建库时按分类的一级模块建根模块，须在事务里调用。库没有分类时什么也不做。"""
    if not library.product_category_id:
        return
    lock_category(library.product_category_id)
    for category_module in ProductCategoryModule.objects.filter(
        category_id=library.product_category_id
    ).order_by("sort_order", "created_at", "id"):
        _ensure_library_root(library, category_module, actor=actor)


def _active_repositories(category_id):
    return TestCaseRepository.objects.filter(product_category_id=category_id)


def _ensure_repository_root(repository, category_module, actor=None):
    """模板用例库版的 ``_ensure_library_root``（CaseModule 没有 workspace 列）。"""
    if CaseModule.objects.filter(
        repository=repository, category_module=category_module
    ).exists():
        return
    existing = CaseModule.objects.filter(
        repository=repository,
        parent__isnull=True,
        name=category_module.name,
        category_module__isnull=True,
    ).first()
    if existing is not None:
        existing.category_module = category_module
        existing.sort_order = category_module.sort_order
        existing.save(update_fields=["category_module", "sort_order", "updated_at"])
        return
    CaseModule.objects.create(
        repository=repository,
        parent=None,
        name=category_module.name,
        sort_order=category_module.sort_order,
        category_module=category_module,
        created_by=actor,
    )


def seed_repository_root_modules(repository, actor=None):
    """建模板用例库时按分类的一级模块建根模块，须在事务里调用。库没有分类时什么也不做。"""
    if not repository.product_category_id:
        return
    lock_category(repository.product_category_id)
    for category_module in ProductCategoryModule.objects.filter(
        category_id=repository.product_category_id
    ).order_by("sort_order", "created_at", "id"):
        _ensure_repository_root(repository, category_module, actor=actor)


def add_category_module(category, name, actor=None):
    with transaction.atomic():
        lock_category(category.id)
        module = ProductCategoryModule.objects.create(
            workspace_id=category.workspace_id,
            category=category,
            name=name,
            created_by=actor,
        )
        for library in _active_libraries(category.id):
            _ensure_library_root(library, module, actor=actor)
        for repository in _active_repositories(category.id):
            _ensure_repository_root(repository, module, actor=actor)
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
        lock_category(module.category_id)
        module.name = name
        module.updated_by = actor
        module.save(update_fields=["name", "updated_by", "updated_at"])
        RequirementModule.objects.filter(category_module=module).update(
            name=name, updated_at=timezone.now()
        )
        CaseModule.objects.filter(category_module=module).update(
            name=name, updated_at=timezone.now()
        )
    return module


def reorder_category_modules(category, ordered_modules, step):
    with transaction.atomic():
        lock_category(category.id)
        for index, module in enumerate(ordered_modules):
            module.sort_order = (index + 1) * step
        ProductCategoryModule.objects.bulk_update(ordered_modules, ["sort_order"])
        for module in ordered_modules:
            RequirementModule.objects.filter(category_module=module).update(
                sort_order=module.sort_order
            )
            CaseModule.objects.filter(category_module=module).update(
                sort_order=module.sort_order
            )


def category_module_blockers(module):
    """删分类模块前的检查：对应根模块下还有子模块或条目的活库（标准库在前、用例库在后）。"""
    blockers = []
    roots = list(
        RequirementModule.objects.filter(category_module=module).select_related(
            "library"
        )
    )
    if roots:
        stats, _ = _root_stats([root.library_id for root in roots])
        for root in roots:
            stat = stats.get(root.id, {"children": 0, "items": 0})
            if stat["children"] or stat["items"]:
                blockers.append(
                    {
                        "id": str(root.library_id),
                        "name": root.library.name,
                        "kind": LIBRARY_KIND_REQUIREMENT,
                        "child_count": stat["children"],
                        "item_count": stat["items"],
                    }
                )
    case_roots = list(
        CaseModule.objects.filter(category_module=module)
        .select_related("repository")
        .order_by("repository__created_at", "repository_id")
    )
    if case_roots:
        stats, _ = _case_root_stats([root.repository_id for root in case_roots])
        for root in case_roots:
            stat = stats.get(root.id, {"children": 0, "items": 0})
            if stat["children"] or stat["items"]:
                blockers.append(
                    {
                        "id": str(root.repository_id),
                        "name": root.repository.name,
                        "kind": LIBRARY_KIND_CASE,
                        "child_count": stat["children"],
                        "item_count": stat["items"],
                    }
                )
    return blockers


def lock_category_module_roots(module):
    """删分类模块前加锁，须在事务里调用：依次锁分类行、分类模块行、各用例库里对应的
    受控根（与建库 / 加模块 / 排序 / 改名同一加锁顺序，避免互锁）。

    删用例模块会级联硬删用例；根被锁住后，「检查有没有内容 → 删除」之间别人往根下
    挂用例或建子模块，外键检查要等本事务结束（根已删则失败），不会被悄悄删掉。根下
    已有子模块的情况由 blockers 直接拦下。
    """
    lock_category(module.category_id)
    list(
        ProductCategoryModule.objects.filter(pk=module.pk)
        .select_for_update()
        .values_list("id", flat=True)
    )
    list(
        CaseModule.objects.filter(category_module=module)
        .select_for_update()
        .values_list("id", flat=True)
    )


def delete_category_module(module):
    """调用方先确认 category_module_blockers 为空。各库里的空根模块一起硬删。"""
    with transaction.atomic():
        for root in RequirementModule.objects.filter(category_module=module):
            root.delete(soft=False)
        for root in CaseModule.objects.filter(category_module=module):
            root.delete(soft=False)
        module.delete()


def delete_category(category):
    """调用方先确认没有活库在用。已软删的库解除引用后再硬删（RESTRICT 会算上它们）。"""
    with transaction.atomic():
        RequirementLibrary.all_objects.filter(product_category=category).update(
            product_category=None
        )
        TestCaseRepository.all_objects.filter(product_category=category).update(
            product_category=None
        )
        category.delete()


def libraries_using(category):
    return [
        {"id": str(library.id), "name": library.name, "kind": LIBRARY_KIND_REQUIREMENT}
        for library in _active_libraries(category.id).order_by(
            "sort_order", "created_at", "id"
        )
    ] + [
        {"id": str(repository.id), "name": repository.name, "kind": LIBRARY_KIND_CASE}
        for repository in _active_repositories(category.id).order_by("created_at", "id")
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


# ---------------------------------------------------------------------------
# 模板用例库侧拦截（规则同标准库，另加「改 repository」）
# ---------------------------------------------------------------------------


class CaseModuleRootLocked(APIException):
    """模板用例库的受控第一层被碰到：400 ``{"error", "code"}``。

    直接 raise（不放进 serializer 的 validate，那样会被 DRF 包成列表）；穿出
    ``transaction.atomic()`` 时整单回滚。``str(e)`` 是文案，供 Excel 逐行失败使用。
    """

    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, message):
        self.message = message
        super().__init__({"error": message, "code": CASE_ROOT_LOCKED_CODE})

    def __str__(self):
        return self.message


def case_root_lock_message(repository):
    category = repository.product_category
    return f"一级模块由产品模板「{category.name}」统一维护，不能新增、改名、移动或删除。"


def case_root_missing_message(repository, name, *, column=None):
    prefix = f"「{column}」" if column else ""
    category = repository.product_category
    return f"{prefix}第一层「{name}」不在产品模板「{category.name}」的一级模块中。"


def _same_id(left, right):
    try:
        return uuid.UUID(str(left)) == uuid.UUID(str(right))
    except (TypeError, ValueError, AttributeError):
        return str(left or "") == str(right or "")


def case_root_lock_violation(repository, *, module=None, data=None, deleting=False):
    """模板用例库对模块的写操作是否碰到受控第一层。返回错误文案或 None。

    判定直接复用 ``root_lock_violation``（只看 ``product_category_id`` 与
    ``category_module_id``），另加：改 ``repository`` 时源库或目标库任一绑定了产品模板就拒，
    免得把模块挪进 / 挪出受控库。
    """
    data = data or {}
    if (
        module is not None
        and "repository" in data
        and not _same_id(data.get("repository"), module.repository_id)
    ):
        target = None
        if data.get("repository"):
            try:
                target = (
                    TestCaseRepository.objects.select_related("product_category")
                    .filter(pk=data.get("repository"))
                    .first()
                )
            except (TypeError, ValueError, DjangoValidationError):
                target = None
        for repo in (repository, target):
            if repo is not None and repo.product_category_id:
                return case_root_lock_message(repo)
    if root_lock_violation(repository, module=module, data=data, deleting=deleting):
        return case_root_lock_message(repository)
    return None


def case_locked_root_names(repository):
    """绑定了产品模板的用例库：受控第一层名称集合（导入 / 复制校验用）；没绑定返回 None。"""
    if repository is None or not repository.product_category_id:
        return None
    return set(
        CaseModule.objects.filter(
            repository=repository, parent__isnull=True, category_module__isnull=False
        ).values_list("name", flat=True)
    )
