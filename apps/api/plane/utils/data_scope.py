"""数据权限（白名单）：kind=data 的权限组的 ``data_scope`` 怎么存、怎么算（docs/permission-refactor/split-plan.md）。

存法：``{"projects": <entry>, "products": <entry>}``，entry = ``{"mode": "all" | "selected" | "filter", "ids": [...], "filter": {...}}``。
``filter`` 存项目列表 / 产品列表前端的扁平筛选表达式：``{"and": [{"status__in": "id1,id2"}, {"end_date__lt": "2026-10-12"}]}``，
一个条件 = ``{"<属性>__<操作符>": "<逗号分隔的值>"}``。每次请求现算（请求级缓存），不落快照，新建的项目满足条件就自动命中。

只有数据权限有白名单；成员身份与直通见 utils/visibility.py。文末还放着模板引用（= 全部项目 − 排除列表）的计算。
"""

from datetime import date

from django.db.models import Q

from plane.app.permissions.base import _cache
from plane.db.models import Product, Project, WorkspaceRole, WorkspaceRoleProjectExclusion

SCOPE_KINDS = ("projects", "products")
SCOPE_MODES = ("all", "selected", "filter")
#: 人员字段里的「我」与「未设置」占位值，与前端 PROJECT_FILTER_ME / PROJECT_FILTER_NONE 一致
VALUE_ME = "__me__"
VALUE_NONE = "__none__"

#: 属性 → (类型, ORM 字段)。类型：fk 字典 / user 单个人 / users 多个人（多值关系）/ text 文本 / date 日期 / datetime 带时间
PROJECT_FIELDS = {
    "status": ("fk", "status_id"),
    "project_type": ("fk", "project_type_id"),
    "business_unit": ("fk", "business_unit_id"),
    "business_category": ("fk", "business_category_id"),
    "dev_mode": ("fk", "dev_mode_id"),
    "lead": ("user", "project_lead_id"),
    "product_manager": ("user", "product_manager_id"),
    "members": ("users", "project_projectmember__member_id"),
    "start_date": ("date", "start_date"),
    "end_date": ("date", "end_date"),
    "created_at": ("datetime", "created_at"),
}
PRODUCT_FIELDS = {
    "code": ("text", "code"),
    "stage": ("fk", "stage_id"),
    "category": ("fk", "category_id"),
    "status": ("fk", "status_id"),
    "hardware_level": ("fk", "hardware_level_id"),
    "structure_level": ("fk", "structure_level_id"),
    "software_level": ("fk", "software_level_id"),
    "owner": ("user", "owner_id"),
    "project_lead": ("user", "project_lead_id"),
    "test_lead": ("user", "test_lead_id"),
    "reviewers": ("users", "reviewers__id"),
    "model_number": ("text", "model_number"),
    "external_model": ("text", "external_model"),
    "start_date": ("date", "start_date"),
    "o_phase_close_date": ("date", "o_phase_close_date"),
    "v_phase_close_date": ("date", "v_phase_close_date"),
    "created_at": ("datetime", "created_at"),
    "updated_at": ("datetime", "updated_at"),
}
FIELDS = {"projects": PROJECT_FIELDS, "products": PRODUCT_FIELDS}
MODELS = {"projects": Project, "products": Product}
#: members 条件只认活跃成员；写在同一个 Q 里才会落在同一次 join 上
EXTRA_CONDITIONS = {"project_projectmember__member_id": {"project_projectmember__is_active": True}}

OPTION_OPERATORS = ("in", "exact", "not_in", "not_exact")
DATE_OPERATORS = ("exact", "lt", "gt", "lte", "gte", "range", "not_exact", "not_lt", "not_gt", "not_lte", "not_gte", "not_range")


class DataScopeError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def default_data_scope():
    return {"projects": {"mode": "all"}, "products": {"mode": "all"}}


# ---------------------------------------------------------------------------
# 校验 / 整理
# ---------------------------------------------------------------------------


def _values(raw):
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        items = raw
    else:
        items = str(raw).split(",")
    return [str(item).strip() for item in items if str(item).strip()]


def _conditions(expression):
    """扁平表达式 → [(属性, 操作符, 值列表)]，全部 AND。"""
    if not isinstance(expression, dict):
        raise DataScopeError("筛选条件格式不对")
    result = []
    if "and" in expression:
        children = expression.get("and")
        if not isinstance(children, list):
            raise DataScopeError("筛选条件格式不对")
        for child in children:
            result.extend(_conditions(child))
        return result
    for key, raw in expression.items():
        index = key.rfind("__")
        if index <= 0 or index == len(key) - 2:
            raise DataScopeError(f"筛选条件 {key} 格式不对")
        result.append((key[:index], key[index + 2 :], _values(raw)))
    return result


