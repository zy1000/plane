"""需求模块（RequirementModule）的领域工具。

模块是标准库 / 产品各自维护的分类树，**不是需求内容**：挂靠与移动不走审批、
不 bump version、不进版本快照与变更单 diff（与 status 同为旁路轴，见
utils/requirement_project.set_requirement_status 的口径说明）。本文件集中
子树展开、树 + 计数装配、旁路写入、库→产品导入时的名称路径映射。
"""

from collections import defaultdict

from django.db.models import Count, Q
from django.utils import timezone

from plane.db.models import RequirementLibrary, RequirementModule


def expand_requirement_module_subtree_ids(module_id):
    """把模块 id 展开为含全部后代的 id 列表（BFS），与树计数口径一致。

    供库条目 / 产品需求 / 项目需求列表按模块过滤共用 —— 选中父模块要能看到
    子模块下的需求。
    """
    expanded = {str(module_id)}
    frontier = [str(module_id)]
    while frontier:
        children = list(
            RequirementModule.objects.filter(parent_id__in=frontier).values_list(
                "id", flat=True
            )
        )
        new_children = [str(c) for c in children if str(c) not in expanded]
        if not new_children:
            break
        expanded.update(new_children)
        frontier = new_children
    return list(expanded)


def module_scope_filter(owner):
    """把行作用域的 owner 翻译成模块的归属过滤条件。

    owner 是 RequirementLibrary（库条目）或携带 product 的审批配置（产品需求），
    与 BaseRequirementRowViewSet.resolve_owner 的两种返回值对应。项目作用域
    没有模块，返回 None —— 调用方据此拒绝挂靠。
    """
    if isinstance(owner, RequirementLibrary):
        return {"library_id": owner.id}
    product_id = getattr(owner, "product_id", None)
    if product_id:
        return {"product_id": product_id}
    return None


def set_requirement_module(scoped_queryset, requirement_ids, *, module_id, actor=None):
    """挂靠 / 移动需求到模块的唯一批量写入口（module_id=None 表示移回「全部」）。

    条件化 `.update()` 而不是逐行 `save()`：模块不算内容，改它不 bump version、
    不碰 approved_row_version、不触发评审；也不判 locked / closed —— 模块轴与
    评审轴、状态轴正交（口径同 set_requirement_status）。模块与行同作用域的
    校验由调用方（视图层）负责。
    """
    ids = list(requirement_ids)
    if not ids:
        return 0
    return scoped_queryset.filter(id__in=ids).update(
        module_id=module_id,
        updated_at=timezone.now(),
        updated_by_id=actor.id if actor else None,
    )


def build_module_tree_payload(*, scope_filter, total_queryset):
    """装配某个库 / 产品的模块树响应：树节点带子树累加计数 + 作用域总数。

    一次聚合查询 + 内存建树，避免逐节点 COUNT / 逐节点查子级的 N+1。
    total 是作用域内**全部**需求数（含未挂靠模块的行）—— 「全部」节点的
    计数口径，与列表不传 module_id 时的行数一致。
    """
    modules = list(
        RequirementModule.objects.filter(**scope_filter)
        .annotate(
            direct_count=Count(
                "requirements", filter=Q(requirements__deleted_at__isnull=True)
            )
        )
        .order_by("sort_order", "created_at", "id")
    )

    children_map = defaultdict(list)
    for module in modules:
        if module.parent_id:
            children_map[module.parent_id].append(module)

    memo = {}

    def subtree_count(module):
        if module.id in memo:
            return memo[module.id]
        total = int(module.direct_count or 0)
        for child in children_map.get(module.id, []):
            total += subtree_count(child)
        memo[module.id] = total
        return total

    def node_payload(module):
        return {
            "id": str(module.id),
            "name": module.name,
            "parent": str(module.parent_id) if module.parent_id else None,
            "sort_order": module.sort_order,
            "count": subtree_count(module),
            "children": [
                node_payload(child) for child in children_map.get(module.id, [])
            ],
        }

    return {
        "modules": [
            node_payload(module) for module in modules if module.parent_id is None
        ],
        "total": total_queryset.count(),
    }


def module_name_map(rows):
    """这一批行引用到的模块 -> 名称，供序列化 context 批量解析。

    写路径（创建 / 导入 / bulk-save）返回的行是内存里新构造的实例，没有
    select_related 可用 —— 逐行取 obj.module 会一行一查，导入 2000 条就是
    2000 次查询。这里按批一次 IN 查询解决，口径同 source_display_id_map。
    """
    module_ids = {row.module_id for row in rows if row.module_id}
    if not module_ids:
        return {}
    return {
        str(module_id): name
        for module_id, name in RequirementModule.objects.filter(
            id__in=module_ids
        ).values_list("id", "name")
    }


