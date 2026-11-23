"""产品集需求的「使用范围」、产品侧的引用与「转为自有」。

产品集是一行 is_set=True 的产品，它的需求就是普通的产品需求。这里只管三件事：

- 使用范围：产品集里一条需求给集内哪些产品用（RequirementProductScope，一个产品一行）。
- 引用：产品的需求列表 = 自己的需求 ∪ 使用范围含本产品的产品集需求。引用的需求整条
  （内容、状态、优先级、负责人、排期）只有产品集里那一份，实时跟随，产品里一律只读
  （2026-11-23 用户修正：状态也共享）。**写路径不认引用行**：产品自己的 partial_update /
  bulk_save / destroy / set_status 等仍只查 product_id=本产品的行，引用行在那些接口里就是 404；
  要改回产品集改，或者转为自有。
- 转为自有：把引用的需求复制成本产品自己的一条，主编号沿用来源、副编号流水（MP01-3-1），
  同时把本产品从使用范围里拿掉。之后不再跟随产品集；自有那条删掉之前不能重新勾回使用范围。
"""

from copy import deepcopy

from django.db.models import Max, Q

from plane.db.models import Product, Requirement, RequirementProductScope
from plane.utils.requirement import (
    BUILTIN_PARENT_COLUMN,
    builtin_values_from_row,
    field_specs_for_requirement_types,
    get_referenced_requirement_type_ids,
    save_baseline_requirement_batch,
)
from plane.utils.product_set import member_products_queryset
from plane.utils.requirement_module import make_module_path_ensurer, module_path_index



class RequirementScopeError(Exception):
    """使用范围 / 转为自有的业务拒绝。code 给前端分支，detail 是附带数据。"""

    def __init__(self, code, message, status=400, **detail):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.detail = detail

    def payload(self):
        return {"error": self.message, "code": self.code, **self.detail}


# ---------------------------------------------------------------------------
# 展示编号
# ---------------------------------------------------------------------------


def origin_identifier_map(rows):
    """这一批行里「转为自有」的来源产品集 -> 当前编号。没有转来的行时一次查询都不发。"""
    product_ids = {row.origin_product_id for row in rows if row.origin_product_id}
    if not product_ids:
        return {}
    return dict(Product.all_objects.filter(id__in=product_ids).values_list("id", "identifier"))


def origin_display_id(row, origin_identifiers):
    """来源的编号（MP01-3）。不是转来的行、或来源产品集已删，返回 None。"""
    prefix = origin_identifiers.get(row.origin_product_id) if row.sub_sequence_id is not None else None
    return f"{prefix}-{row.origin_sequence_id}" if prefix else None


def converted_display_id(row, origin_identifiers):
    """转为自有的行的展示编号（MP01-3-1）。不适用时返回 None，调用方退回普通编号。"""
    origin = origin_display_id(row, origin_identifiers)
    return f"{origin}-{row.sub_sequence_id}" if origin else None


# ---------------------------------------------------------------------------
# 产品侧：自有 ∪ 引用
# ---------------------------------------------------------------------------


def referenced_requirement_ids(product_id):
    """使用范围含这个产品的需求 id（子查询）。"""
    return RequirementProductScope.objects.filter(product_id=product_id).values("requirement_id")


def has_references(product):
    return bool(product.product_set_id) and RequirementProductScope.objects.filter(product_id=product.id).exists()


def product_rows_queryset(product):
    """产品需求列表的行：自有 ∪ 引用。只给读路径用，写路径仍用 product_id=本产品。

    用 id__in 子查询而不是关联 JOIN：不产生重复行，也不给下游的 select_for_update 引入外连接。
    """
    return Requirement.objects.filter(
        Q(product_id=product.id) | Q(id__in=referenced_requirement_ids(product.id))
    ).order_by("sort_order", "created_at", "id")