def _check_date(value):
    try:
        date.fromisoformat(value[:10])
    except ValueError:
        raise DataScopeError(f"日期 {value} 格式不对") from None


def validate_expression(expression, kind):
    """检查属性、操作符、值都认识；没有条件视为无效（「按条件」必须至少一条）。"""
    fields = FIELDS[kind]
    conditions = [c for c in _conditions(expression) if c[2]]
    if not conditions:
        raise DataScopeError("按条件的白名单至少要有一个条件")
    for prop, operator, values in conditions:
        if prop not in fields:
            raise DataScopeError(f"不支持的筛选属性：{prop}")
        field_type = fields[prop][0]
        if field_type in ("date", "datetime"):
            if operator not in DATE_OPERATORS:
                raise DataScopeError(f"{prop} 不支持操作符 {operator}")
            for value in values:
                _check_date(value)
        elif operator not in OPTION_OPERATORS:
            raise DataScopeError(f"{prop} 不支持操作符 {operator}")
    return expression


def validate_data_scope(workspace, payload):
    """编辑器提交的 data_scope → 规整后的 JSON；不合法抛 DataScopeError。"""
    if not isinstance(payload, dict):
        raise DataScopeError("数据权限格式不对")
    result = {}
    for kind in SCOPE_KINDS:
        entry = payload.get(kind)
        if entry is None:
            entry = {"mode": "all"}
        if not isinstance(entry, dict) or entry.get("mode") not in SCOPE_MODES:
            raise DataScopeError(f"{kind} 的 mode 只能是 all / selected / filter")
        mode = entry["mode"]
        if mode == "all":
            result[kind] = {"mode": "all"}
        elif mode == "selected":
            ids = list(dict.fromkeys(str(value) for value in entry.get("ids") or [] if value))
            model = MODELS[kind]
            try:
                found = {str(value) for value in model.objects.filter(workspace=workspace, id__in=ids).values_list("id", flat=True)}
            except Exception:  # 非法 uuid
                raise DataScopeError("白名单里有不认识的 id") from None
            missing = [value for value in ids if value not in found]
            if missing:
                raise DataScopeError("白名单里有不属于本工作区的项目 / 产品")
            result[kind] = {"mode": "selected", "ids": ids}
        else:
            result[kind] = {"mode": "filter", "filter": validate_expression(entry.get("filter"), kind)}
    return result


# ---------------------------------------------------------------------------
# 求值
# ---------------------------------------------------------------------------


def _option_q(field, operator, values, user, field_type):
    negate = operator.startswith("not_")
    wanted = []
    want_none = False
    for value in values:
        if value == VALUE_NONE:
            want_none = True
        elif value == VALUE_ME:
            if user is not None and getattr(user, "id", None):
                wanted.append(str(user.id))
        else:
            wanted.append(value)
    q = Q()
    if wanted:
        q = Q(**{f"{field}__in": wanted, **EXTRA_CONDITIONS.get(field, {})})
    if want_none:
        none_q = Q(**{f"{field}__isnull": True})
        if field_type == "text":
            none_q |= Q(**{field: ""})
        q = q | none_q if wanted else none_q
    if not wanted and not want_none:
        return Q(pk__in=[])
    return ~q if negate else q


def _date_q(field, operator, values, field_type):
    negate = operator.startswith("not_")
    op = operator[4:] if negate else operator
    lookup = f"{field}__date" if field_type == "datetime" else field
    days = [value[:10] for value in values]
    if not days:
        return Q()
    if op == "range":
        q = Q()
        if days[0]:
            q &= Q(**{f"{lookup}__gte": days[0]})
        if len(days) > 1 and days[1]:
            q &= Q(**{f"{lookup}__lte": days[1]})
    elif op in ("lt", "gt", "lte", "gte"):
        q = Q(**{f"{lookup}__{op}": days[0]})
    else:
        q = Q(**{lookup: days[0]})
    # 没填日期的行任何日期条件都不命中
    q &= Q(**{f"{field}__isnull": False})
    return ~q if negate else q


def expression_q(expression, kind, user=None):
    """扁平筛选表达式 → Q。没有一条有效条件时什么都不命中。"""
    fields = FIELDS[kind]
    q = Q()
    matched = False
    for prop, operator, values in _conditions(expression):
        if not values or prop not in fields:
            continue
        field_type, field = fields[prop]
        if field_type in ("date", "datetime"):
            q &= _date_q(field, operator, values, field_type)
        else:
            q &= _option_q(field, operator, values, user, field_type)
        matched = True
    return q if matched else Q(pk__in=[])


