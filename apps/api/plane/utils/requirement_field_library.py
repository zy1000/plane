"""需求通用字段库（RequirementFieldDefinition）的读写与同步。

库字段的定义（名称 / 类型 / 必填 / 配置 / 默认值，表单还有整组子字段）全工作区统一；
需求类型通过 ``RequirementField.library_field`` 绑定它，绑定行冗余存一份定义。这里是
「库 → 绑定行」的唯一执行点，两条路径都走 ``expand_library_bound_payloads``：

- 需求类型配置页保存：绑定节点的定义以库为准，客户端发什么都会被盖掉；
- 库字段保存：对每个绑定它的类型重放一次 ``sync_requirement_type_fields``，清理失效值、
  写字段结构修订、重裁待审变更项都复用那条现成的路径。

排序、纳入标准库、启停不在库里，各类型自己定。
"""

from copy import deepcopy
from uuid import UUID

from django.db import transaction
from django.db.models import Max

from plane.db.models import (
    RequirementField,
    RequirementFieldDefinition,
    RequirementType,
)
from plane.utils.requirement import (
    SORT_ORDER_STEP,
    RequirementDataLossError,
    serialize_requirement_type_field_tree,
    sync_requirement_type_fields,
)


class RequirementFieldLibraryError(ValueError):
    """库字段规则被违反；message 直接给前端 toast 显示。"""

    def __init__(self, message, code=None):
        self.code = code
        super().__init__(message)


class RequirementFieldLibraryDataLoss(Exception):
    """保存库字段会清掉已有的字段值。affected 是 [(需求类型, 受影响需求条数)]。"""

    def __init__(self, affected):
        self.affected = affected
        super().__init__("Saving this common field will remove existing requirement values.")


def load_definitions(workspace_id, definition_ids=None):
    """根定义列表；每个根带 ``child_definitions``（表单子字段，按库里的顺序）。"""
    roots = RequirementFieldDefinition.objects.filter(
        workspace_id=workspace_id, parent__isnull=True
    )
    if definition_ids is not None:
        roots = roots.filter(id__in=list(definition_ids))
    roots = list(roots.order_by("sort_order", "created_at", "id"))
    children_by_parent = {}
    for child in RequirementFieldDefinition.objects.filter(
        parent_id__in=[root.id for root in roots]
    ).order_by("sort_order", "created_at", "id"):
        children_by_parent.setdefault(child.parent_id, []).append(child)
    for root in roots:
        root.child_definitions = children_by_parent.get(root.id, [])
    return roots


def _definition_values(definition):
    return {
        "name": definition.name,
        "field_type": definition.field_type,
        "is_required": definition.is_required,
        "config": deepcopy(definition.config) or {},
        "default_value": deepcopy(definition.default_value),
    }


def expand_library_bound_payloads(requirement_type, payloads):
    """把字段载荷里绑定了通用字段的根节点换成库里的定义，就地改写并返回同一个列表。

    绑定关系的来源：已有的行看库里存的 ``library_field``（客户端改不了），新节点看载荷
    里的 ``library_field_id``。绑定节点的子字段整组取自库 —— 已有的绑定子行按
    ``library_field`` 对回原行（保住字段 id，值才不丢），库里新增的建新行，库里删掉的
    不进载荷、由 sync_requirement_type_fields 当作删除处理。
    """
    existing = list(RequirementField.objects.filter(requirement_type=requirement_type))
    binding_by_id = {field.id: field.library_field_id for field in existing}

    bound = []
    for payload in payloads:
        field_id = payload.get("id")
        definition_id = (
            binding_by_id.get(field_id) if field_id else payload.get("library_field_id")
        )
        bound.append((payload, definition_id))
        if not definition_id:
            payload.pop("library_field_id", None)
            for child in payload.get("children") or []:
                child.pop("library_field_id", None)

    definition_ids = [definition_id for _, definition_id in bound if definition_id]
    if not definition_ids:
        return payloads
    if len(definition_ids) != len(set(definition_ids)):
        raise RequirementFieldLibraryError("同一个通用字段在一个需求类型里只能添加一次。")

    definitions = {
        definition.id: definition
        for definition in load_definitions(requirement_type.workspace_id, definition_ids)
    }
    bound_children = {}
    for field in existing:
        if field.parent_field_id and field.library_field_id:
            bound_children.setdefault(field.parent_field_id, {})[field.library_field_id] = field

    for payload, definition_id in bound:
        if not definition_id:
            continue
        definition = definitions.get(definition_id)
        if definition is None:
            if payload.get("id"):
                # 库字段已不在（删除时解绑还没落到这一行）：当作私有字段原样保存
                continue
            raise RequirementFieldLibraryError("所选通用字段已不存在，请刷新后重试。")

        payload.update(_definition_values(definition))
        payload["library_field_id"] = definition.id
        if definition.is_required:
            # 必填字段必须纳入标准库，否则库条目天生缺它（见 RequirementFieldNodeWriteSerializer）
            payload["show_in_library"] = True

        rows = bound_children.get(payload.get("id"), {})
        children = []
        for child_definition in definition.child_definitions:
            row = rows.get(child_definition.id)
            child = {
                **_definition_values(child_definition),
                "library_field_id": child_definition.id,
                "is_active": True,
                "show_in_library": (
                    True
                    if row is None or child_definition.is_required
                    else row.show_in_library
                ),
            }
            if row is not None:
                child["id"] = row.id
            children.append(child)
        payload["children"] = children
    return payloads


