"""选择字段引用数据字典（选项来源）。

字段（``IssueFieldDefinition`` / ``TypeExtraField``）的 ``dictionary`` 非空时，选项取自该字典：``options.choices``
冗余存一份字典值（顺序同字典），读侧（字段值校验、联动、导出、筛选、前端）照旧读 options，不需要知道字典的存在。

字典值增删、改名、排序之后调 ``sync_dictionary_fields``：把最新的值写回全部引用它的字段，清掉默认值、联动规则里
已不存在的值；改名时连同已填在工作项上的值一起改（值按文字存，不存字典值 id）。删掉的值不动工作项：原文字保留。
"""

from copy import deepcopy

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q

from plane.utils.field_linkage import KINDS, linkage_rules

#: 不能当选项来源的字典：角色有自己的设置页，值的含义是岗位不是选项
UNBINDABLE_DICTIONARY_KEYS = ("job_role",)

BATCH_SIZE = 500


def dictionary_labels(dictionary_id):
    from plane.db.models import DataDictionaryItem

    return list(DataDictionaryItem.objects.filter(dictionary_id=dictionary_id).values_list("label", flat=True))


def _field_workspace_id(field):
    if field.workspace_id:
        return field.workspace_id
    # 还没保存的类型字段：workspace 在 save() 里才从方案带出
    issue_type = getattr(field, "issue_type", None)
    return getattr(issue_type, "workspace_id", None)


def apply_dictionary(field):
    """字段引用了数据字典时校验引用，并把 ``options.choices`` 换成字典值。模型 clean() 与序列化器都走这里。"""
    if not field.dictionary_id:
        return
    from plane.db.models import DataDictionary

    if field.field_type != "select":
        raise ValidationError("只有选择字段可以引用数据字典")
    dictionary = DataDictionary.objects.filter(pk=field.dictionary_id).first()
    if dictionary is None or dictionary.workspace_id != _field_workspace_id(field):
        raise ValidationError("数据字典不存在")
    if dictionary.key in UNBINDABLE_DICTIONARY_KEYS:
        raise ValidationError(f"「{dictionary.name}」不能用作选项来源")
    options = field.options if isinstance(field.options, dict) else {}
    field.options = {**options, "choices": dictionary_labels(dictionary.id)}


def _clean_default(value, keep):
    if isinstance(value, list):
        return keep(value) or None
    if isinstance(value, str):
        kept = keep([value])
        return kept[0] if kept else None
    return value


def _clean_linkage(linkage, is_bound, bound_ids, keep):
    """去掉规则里已不在字典内的值（改名的先换成新名）。

    条件的取值清空后这条规则不可能再命中，整条去掉；可选项清空的规则同样去掉；某种效果一条规则都不剩时去掉该效果。
    """
    if not isinstance(linkage, dict) or not linkage:
        return linkage
    result = {key: value for key, value in linkage.items() if key not in KINDS}
    for kind in KINDS:
        if kind not in linkage:
            continue
        rules = []
        for rule in linkage_rules(linkage, kind):
            rule = deepcopy(rule)
            alive = True
            for condition in rule.get("conditions") or []:
                if condition.get("field_id") in bound_ids:
                    condition["values"] = keep(condition.get("values") or [])
                    alive = alive and bool(condition["values"])
            if kind == "options" and is_bound:
                rule["options"] = keep(rule.get("options") or [])
                alive = alive and bool(rule["options"])
            if alive:
                rules.append(rule)
        if rules:
            result[kind] = {"rules": rules}
    return result


def _rewrite(model, rows, bound_ids, labels, renames):
    """同一联动范围内的字段：引用字典的换选项、清默认值；所有字段清掉指向这些字段的失效联动值。"""
    valid = set(labels)

    def keep(values):
        return [v for v in (renames.get(v, v) for v in values) if v in valid]

    changed = []
    for row in rows:
        before = (row.options, row.default_value, row.linkage)
        is_bound = str(row.id) in bound_ids
        if is_bound:
            options = row.options if isinstance(row.options, dict) else {}
            row.options = {**options, "choices": labels}
            row.default_value = _clean_default(row.default_value, keep)
        row.linkage = _clean_linkage(row.linkage, is_bound, bound_ids, keep)
        if (row.options, row.default_value, row.linkage) != before:
            changed.append(row)
    if changed:
        model.all_objects.bulk_update(changed, ["options", "default_value", "linkage"], batch_size=BATCH_SIZE)


