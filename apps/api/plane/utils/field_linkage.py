"""Field dependencies: scoped validation, evaluation and library binding expansion.

linkage 的结构（两种效果各带一个规则列表）::

    {"visibility": {"rules": [{"conditions": [...]}]},
     "options":    {"rules": [{"conditions": [...], "options": ["a", "b"]}]}}

条件有两种：``{"field_id": id, "values": [...]}`` 选择字段选中其中任一值；``{"type_ids": [...]}``
工作项类型是其中之一。一条规则内的条件全部满足才命中；条件显示命中任一规则即显示，可选项联动取命中
规则可选项的并集、都不命中时无可选项。

类型条件只存在于字段库定义（``IssueFieldDefinition``）里，存的是类型库类型的 id。绑定到类型时
``resolve_for_type`` 按该类型筛出适用的规则并去掉类型条件，所以类型字段行（``TypeExtraField``）和
运行时求值（``evaluate_linkage``）都不含类型。
"""
from copy import deepcopy

from django.core.exceptions import ValidationError
from django.db import transaction

KINDS = ("visibility", "options")


def option_values(field):
    options = field.options or {}
    if not isinstance(options, (dict, list)):
        return []
    raw = options if isinstance(options, list) else options.get("choices", options.get("options", options.get("values", [])))
    if not isinstance(raw, list):
        return []
    return [str(v.get("key", v.get("value"))) if isinstance(v, dict) else str(v) for v in raw]


def linkage_rules(linkage, kind):
    block = linkage.get(kind) if isinstance(linkage, dict) else None
    rules = block.get("rules") if isinstance(block, dict) else None
    return rules if isinstance(rules, list) else []


def sources(linkage):
    """规则条件引用到的字段 id，按出现顺序去重。"""
    found = {}
    for kind in KINDS:
        for rule in linkage_rules(linkage, kind):
            for condition in rule["conditions"]:
                if condition.get("field_id"):
                    found[condition["field_id"]] = None
    return list(found)


def remap_linkage(linkage, mapping):
    result = deepcopy(linkage or {})
    for kind in KINDS:
        for rule in linkage_rules(result, kind):
            for condition in rule["conditions"]:
                if "field_id" in condition:
                    condition["field_id"] = str(mapping[condition["field_id"]])
    return result


def resolve_for_type(linkage, type_id):
    """字段库规则 → 某个类型上实际生效的规则：只留适用于该类型的规则，并去掉类型条件。

    没有类型条件的规则适用于所有类型。某种效果在该类型上没有任何适用规则时不产生这种效果
    （规则未涉及的类型不受限制）；条件显示里只剩类型条件的规则等于该类型始终显示，同样不产生效果。
    """
    type_id = str(type_id)
    result = {}
    for kind in KINDS:
        rules = []
        for rule in linkage_rules(linkage, kind):
            if any("type_ids" in c and type_id not in c["type_ids"] for c in rule["conditions"]):
                continue
            resolved = deepcopy(rule)
            resolved["conditions"] = [c for c in resolved["conditions"] if "type_ids" not in c]
            rules.append(resolved)
        if not rules or (kind == "visibility" and any(not rule["conditions"] for rule in rules)):
            continue
        result[kind] = {"rules": rules}
    return result


def _validate_conditions(field, rule, by_id, allow_types, label):
    conditions = rule["conditions"]
    if not isinstance(conditions, list):
        raise ValidationError("字段联动格式不正确")
    seen = set()
    for condition in conditions:
        if not isinstance(condition, dict):
            raise ValidationError("字段联动格式不正确")
        if set(condition) == {"type_ids"}:
            if not allow_types:
                raise ValidationError(f"「{field.name}」的联动规则不能使用工作项类型条件")
            type_ids = condition["type_ids"]
            if not isinstance(type_ids, list) or not type_ids or any(not isinstance(v, str) for v in type_ids):
                raise ValidationError(f"「{field.name}」的联动规则请选择工作项类型")
            key = "type_ids"
        elif set(condition) == {"field_id", "values"} and isinstance(condition["field_id"], str):
            source = by_id.get(condition["field_id"])
            if source is None or source.field_type != "select" or not source.is_active:
                raise ValidationError(f"「{field.name}」的来源必须是同一范围内启用的选择字段")
            values, allowed = condition["values"], option_values(source)
            if not isinstance(values, list) or not values or any(not isinstance(v, str) or v not in allowed for v in values):
                raise ValidationError(f"「{field.name}」的{label}条件包含无效选项")
            key = condition["field_id"]
        else:
            raise ValidationError("请选择联动条件")
        if key in seen:
            raise ValidationError(f"「{field.name}」的同一条联动规则里条件不能重复")
        seen.add(key)
    return conditions