def annotate_library_bindings(requirement_type, tree):
    """给字段树的每个节点补上 ``library_field_id``（未绑定为 None）。

    只给需求类型配置接口用。不放进 RequirementFieldSpec：那份形状同时是字段结构修订与
    版本快照的内容，多一个键会让所有类型在下一次保存时都记一条「字段结构变更」。
    """
    bindings = {
        str(field_id): str(definition_id)
        for field_id, definition_id in RequirementField.objects.filter(
            requirement_type=requirement_type, library_field__isnull=False
        ).values_list("id", "library_field_id")
    }
    for node in tree:
        node["library_field_id"] = bindings.get(node["id"])
        for child in node.get("children") or []:
            child["library_field_id"] = bindings.get(child["id"])
    return tree


def definition_usage(definition_ids):
    """{库字段 id: [{requirement_type_id, name, logo_props}]} —— 绑定它的需求类型。

    回收站里的绑定行也算在用：值还在，库字段删掉它们就恢复不回来了。
    """
    usage = {}
    rows = (
        RequirementField.objects.filter(
            library_field_id__in=list(definition_ids),
            parent_field__isnull=True,
            requirement_type__deleted_at__isnull=True,
        )
        .select_related("requirement_type")
        .order_by(
            "requirement_type__sort_order",
            "requirement_type__created_at",
            "requirement_type_id",
        )
    )
    for row in rows:
        usage.setdefault(row.library_field_id, []).append(
            {
                "requirement_type_id": str(row.requirement_type_id),
                "name": row.requirement_type.name,
                "logo_props": row.requirement_type.logo_props or {},
            }
        )
    return usage


def _serialize_node(definition):
    return {
        "id": str(definition.id),
        "name": definition.name,
        "field_type": definition.field_type,
        "is_required": definition.is_required,
        "config": deepcopy(definition.config) or {},
        "default_value": deepcopy(definition.default_value),
        "sort_order": definition.sort_order,
    }


def serialize_definitions(definitions):
    """load_definitions 的结果 -> 接口输出（带子字段与使用的需求类型）。"""
    definitions = list(definitions)
    usage = definition_usage([definition.id for definition in definitions])
    return [
        {
            **_serialize_node(definition),
            "children": [
                _serialize_node(child) for child in definition.child_definitions
            ],
            "used_by": usage.get(definition.id, []),
            "created_at": definition.created_at,
            "updated_at": definition.updated_at,
        }
        for definition in definitions
    ]


def _payloads_from_tree(tree):
    """字段树接口的输出 -> sync_requirement_type_fields 吃的载荷（id 还原成 UUID）。"""
    return [
        {
            "id": UUID(node["id"]),
            "name": node["name"],
            "field_type": node["field_type"],
            "is_required": node["is_required"],
            "is_active": node["is_active"],
            "config": deepcopy(node["config"]),
            "default_value": deepcopy(node["default_value"]),
            "show_in_library": node["show_in_library"],
            "children": _payloads_from_tree(node.get("children") or []),
        }
        for node in tree
    ]


def _assert_unique_root_names(requirement_type, payloads):
    """库字段改名后不能和类型里别的字段撞名（类型配置页的唯一性校验同口径：casefold）。"""
    seen = set()
    for payload in payloads:
        key = payload["name"].casefold()
        if key in seen:
            raise RequirementFieldLibraryError(
                f"需求类型「{requirement_type.name}」里已有名为「{payload['name']}」的字段，请先改名。"
            )
        seen.add(key)


def sync_definition_to_types(definition, *, actor=None, confirm_data_loss=False):
    """把库字段当前的定义写到全部绑定它的需求类型。调用方必须已在事务里。

    每个类型各走一遍 sync_requirement_type_fields（keep_root_order：只改定义，不动各类型
    的列序）。会清值而未确认时不在第一个类型上就停，而是把所有类型的受影响条数收齐再抛
    RequirementFieldLibraryDataLoss —— 确认弹窗要一次说清全部影响。抛出后外层事务整体回滚。
    """
    type_ids = (
        RequirementField.objects.filter(
            library_field=definition, parent_field__isnull=True
        )
        .values_list("requirement_type_id", flat=True)
        .distinct()
    )
    requirement_types = list(
        RequirementType.objects.select_for_update()
        .filter(id__in=list(type_ids))
        .order_by("sort_order", "created_at", "id")
    )
    affected = []
    for requirement_type in requirement_types:
        payloads = expand_library_bound_payloads(
            requirement_type,
            _payloads_from_tree(serialize_requirement_type_field_tree(requirement_type)),
        )
        _assert_unique_root_names(requirement_type, payloads)
        try:
            # 保存点：这个类型报「会清值」时只回滚它自己，好继续数下一个类型
            with transaction.atomic():
                sync_requirement_type_fields(
                    requirement_type=requirement_type,
                    field_payloads=payloads,
                    actor=actor,
                    confirm_data_loss=confirm_data_loss,
                    keep_root_order=True,
                )
        except RequirementDataLossError as exc:
            affected.append((requirement_type, exc.affected_row_count))
    if affected:
        raise RequirementFieldLibraryDataLoss(affected)
    return len(requirement_types)