def _rename_values(dictionary_id, renames):
    """已填在工作项上的值跟着改名：单选存字符串，多选存数组。"""
    from plane.db.models import TypeExtraField, TypeExtraFieldValue

    values = TypeExtraFieldValue.all_objects.filter(
        extra_field_id__in=TypeExtraField.all_objects.filter(dictionary_id=dictionary_id).values("id")
    )
    for old, new in renames.items():
        values.filter(value=old).update(value=new)
        rows = list(values.filter(value__contains=[old]))
        for row in rows:
            row.value = [new if v == old else v for v in row.value]
        if rows:
            TypeExtraFieldValue.all_objects.bulk_update(rows, ["value"], batch_size=BATCH_SIZE)


@transaction.atomic
def sync_dictionary_fields(dictionary_id, renames=None):
    """字典值变了之后调用（增 / 删 / 改名 / 排序）。``renames`` 是 ``{旧值: 新值}``。没有字段引用时什么都不做。"""
    from plane.db.models import IssueFieldDefinition, TypeExtraField

    renames = {old: new for old, new in (renames or {}).items() if old != new}
    definitions = list(IssueFieldDefinition.all_objects.filter(dictionary_id=dictionary_id).only("id", "workspace_id"))
    type_ids = set(
        TypeExtraField.all_objects.filter(dictionary_id=dictionary_id).values_list("issue_type_id", flat=True)
    )
    if not definitions and not type_ids:
        return
    labels = dictionary_labels(dictionary_id)
    if definitions:
        # 字段库范围：联动条件按库字段 id 引用
        rows = list(IssueFieldDefinition.all_objects.filter(workspace_id=definitions[0].workspace_id))
        _rewrite(IssueFieldDefinition, rows, {str(d.id) for d in definitions}, labels, renames)
    if type_ids:
        # 类型范围：条件按类型字段 id 引用（库字段的绑定行也在这里，定义列里带着 dictionary）。
        # 字段 id 全局唯一，各类型放一起处理不会串
        rows = list(TypeExtraField.all_objects.filter(issue_type_id__in=type_ids))
        bound_ids = {str(row.id) for row in rows if row.dictionary_id == dictionary_id}
        _rewrite(TypeExtraField, rows, bound_ids, labels, renames)
    if renames:
        _rename_values(dictionary_id, renames)


def dictionary_field_references(dictionary):
    """数据字典页「引用字段」：引用该字典的字段库字段，以及类型上的私有字段（库字段的绑定行不单列）。"""
    from plane.db.models import IssueFieldDefinition, TypeExtraField

    rows = [
        {
            "id": str(definition.id),
            "name": definition.name,
            "source": "library",
            "binding_count": definition.binding_count,
            "issue_type_name": None,
            "project_name": None,
        }
        for definition in IssueFieldDefinition.objects.filter(dictionary_id=dictionary.id)
        .annotate(binding_count=Count("bindings", filter=Q(bindings__deleted_at__isnull=True), distinct=True))
        .order_by("sort_order", "created_at")
    ]
    for field in (
        TypeExtraField.objects.filter(
            dictionary_id=dictionary.id, library_field__isnull=True, issue_type__deleted_at__isnull=True
        )
        .select_related("issue_type", "scheme__project")
        .order_by("name", "created_at")
    ):
        project = field.scheme.project if field.scheme.project_id else None
        rows.append(
            {
                "id": str(field.id),
                "name": field.name,
                "source": "type",
                "binding_count": None,
                "issue_type_name": field.issue_type.name,
                "project_name": project.name if project else None,
            }
        )
    return rows


def is_dictionary_bound(dictionary_id):
    from plane.db.models import IssueFieldDefinition, TypeExtraField

    return (
        IssueFieldDefinition.objects.filter(dictionary_id=dictionary_id).exists()
        or TypeExtraField.objects.filter(dictionary_id=dictionary_id, issue_type__deleted_at__isnull=True).exists()
    )


def release_inactive_references(dictionary_id):
    """删字典前解开已删除字段留下的引用（外键是 RESTRICT，软删的行会挡住硬删）。调用前先确认 ``is_dictionary_bound`` 为否。"""
    from plane.db.models import IssueFieldDefinition, TypeExtraField

    IssueFieldDefinition.all_objects.filter(dictionary_id=dictionary_id).update(dictionary_id=None)
    TypeExtraField.all_objects.filter(dictionary_id=dictionary_id).update(dictionary_id=None)
