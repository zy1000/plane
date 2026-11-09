"""Field dependencies: scoped validation, evaluation and library binding expansion."""
from copy import deepcopy

from django.core.exceptions import ValidationError
from django.db import transaction


def option_values(field):
    options = field.options or {}
    if not isinstance(options, (dict, list)):
        return []
    raw = options if isinstance(options, list) else options.get("choices", options.get("options", options.get("values", [])))
    if not isinstance(raw, list):
        return []
    return [str(v.get("key", v.get("value"))) if isinstance(v, dict) else str(v) for v in raw]


def sources(linkage):
    return [rule["field_id"] for rule in (linkage or {}).values() if isinstance(rule, dict) and rule.get("field_id")]


def remap_linkage(linkage, mapping):
    result = deepcopy(linkage or {})
    for rule in result.values():
        rule["field_id"] = str(mapping[rule["field_id"]])
    return result


def validate_graph(fields):
    """Validate the entire proposed scope, including incoming references."""
    by_id = {str(f.id): f for f in fields}
    for field in fields:
        linkage = field.linkage
        if not isinstance(linkage, dict) or set(linkage) - {"visibility", "options"}:
            raise ValidationError("字段联动格式不正确")
        for kind, rule in linkage.items():
            if not isinstance(rule, dict) or not isinstance(rule.get("field_id"), str):
                raise ValidationError("请选择联动来源字段")
            source = by_id.get(rule["field_id"])
            if source is None or source.field_type != "select" or not source.is_active:
                raise ValidationError(f"「{field.name}」的来源必须是同一范围内启用的选择字段")
            allowed = option_values(source)
            if kind == "visibility":
                values = rule.get("values")
                if set(rule) != {"field_id", "values"} or not isinstance(values, list) or not values or any(not isinstance(v, str) or v not in allowed for v in values):
                    raise ValidationError(f"「{field.name}」的显示条件包含无效选项")
            else:
                mappings = rule.get("mappings")
                if field.field_type != "select" or set(rule) != {"field_id", "mappings"} or not isinstance(mappings, dict) or not mappings:
                    raise ValidationError("选项联动仅用于选择字段，请配置选项映射")
                targets = option_values(field)
                if any(k not in allowed or not isinstance(v, list) or any(not isinstance(x, str) or x not in targets for x in v) for k, v in mappings.items()):
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


def validate_field(field):
    # Local import avoids a model import cycle.
    from plane.db.models import IssueFieldDefinition, TypeExtraField
    if isinstance(field, IssueFieldDefinition):
        siblings = list(IssueFieldDefinition.objects.filter(workspace_id=field.workspace_id).exclude(pk=field.pk))
    else:
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

        condition = rules.get("visibility")
        shown = field.is_active and (not condition or bool(set(selected(condition["field_id"])) & set(condition["values"])))
        if shown:
            visible.add(key)
        else:
            result[key] = None
        cascade = rules.get("options")
        if cascade:
            choices = set(option_values(field))
            allowed[key] = set(v for s in selected(cascade["field_id"]) for v in cascade["mappings"].get(s, []) if v in choices)
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
    """Atomically bind the dependency closure, resolving library IDs to type IDs."""
    from plane.db.models import IssueFieldDefinition, IssueType, TypeExtraField, Workspace
    Workspace.objects.select_for_update().get(pk=issue_type.workspace_id)
    IssueType.objects.select_for_update().get(pk=issue_type.pk)
    definitions = {str(d.id): d for d in IssueFieldDefinition.objects.filter(workspace_id=issue_type.workspace_id)}
    bindings = {str(f.library_field_id): f for f in TypeExtraField.objects.filter(issue_type=issue_type) if f.library_field_id}
    names = {f.name for f in TypeExtraField.objects.filter(issue_type=issue_type)}
    ordered, visiting, visited = [], set(), set()

    def visit(key):
        if key in visiting:
            raise ValidationError("字段联动存在循环")
        if key in visited:
            return
        definition = definitions.get(key)
        if definition is None:
            raise ValidationError("依赖字段不在当前工作区字段库中")
        visiting.add(key)
        for source in sources(definition.linkage):
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
        linkage = remap_linkage(definition.linkage, {k: str(v.id) for k, v in bindings.items()})
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