def _apply_values(definition, data):
    definition.name = data["name"]
    definition.field_type = data["field_type"]
    definition.is_required = data["is_required"]
    definition.config = deepcopy(data.get("config") or {})
    definition.default_value = deepcopy(data.get("default_value"))


@transaction.atomic
def save_field_definition(
    *, workspace, definition=None, data, actor=None, confirm_data_loss=False
):
    """新建（definition=None）或更新一个通用字段及其子字段，并同步到绑定它的类型。

    data 是 RequirementFieldDefinitionWriteSerializer 校验过的载荷。子字段按 id 对回
    已有的子定义：带 id 的更新、不带的新建、没出现的删除。
    """
    is_new = definition is None
    if is_new:
        last = (
            RequirementFieldDefinition.objects.filter(
                workspace=workspace, parent__isnull=True
            ).aggregate(value=Max("sort_order"))["value"]
            or 0
        )
        definition = RequirementFieldDefinition(
            workspace=workspace, sort_order=last + SORT_ORDER_STEP
        )
        existing_children = {}
    else:
        definition = RequirementFieldDefinition.objects.select_for_update().get(
            pk=definition.pk
        )
        existing_children = {child.id: child for child in definition.children.all()}

    _apply_values(definition, data)
    definition.save()

    kept_ids = set()
    for index, child_data in enumerate(data.get("children") or []):
        child = existing_children.get(child_data.get("id"))
        if child is None:
            child = RequirementFieldDefinition(workspace=workspace, parent=definition)
        _apply_values(child, child_data)
        child.sort_order = (index + 1) * SORT_ORDER_STEP
        child.save()
        kept_ids.add(child.id)
    for child_id, child in existing_children.items():
        if child_id not in kept_ids:
            child.delete()

    if not is_new:
        sync_definition_to_types(
            definition, actor=actor, confirm_data_loss=confirm_data_loss
        )
    return definition


@transaction.atomic
def promote_field_to_definition(field):
    """把需求类型的一个私有根字段原地升级成通用字段：建库定义（连同子字段）并绑定原行。

    字段 id 不变，所以已有的值、筛选条件、历史版本都不受影响。
    """
    field = (
        RequirementField.objects.select_for_update(of=("self",))
        .select_related("requirement_type")
        .get(pk=field.pk)
    )
    if field.parent_field_id:
        raise RequirementFieldLibraryError("只有一级字段可以转为通用字段。")
    if field.library_field_id:
        raise RequirementFieldLibraryError("该字段已经是通用字段。")
    if not field.is_active:
        raise RequirementFieldLibraryError("回收站里的字段不能转为通用字段，请先恢复。")
    children = list(field.sub_fields.order_by("sort_order", "created_at", "id"))
    if any(not child.is_active for child in children):
        raise RequirementFieldLibraryError(
            "该表单有子字段在回收站里，请先恢复或永久删除后再转为通用字段。"
        )

    workspace_id = field.requirement_type.workspace_id
    if RequirementFieldDefinition.objects.filter(
        workspace_id=workspace_id, parent__isnull=True, name__iexact=field.name
    ).exists():
        raise RequirementFieldLibraryError(
            f"通用字段里已有名为「{field.name}」的字段，请先改名。",
            code="REQUIREMENT_FIELD_DEFINITION_NAME_TAKEN",
        )

    last = (
        RequirementFieldDefinition.objects.filter(
            workspace_id=workspace_id, parent__isnull=True
        ).aggregate(value=Max("sort_order"))["value"]
        or 0
    )
    definition = RequirementFieldDefinition(
        workspace_id=workspace_id, sort_order=last + SORT_ORDER_STEP
    )
    _apply_values(definition, _definition_values(field))
    definition.save()
    field.library_field = definition
    field.save(update_fields=["library_field", "updated_at"])

    for index, child in enumerate(children):
        child_definition = RequirementFieldDefinition(
            workspace_id=workspace_id,
            parent=definition,
            sort_order=(index + 1) * SORT_ORDER_STEP,
        )
        _apply_values(child_definition, _definition_values(child))
        child_definition.save()
        child.library_field = child_definition
        child.save(update_fields=["library_field", "updated_at"])
    return definition