def with_referenced_types(layer, product):
    """把引用进来的需求用到的需求类型并进 RowLayer，否则这些类型的字段列、筛选在产品里出不来。"""
    if not has_references(product):
        return layer
    type_ids = get_referenced_requirement_type_ids(
        model=Requirement, scope={}, queryset=product_rows_queryset(product)
    )
    fields, fields_by_requirement_type = field_specs_for_requirement_types(type_ids)
    return layer._replace(
        requirement_type_ids=type_ids,
        fields=fields,
        fields_by_requirement_type=fields_by_requirement_type,
    )


def mark_references(rows, product_id):
    """在引用行上记 reference_scope_id（序列化器据此给出 is_reference）。rows 可以是 queryset，返回列表。"""
    rows = list(rows)
    referenced = [row for row in rows if row.product_id != product_id]
    if not referenced:
        return rows
    scopes = {
        scope.requirement_id: scope
        for scope in RequirementProductScope.objects.filter(
            product_id=product_id, requirement_id__in=[row.id for row in referenced]
        )
    }
    for row in referenced:
        scope = scopes.get(row.id)
        if scope is not None:
            row.reference_scope_id = scope.id
    return rows


def get_product_scope(product, requirement_id, *, for_update=False):
    queryset = RequirementProductScope.objects.filter(product_id=product.id, requirement_id=requirement_id)
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    return queryset.first()


# ---------------------------------------------------------------------------
# 产品集侧：使用范围
# ---------------------------------------------------------------------------


def set_member_products(product_set, user):
    """集内产品，只含 user 看得到的。看不到的产品在使用范围里当作不存在：不展示、不改动。"""
    return member_products_queryset(product_set, user).order_by("product_set_joined_at", "created_at")


def scope_product_ids_map(requirement_ids, product_set, user):
    """{需求 id: [产品 id, ...]}，列表「使用范围」列用。只含 user 看得到的产品。"""
    visible_ids = set(set_member_products(product_set, user).values_list("id", flat=True))
    result = {}
    for requirement_id, product_id in RequirementProductScope.objects.filter(
        requirement_id__in=list(requirement_ids), product_id__in=visible_ids
    ).values_list("requirement_id", "product_id"):
        result.setdefault(requirement_id, []).append(product_id)
    return result


def _converted_rows(requirement, product_ids):
    """各产品里由这条需求转成的、还没删的自有需求：{产品 id: 行}。"""
    return {
        row.product_id: row
        for row in Requirement.objects.filter(origin_requirement_id=requirement.id, product_id__in=list(product_ids))
    }


def scope_overview(product_set, requirement, user):
    """使用范围浮层的数据：集内每个（user 看得到的）产品勾没勾、是否已转为自有。"""
    members = list(set_member_products(product_set, user))
    scopes = {
        scope.product_id: scope
        for scope in RequirementProductScope.objects.filter(requirement_id=requirement.id)
    }
    converted = _converted_rows(requirement, [member.id for member in members])
    origin_identifiers = {product_set.id: product_set.identifier}
    return [
        {
            "id": member.id,
            "name": member.name,
            "identifier": member.identifier,
            "in_scope": member.id in scopes,
            # 已转为自有的产品不能再勾：要先删掉自有那条
            "converted_display_id": (
                converted_display_id(converted[member.id], origin_identifiers) if member.id in converted else None
            ),
        }
        for member in members
    ]