def validate_graph(fields, allow_types=False):
    """Validate the entire proposed scope, including incoming references.

    ``allow_types``：字段库范围传 True，规则可以带工作项类型条件，且每条规则至少一个条件。
    类型范围不能带类型条件；可选项规则允许无条件（库规则只有类型条件时，落到类型上就是无条件）。
    """
    by_id = {str(f.id): f for f in fields}
    for field in fields:
        linkage = field.linkage
        if not isinstance(linkage, dict) or set(linkage) - set(KINDS):
            raise ValidationError("字段联动格式不正确")
        for kind, block in linkage.items():
            rules = block.get("rules") if isinstance(block, dict) and set(block) == {"rules"} else None
            if not isinstance(rules, list) or not rules:
                raise ValidationError("请至少配置一条联动规则")
            if kind == "options" and field.field_type != "select":
                raise ValidationError("选项联动仅用于选择字段")
            expected = {"conditions"} if kind == "visibility" else {"conditions", "options"}
            label = "显示" if kind == "visibility" else "选项联动"
            targets = option_values(field)
            for rule in rules:
                if not isinstance(rule, dict) or set(rule) != expected:
                    raise ValidationError("字段联动格式不正确")
                conditions = _validate_conditions(field, rule, by_id, allow_types, label)
                if not conditions and (kind == "visibility" or allow_types):
                    raise ValidationError(f"「{field.name}」的联动规则至少需要一个条件")
                if kind == "options":
                    options = rule["options"]
                    if not isinstance(options, list) or any(not isinstance(x, str) or x not in targets for x in options):
                        raise ValidationError(f"「{field.name}」的联动映射包含无效选项，请先调整相关规则")
    visited, visiting = set(), set()

    def visit(key):
        if key in visiting:
            raise ValidationError("字段联动不能引用自身或形成循环")
        if key in visited:
            return
        visiting.add(key)
        for source in sources(by_id[key].linkage):
            visit(source)
        visiting.remove(key)
        visited.add(key)

    for key in by_id:
        visit(key)


def _validate_type_ids(definition):
    """类型条件只能选类型库里的类型（项目方案里的副本靠 library_type 对回库类型）。"""
    from plane.db.models import IssueType
    type_ids = {
        type_id
        for kind in KINDS
        for rule in linkage_rules(definition.linkage, kind)
        for condition in rule["conditions"]
        for type_id in condition.get("type_ids", [])
    }
    if not type_ids:
        return
    known = IssueType.objects.filter(
        id__in=type_ids, workspace_id=definition.workspace_id, scheme__project__isnull=True
    ).count()
    if known != len(type_ids):
        raise ValidationError(f"「{definition.name}」的联动规则里有工作项类型已不存在，请重新选择")


def validate_field(field):
    # Local import avoids a model import cycle.
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    if isinstance(field, IssueFieldDefinition):
        siblings = list(IssueFieldDefinition.objects.filter(workspace_id=field.workspace_id).exclude(pk=field.pk))
        validate_graph([*siblings, field], allow_types=True)
        _validate_type_ids(field)
        return
    previous_type = TypeExtraField.objects.filter(pk=field.pk).values_list("issue_type_id", flat=True).first()
    if previous_type and previous_type != field.issue_type_id:
        validate_graph(list(TypeExtraField.objects.filter(issue_type_id=previous_type).exclude(pk=field.pk)))
    siblings = list(TypeExtraField.objects.filter(issue_type_id=field.issue_type_id).exclude(pk=field.pk))
    validate_graph([*siblings, field])