class ScopeResult:
    """一段白名单算出来的结果：全部，或一组 id。"""

    __slots__ = ("all", "ids")

    def __init__(self, all=False, ids=()):
        self.all = all
        self.ids = frozenset(str(value) for value in ids)

    def contains(self, object_id) -> bool:
        return self.all or str(object_id) in self.ids

    def union(self, other):
        if self.all or other.all:
            return ScopeResult(all=True)
        return ScopeResult(ids=self.ids | other.ids)

    @property
    def is_empty(self):
        return not self.all and not self.ids


EMPTY_SCOPE = ScopeResult()
ALL_SCOPE = ScopeResult(all=True)


def entry_q(entry, kind, user=None):
    """白名单的一段 → Q；``None`` 表示不限制（全部）。"""
    entry = entry if isinstance(entry, dict) else {}
    mode = entry.get("mode", "all")
    if mode == "all":
        return None
    if mode == "selected":
        return Q(id__in=[str(value) for value in entry.get("ids") or []])
    return expression_q(entry.get("filter") or {}, kind, user)


def evaluate_entry(entry, kind, workspace, user=None) -> ScopeResult:
    q = entry_q(entry, kind, user)
    if q is None:
        return ALL_SCOPE
    model = MODELS[kind]
    return ScopeResult(ids=model.objects.filter(workspace=workspace).filter(q).values_list("id", flat=True))


def role_scope(role, kind, workspace, user=None) -> ScopeResult:
    """某个数据权限的项目 / 产品白名单；按请求缓存在 user 上（没有 user 时不缓存）。
    不是数据权限的组没有白名单，返回空。"""
    if role.kind != WorkspaceRole.KIND_DATA:
        return EMPTY_SCOPE
    entry = (role.data_scope or {}).get(kind) if isinstance(role.data_scope, dict) else None
    if user is None:
        return evaluate_entry(entry, kind, workspace)
    cache = _cache(user)
    cache_key = ("scope", kind, role.id)
    if cache_key not in cache:
        cache[cache_key] = evaluate_entry(entry, kind, workspace, user)
    return cache[cache_key]


def preview_entry(entry, kind, workspace, user=None, limit=20):
    """编辑器实时预览：命中数与前几条。"""
    validate_data_scope(workspace, {kind: entry})
    model = MODELS[kind]
    queryset = model.objects.filter(workspace=workspace)
    q = entry_q(entry, kind, user)
    if q is not None:
        queryset = queryset.filter(q)
    queryset = queryset.distinct()
    count = queryset.count()
    rows = list(queryset.order_by("name").values("id", "name", "identifier")[:limit])
    return {"count": count, "items": [{**row, "id": str(row["id"])} for row in rows]}


# ---------------------------------------------------------------------------
# 模板引用 = 工作区全部项目 − 排除列表
# ---------------------------------------------------------------------------


def excluded_project_ids(role, user=None) -> frozenset:
    """模板的排除项目 id。传 ``user`` 时按请求缓存：一次取整个工作区全部模板的排除行（表很小），
    列表页逐项目判断引用时不再每个项目查一次；不传 ``user`` 直查，写完排除行紧接着读的地方用这条路径。"""
    if user is None:
        return frozenset(
            str(value) for value in WorkspaceRoleProjectExclusion.objects.filter(role=role).values_list("project_id", flat=True)
        )
    cache = _cache(user)
    cache_key = ("template_exclusions", role.workspace_id)
    if cache_key not in cache:
        by_role = {}
        for role_id, project_id in WorkspaceRoleProjectExclusion.objects.filter(
            role__workspace_id=role.workspace_id
        ).values_list("role_id", "project_id"):
            by_role.setdefault(role_id, set()).add(str(project_id))
        cache[cache_key] = {role_id: frozenset(ids) for role_id, ids in by_role.items()}
    return cache[cache_key].get(role.id, frozenset())


def template_references_project(role, project_id, user=None) -> bool:
    """模板现在引不引用这个项目：是项目权限模板、没被排除。新建项目不用写任何数据就自动被引用。"""
    if role.kind != WorkspaceRole.KIND_PROJECT_TEMPLATE or role.deleted_at is not None:
        return False
    return str(project_id) not in excluded_project_ids(role, user)


def template_referenced_project_ids(role) -> list:
    """模板的「引用项目」：工作区全部项目 id（不含已排除）。"""
    if role.kind != WorkspaceRole.KIND_PROJECT_TEMPLATE:
        return []
    ids = {str(value) for value in Project.objects.filter(workspace_id=role.workspace_id).values_list("id", flat=True)}
    return sorted(ids - excluded_project_ids(role))


def referencing_templates(project, user=None):
    """引用了这个项目的模板（项目「权限组」页的引用行）：全部模板减去把本项目排除了的。"""
    return list(
        WorkspaceRole.objects.filter(workspace_id=project.workspace_id, kind=WorkspaceRole.KIND_PROJECT_TEMPLATE)
        .exclude(project_exclusions__project=project)
        .order_by("created_at")
    )