def get_or_create_requirement_module(
    *, scope_filter, workspace_id, name, parent, actor=None
):
    """按 (作用域, 同级, 名称) 取或建一个模块，供导入映射逐级建链。

    `scope_filter` 是 module_scope_filter 的产物（`{"product_id": ..}` 或
    `{"library_id": ..}`），库 / 产品通吃。并发下 get_or_create 可能撞出重复行
    （唯一约束兜底后一方拿到 IntegrityError 之前的窗口），与 QA 的同名工具口径
    一致：撞了取最早的那条。
    """
    lookup = {
        **scope_filter,
        "name": name,
        "parent": parent,
    }
    defaults = {"workspace_id": workspace_id}
    if actor is not None:
        defaults["created_by"] = actor
    try:
        module, _ = RequirementModule.objects.get_or_create(**lookup, defaults=defaults)
        return module
    except RequirementModule.MultipleObjectsReturned:
        return (
            RequirementModule.objects.filter(**lookup)
            .order_by("created_at", "id")
            .first()
        )


def module_path_index(scope_filter):
    """一个库 / 产品的模块名称路径索引：`(path_by_id, id_by_path)`。

    一次 values 查询把整棵树载入内存再回溯父链，Excel 导出渲染模块列、导入反查
    模块、库→产品导入回溯源路径共用这一份口径。软删的模块不在
    `RequirementModule.objects` 里，指向它们的行视为无模块（路径为空元组）。
    """
    module_map = {
        str(m["id"]): (m["name"], str(m["parent_id"]) if m["parent_id"] else None)
        for m in RequirementModule.objects.filter(**scope_filter).values(
            "id", "name", "parent_id"
        )
    }
    path_by_id = {}

    def path_of(key):
        if key in path_by_id:
            return path_by_id[key]
        names = []
        visited = set()
        current = key
        while current is not None and current in module_map and current not in visited:
            visited.add(current)
            name, parent = module_map[current]
            names.append(name)
            current = parent
        path = tuple(reversed(names))
        path_by_id[key] = path
        return path

    for key in module_map:
        path_of(key)
    # 同级不重名由唯一约束保证，路径 -> id 因此不会撞
    id_by_path = {path: key for key, path in path_by_id.items() if path}
    return path_by_id, id_by_path


def make_module_path_ensurer(*, scope_filter, workspace_id, actor=None):
    """返回 `ensure(path) -> RequirementModule | None`：按名称路径逐级取或建模块。

    每级前缀都缓存 —— 同一批里 A/B 与 A/C 共享 A，只 get_or_create 一次。空路径
    返回 None（不挂模块）。
    """
    cache = {(): None}

    def ensure(path):
        path = tuple(path)
        if path in cache:
            return cache[path]
        parent = ensure(path[:-1])
        module = get_or_create_requirement_module(
            scope_filter=scope_filter,
            workspace_id=workspace_id,
            name=path[-1],
            parent=parent,
            actor=actor,
        )
        cache[path] = module
        return module

    return ensure


def map_library_modules_to_product(*, library, product, module_by_client_id, actor=None):
    """库→产品导入的模块映射：按源模块的**名称路径**在产品里逐级匹配 / 创建。

    源条目在模块 A/B 下 → 产品按完整路径逐级 get_or_create（A/B 与 A/C 共享 A）；
    源条目无模块（或源模块已软删）→ 不挂。算法与 QA 的模板用例导入
    （views/qa/template.py）一致：源 parent 链一次载入内存，目标链按路径缓存。

    返回 {client_id: 目标模块 id | None}，供导入的 create dict 带上 module_id。
    """
    source_module_ids = {mid for mid in module_by_client_id.values() if mid}
    if not source_module_ids:
        return {}

    source_path_by_id, _ = module_path_index({"library_id": library.id})
    ensure = make_module_path_ensurer(
        scope_filter={"product_id": product.id},
        workspace_id=product.workspace_id,
        actor=actor,
    )

    result = {}
    for client_id, source_module_id in module_by_client_id.items():
        path = source_path_by_id.get(str(source_module_id), ()) if source_module_id else ()
        module = ensure(path)
        result[client_id] = module.id if module else None
    return result
