"""模块树的批量新建：一次在某个上级模块下建出一棵子树。

六种模块表（需求 / 用例库 / 用例 / 计划 / 评审 / 报告模块）共用这一套：请求体给
``{"parent": <id|null>, "items": [{"name": "...", "children": [...]}, ...]}``，
视图负责鉴权、作用域与上级合法性，这里只管校验名称和逐层落库。

同级同名不新建：已有的就沿用它当下级的父级（记为「已存在」跳过），本次输入里同级写了
两遍的合并成一个（记为「重复」跳过），所以前端预览与落库结果一致。
"""

from django.db import IntegrityError, transaction
from django.db.models import Max
from rest_framework import status
from rest_framework.response import Response

#: 与各模块表 name 字段的 max_length 一致
MODULE_NAME_MAX_LENGTH = 30
#: 一次最多建多少个、最深几层（防误粘贴整篇文档）
MAX_BULK_MODULES = 500
MAX_BULK_DEPTH = 10
#: 有 sort_order 的表，新模块依次排到同级末尾（步长同默认值）
SORT_ORDER_STEP = 65535

DUPLICATE_NAME_MESSAGE = "同级模块名称已存在"


class BulkModuleError(ValueError):
    pass


def normalize_bulk_items(raw):
    """校验并整理请求里的 items：去首尾空格、丢空名；超长 / 超量 / 超深抛 BulkModuleError。"""
    total = 0

    def walk(nodes, depth):
        nonlocal total
        if not isinstance(nodes, list):
            raise BulkModuleError("items 格式不正确。")
        if nodes and depth > MAX_BULK_DEPTH:
            raise BulkModuleError(f"最多支持 {MAX_BULK_DEPTH} 级。")
        result = []
        for node in nodes:
            if not isinstance(node, dict):
                raise BulkModuleError("items 格式不正确。")
            name = str(node.get("name") or "").strip()
            children = walk(node.get("children") or [], depth + 1)
            if not name:
                continue
            if len(name) > MODULE_NAME_MAX_LENGTH:
                raise BulkModuleError(f"「{name}」超过 {MODULE_NAME_MAX_LENGTH} 个字。")
            total += 1
            if total > MAX_BULK_MODULES:
                raise BulkModuleError(f"一次最多新建 {MAX_BULK_MODULES} 个模块。")
            result.append({"name": name, "children": children})
        return result

    items = walk(raw, 1)
    if not items:
        raise BulkModuleError("请至少填写一个模块名称。")
    return items


def bulk_create_module_tree(*, model, scope, parent, items, extra=None):
    """在 parent（None = 一级）下按 items 逐层建模块，整单一个事务。

    scope：标识这棵树的过滤条件（如 ``{"product_id": ...}``），既用来找同级已有模块，也写进新模块；
    extra：只在新建时额外写入的字段（如 workspace_id）。
    返回 ``{"created": n, "ids": [...], "skipped": [{"name", "reason": "exists"|"duplicate"}]}``。
    """
    extra = extra or {}
    has_sort = any(field.name == "sort_order" for field in model._meta.fields)
    created_ids = []
    created_set = set()
    skipped = []

    def walk(parent_obj, nodes):
        siblings = model.objects.filter(parent=parent_obj, **scope)
        existing = {module.name: module for module in siblings}
        next_sort = None
        if has_sort:
            next_sort = (siblings.aggregate(m=Max("sort_order"))["m"] or 0) + SORT_ORDER_STEP
        for node in nodes:
            name = node["name"]
            target = existing.get(name)
            if target is None:
                target = model(name=name, parent=parent_obj, **scope, **extra)
                if has_sort:
                    target.sort_order = next_sort
                    next_sort += SORT_ORDER_STEP
                target.save()
                existing[name] = target
                created_ids.append(str(target.id))
                created_set.add(target.id)
            else:
                skipped.append({"name": name, "reason": "duplicate" if target.id in created_set else "exists"})
            if node["children"]:
                walk(target, node["children"])

    with transaction.atomic():
        walk(parent, items)
    return {"created": len(created_ids), "ids": created_ids, "skipped": skipped}


def bulk_create_response(*, model, scope, parent, raw_items, extra=None):
    """视图用的一站式封装：校验 → 落库 → Response（名称不合规 / 撞唯一约束都回 400）。"""
    try:
        items = normalize_bulk_items(raw_items)
    except BulkModuleError as error:
        return Response({"error": str(error)}, status=status.HTTP_400_BAD_REQUEST)
    try:
        result = bulk_create_module_tree(model=model, scope=scope, parent=parent, items=items, extra=extra)
    except IntegrityError:
        return Response({"error": DUPLICATE_NAME_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result, status=status.HTTP_201_CREATED)