def set_requirement_scope(product_set, requirement, product_ids, actor):
    """把需求的使用范围（actor 看得到的那部分）整份换成 product_ids。返回 (新增的产品 id, 移除的产品 id)。

    actor 看不到的产品不在浮层里，也就不会被传回来：它们的范围行原样保留，不当作「取消勾选」。
    """
    wanted = list(dict.fromkeys(str(product_id) for product_id in product_ids))
    members = {str(member.id): member for member in set_member_products(product_set, actor)}
    unknown = [product_id for product_id in wanted if product_id not in members]
    if unknown:
        raise RequirementScopeError(
            "SCOPE_PRODUCT_NOT_IN_SET", "使用范围只能选产品集里的产品。", product_ids=unknown
        )

    current = {
        str(scope.product_id): scope
        for scope in RequirementProductScope.objects.filter(requirement_id=requirement.id, product_id__in=list(members))
    }
    added = [product_id for product_id in wanted if product_id not in current]
    removed = [product_id for product_id in current if product_id not in wanted]

    converted = _converted_rows(requirement, added)
    if converted:
        raise RequirementScopeError(
            "SCOPE_PRODUCT_CONVERTED",
            "有产品已把这条需求转为自有，删除自有的那条后才能重新加入使用范围。",
            status=409,
            product_ids=[str(product_id) for product_id in converted],
        )

    RequirementProductScope.objects.bulk_create(
        [
            RequirementProductScope(
                workspace_id=requirement.workspace_id,
                requirement_id=requirement.id,
                product_id=product_id,
                created_by=actor,
                updated_by=actor,
            )
            for product_id in added
        ]
    )
    if removed:
        RequirementProductScope.objects.filter(
            requirement_id=requirement.id, product_id__in=removed
        ).delete(soft=False)
    return added, removed


#: 批量设置使用范围的三种方式
BULK_SCOPE_MODES = ("add", "remove", "replace")


def bulk_set_requirement_scope(product_set, requirement_ids, product_ids, mode, actor):
    """批量设置一批产品集需求的使用范围。返回 {"updated": 改动了的需求数, "skipped": [...]}。

    - add：给这批需求都加上这些产品；
    - remove：从这批需求里去掉这些产品；
    - replace：这批需求的使用范围都换成这些产品。
    某个产品已把某条需求转为自有时，这一对跳过（不报错），在 skipped 里带回，
    其余照常生效 —— 批量操作不因为个别冲突整批失败。
    """
    wanted = list(dict.fromkeys(str(product_id) for product_id in product_ids))
    # 只在 actor 看得到的产品里增减：replace 不会清掉看不到的产品的范围行
    members = {str(member.id) for member in set_member_products(product_set, actor)}
    unknown = [product_id for product_id in wanted if product_id not in members]
    if unknown:
        raise RequirementScopeError(
            "SCOPE_PRODUCT_NOT_IN_SET", "使用范围只能选产品集里的产品。", product_ids=unknown
        )
    requirements = list(Requirement.objects.filter(product_id=product_set.id, id__in=list(requirement_ids)))
    if len(requirements) != len(set(str(item) for item in requirement_ids)):
        raise RequirementScopeError("SCOPE_REQUIREMENT_NOT_FOUND", "有需求不在这个产品集里。")

    ids = [requirement.id for requirement in requirements]
    current = {}
    for requirement_id, product_id in RequirementProductScope.objects.filter(
        requirement_id__in=ids, product_id__in=list(members)
    ).values_list("requirement_id", "product_id"):
        current.setdefault(requirement_id, set()).add(str(product_id))
    converted = set(
        (requirement_id, str(product_id))
        for requirement_id, product_id in Requirement.objects.filter(
            origin_requirement_id__in=ids, product_id__in=wanted
        ).values_list("origin_requirement_id", "product_id")
    )

    creates, deletes, skipped, updated = [], [], [], 0
    for requirement in requirements:
        have = current.get(requirement.id, set())
        if mode == "add":
            target = have | set(wanted)
        elif mode == "remove":
            target = have - set(wanted)
        else:
            target = set(wanted)
        added = target - have
        for product_id in sorted(added):
            if (requirement.id, product_id) in converted:
                skipped.append({"requirement_id": str(requirement.id), "product_id": product_id})
                added = added - {product_id}
        removed = have - target
        if added or removed:
            updated += 1
        creates += [
            RequirementProductScope(
                workspace_id=requirement.workspace_id,
                requirement_id=requirement.id,
                product_id=product_id,
                created_by=actor,
                updated_by=actor,
            )
            for product_id in added
        ]
        deletes += [(requirement.id, product_id) for product_id in removed]

    RequirementProductScope.objects.bulk_create(creates, batch_size=500)
    if deletes:
        condition = Q()
        for requirement_id, product_id in deletes:
            condition |= Q(requirement_id=requirement_id, product_id=product_id)
        RequirementProductScope.objects.filter(condition).delete(soft=False)
    return {"updated": updated, "skipped": skipped}