def dependent_names(field):
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    rows = (IssueFieldDefinition.objects.filter(workspace_id=field.workspace_id) if isinstance(field, IssueFieldDefinition)
            else TypeExtraField.objects.filter(issue_type_id=field.issue_type_id))
    return [f.name for f in rows if str(field.id) in sources(f.linkage)]


def evaluate_linkage(fields, values):
    """Return normalized values, visible IDs and allowed option keys, without writes."""
    by_id = {str(f.id): f for f in fields}
    result, visible, allowed, visiting, done = dict(values), set(), {}, set(), set()

    def evaluate(key):
        if key in done:
            return
        if key in visiting:  # Defensive handling of historical malformed data.
            result[key] = None
            return
        visiting.add(key)
        field = by_id[key]
        rules = field.linkage or {}
        for source in sources(rules):
            if source in by_id:
                evaluate(source)

        def selected(source):
            value = result.get(source) if source in visible else None
            return [str(v) for v in (value if isinstance(value, list) else [value]) if v is not None]

        def matched(kind):
            return [
                rule for rule in linkage_rules(rules, kind)
                if all(set(selected(c.get("field_id"))) & set(c.get("values", [])) for c in rule["conditions"])
            ]

        shown = field.is_active and (not linkage_rules(rules, "visibility") or bool(matched("visibility")))
        if shown:
            visible.add(key)
        else:
            result[key] = None
        if linkage_rules(rules, "options"):
            choices = set(option_values(field))
            allowed[key] = {v for rule in matched("options") for v in rule["options"] if v in choices}
            value = result.get(key)
            if isinstance(value, list):
                result[key] = [v for v in value if str(v) in allowed[key]] or None
            elif value is not None and str(value) not in allowed[key]:
                result[key] = None
        visiting.remove(key)
        done.add(key)

    for key in by_id:
        evaluate(key)
    return result, visible, allowed


@transaction.atomic
def bind_library_dependencies(issue_type, requested_ids):
    """Atomically bind the dependency closure, resolving library IDs to type IDs.

    规则先按这个类型求值（``resolve_for_type``）：依赖只补该类型的规则引用到的字段，绑定行不带类型条件。
    """
    from plane.db.models import IssueFieldDefinition, IssueType, TypeExtraField, Workspace
    Workspace.objects.select_for_update().get(pk=issue_type.workspace_id)
    IssueType.objects.select_for_update().get(pk=issue_type.pk)
    definitions = {str(d.id): d for d in IssueFieldDefinition.objects.filter(workspace_id=issue_type.workspace_id)}
    bindings = {str(f.library_field_id): f for f in TypeExtraField.objects.filter(issue_type=issue_type) if f.library_field_id}
    names = {f.name for f in TypeExtraField.objects.filter(issue_type=issue_type)}
    # 项目方案里的副本按它指回的库类型匹配类型条件
    type_id = issue_type.library_type_id or issue_type.id
    resolved, ordered, visiting, visited = {}, [], set(), set()

    def visit(key):
        if key in visiting:
            raise ValidationError("字段联动存在循环")
        if key in visited:
            return
        definition = definitions.get(key)
        if definition is None:
            raise ValidationError("依赖字段不在当前工作区字段库中")
        resolved[key] = resolve_for_type(definition.linkage, type_id)
        visiting.add(key)
        for source in sources(resolved[key]):
            visit(source)
        visiting.remove(key)
        visited.add(key)
        ordered.append(key)

    for key in requested_ids:
        visit(str(key))
    created = []
    order = max((f.sort_order for f in TypeExtraField.objects.filter(issue_type=issue_type)), default=0)
    for key in ordered:
        definition = definitions[key]
        linkage = remap_linkage(resolved[key], {k: str(v.id) for k, v in bindings.items()})
        if key not in bindings:
            if definition.name in names:
                raise ValidationError(f"类型「{issue_type.name}」已有同名字段「{definition.name}」，请先解决冲突")
            order += 10000
            row = TypeExtraField.objects.create(
                issue_type=issue_type, scheme_id=issue_type.scheme_id, library_field=definition,
                sort_order=order, linkage=linkage, **definition.definition_values(),
            )
            names.add(definition.name)
            bindings[key] = row
            created.append(row)
        else:
            TypeExtraField.objects.filter(pk=bindings[key].pk).update(linkage=linkage)
    return created
