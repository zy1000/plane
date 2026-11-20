"""用例库模块（CaseRepositoryModule）的领域工具：子树展开、树 + 计数装配。

口径照产品需求模块（utils.requirement_module）：树一次 GET 带回全部节点、子树累加计数、
「全部」总数与「未归类」数；列表按模块过滤时选中父模块要能看到子模块下的库。
"""

from collections import defaultdict

from django.db.models import Count, Q

from plane.db.models import CaseRepositoryModule, TestCase, TestCaseRepository


def expand_repository_module_subtree_ids(module_id):
    """把模块 id 展开为含全部后代的 id 列表（BFS），与树计数口径一致。"""
    expanded = {str(module_id)}
    frontier = [str(module_id)]
    while frontier:
        children = CaseRepositoryModule.objects.filter(parent_id__in=frontier).values_list("id", flat=True)
        new_children = [str(c) for c in children if str(c) not in expanded]
        if not new_children:
            break
        expanded.update(new_children)
        frontier = new_children
    return list(expanded)


def product_repositories(product_id):
    """产品下未删除的用例库（不含模板库）：「全部 / 未归类」计数与模块计数的统一口径。"""
    return TestCaseRepository.objects.filter(product_id=product_id, is_template=False)


def build_repository_module_tree_payload(product_id):
    """产品的用例库模块树：节点带子树累加计数 + 「全部」总数 + 「未归类」数。

    一次聚合查询 + 内存建树，避免逐节点 COUNT。
    """
    modules = list(
        CaseRepositoryModule.objects.filter(product_id=product_id)
        .annotate(
            direct_count=Count(
                "repositories",
                filter=Q(repositories__deleted_at__isnull=True, repositories__is_template=False),
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
            "children": [node_payload(child) for child in children_map.get(module.id, [])],
        }

    repositories = product_repositories(product_id)
    return {
        "modules": [node_payload(module) for module in modules if module.parent_id is None],
        "total": repositories.count(),
        "unassigned": repositories.filter(module_id__isnull=True).count(),
        # 产品下全部用例数：用例库列表页头的统计
        "case_total": TestCase.objects.filter(repository__in=repositories).count(),
    }