def remove_product_scopes(product_id):
    """产品移出产品集：它对产品集需求的引用一并拿掉（已转为自有的需求是它自己的，不动）。"""
    RequirementProductScope.objects.filter(product_id=product_id).delete(soft=False)


def delete_requirement_scopes(requirement_ids):
    """需求删除后清掉它的使用范围行。"""
    RequirementProductScope.objects.filter(requirement_id__in=list(requirement_ids)).delete(soft=False)


# ---------------------------------------------------------------------------
# 转为自有
# ---------------------------------------------------------------------------


def next_converted_display_id(requirement):
    """这条需求再转一次会拿到的编号（MP01-3-1），给「转为自有」确认框预览用。不加锁，仅供展示。"""
    product_set = requirement.product
    return f"{product_set.identifier}-{requirement.sequence_id}-{_next_sub_sequence(requirement)}"


def _next_sub_sequence(requirement):
    """这条来源需求下的下一个副编号。all_objects：流水号不复用，删掉的也占号。
    并发靠调用方已锁住产品集那一行（与产品内取号同一把锁）。"""
    current = Requirement.all_objects.filter(
        origin_product_id=requirement.product_id, origin_sequence_id=requirement.sequence_id
    ).aggregate(value=Max("sub_sequence_id"))["value"]
    return (current or 0) + 1


def _map_module_to_product(requirement, product, actor):
    """来源需求的模块按名称路径在本产品里取或建，同标准库导入的口径。"""
    if not requirement.module_id:
        return None
    path_by_id, _ = module_path_index({"product_id": requirement.product_id})
    path = path_by_id.get(str(requirement.module_id))
    if not path:
        return None
    ensure = make_module_path_ensurer(
        scope_filter={"product_id": product.id}, workspace_id=product.workspace_id, actor=actor
    )
    module = ensure(path)
    return module.id if module else None


def convert_to_own(*, scope_handle, product_scope, actor):
    """把本产品引用的一条产品集需求转成自己的。

    scope_handle 是本产品的需求作用域句柄（调用方已锁本产品行，取本产品的 sequence_id）；
    product_scope 是要转的那条引用（调用方已锁产品集行，取副编号）。返回新建的需求行。

    整条复制产品集当前的值（字段值、描述、状态、优先级、负责人、排期、附件引用、需求类型）；
    父项不带（父项在产品集里，跨不过来）。新行是草稿，要不要评审由本产品决定。
    """
    product = scope_handle.product
    requirement = product_scope.requirement

    builtin = builtin_values_from_row(requirement)
    builtin[BUILTIN_PARENT_COLUMN] = None

    created_rows, _, _ = save_baseline_requirement_batch(
        scope=scope_handle,
        creates=[
            {
                "client_id": requirement.id,
                "data": deepcopy(requirement.data or {}),
                "builtin": builtin,
                "attachments": deepcopy(requirement.attachments or []),
                "requirement_type_id": requirement.requirement_type_id,
                "module_id": _map_module_to_product(requirement, product, actor),
            }
        ],
        updates=[],
        deletes=[],
        actor=actor,
    )
    _, row = created_rows[0]

    row.origin_requirement_id = requirement.id
    row.origin_product_id = requirement.product_id
    row.origin_sequence_id = requirement.sequence_id
    row.sub_sequence_id = _next_sub_sequence(requirement)
    # 创建工厂把状态固定成「未开始」，这里带上产品集当前的状态
    row.status = requirement.status
    Requirement.objects.filter(id=row.id).update(
        origin_requirement_id=row.origin_requirement_id,
        origin_product_id=row.origin_product_id,
        origin_sequence_id=row.origin_sequence_id,
        sub_sequence_id=row.sub_sequence_id,
        status=row.status,
    )
    product_scope.delete()
    return row
