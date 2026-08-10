from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Optional
from uuid import uuid4

from django.db.models import Max, Q
from django.utils import timezone
from django.utils.html import strip_tags

from plane.app.permissions import ROLE
from plane.db.models import (
    Product,
    ProductMember,
    ProjectMember,
    Requirement,
    RequirementApprover,
    RequirementChangeItem,
    RequirementChangeStatus,
    RequirementField,
    RequirementFieldCategory,
    RequirementFieldType,
    RequirementItemStatus,
    RequirementLibrary,
    RequirementPriority,
    RequirementType,
    User,
    Workspace,
    WorkspaceMember,
)


SORT_ORDER_STEP = 1000

# 八个内置字段。它们不是 RequirementField，而是条目表上的真实列 —— 要排序、筛选、
# 建索引，负责人与父项还要靠外键防悬挂，塞进 data 会让这些能力全部退化成 JSONB 取值。
#
# 这里的名字直接是模型属性名（外键用 *_id），因此这份 dict 可以原样当模型 kwargs，
# 也可以原样作为接口里的平铺键。data 从此只装自定义字段。
#
# sequence_id / source_* 不属于这里，别顺手加进来。它们是服务端分配的只读列，
# 而这份 dict 同时是 CONTENT_BUILTIN_COLUMNS 的来源（加进来 → 每次提交评审都显示
# 「编号变了」）、是请求体的平铺键（加进来 → 客户端能自选编号）、也是
# ROLLBACK_RESTORED_COLUMNS 的上游（加进来 → 回滚会把旧编号写回活行）。
# 编号只出现在两个地方：模型字段定义，和 requirement_row_snapshot 的快照顶层。
BUILTIN_COLUMN_DEFAULTS = {
    "title": "",
    "description_html": None,
    "status": RequirementItemStatus.DRAFT.value,
    "priority": RequirementPriority.NONE.value,
    "assignee_id": None,
    "start_date": None,
    "target_date": None,
    "parent_id": None,
}

BUILTIN_COLUMNS = tuple(BUILTIN_COLUMN_DEFAULTS)

# 不算「内容」的内置列。
#
# status 是**交付进度轴**（这条需求做到哪了），不是被批准的内容。把它算进内容 diff 会
# 让「标一次已实现」把行推进「已改动·待提交」，还要审批人为研发进度签字。
#
# 与下面的 LIBRARY_HIDDEN_BUILTIN_COLUMNS 是两个独立常量，含义不同：那个说的是「模板里
# 不该有」，这个说的是「不算内容」。合并会让以后调整任一侧都出错。
NON_CONTENT_BUILTIN_COLUMNS = ("status",)

CONTENT_BUILTIN_COLUMNS = tuple(
    column for column in BUILTIN_COLUMNS if column not in NON_CONTENT_BUILTIN_COLUMNS
)

# 父项在批量拷贝（导入、物化）时需要重映射，单独拎出来
BUILTIN_PARENT_COLUMN = "parent_id"

# 标准库不展示、导入也不带过去的四列。
#
# 标准库是模板：模板不可能知道某个产品里谁负责、什么时候做，「已实现」这种状态放在
# 模板上更是自相矛盾。真正的麻烦在导入 —— 一旦库条目上留了负责人或截止日期，每一个
# 从这个库导入的产品需求都会带着它落地，然后要人工一条条清掉。
LIBRARY_HIDDEN_BUILTIN_COLUMNS = ("status", "assignee_id", "start_date", "target_date")

TITLE_MAX_LENGTH = 255


def field_attr(field, name, default=None):
    """统一读取字段属性，兼容三种来源。

    字段可能来自 DB 行（RequirementField / RequirementFieldSpec）或来自草稿
    快照与请求载荷里的 dict，调用方不应该关心具体是哪一种。
    """
    if isinstance(field, dict):
        return field.get(name, default)
    return getattr(field, name, default)


@dataclass(frozen=True)
class RequirementFieldSpec:
    """字段定义的统一形状，桥接「需求类型表的 DB 行」与「版本快照里的 JSON 树」。

    id / parent_field_id 一律是字符串，让明细 data 里以字段 ID 为 key 的结构在
    两条路径上走同一套索引逻辑。requirement_type_id 让扁平并集能重新分组回各自的
    需求类型。
    """

    id: str
    parent_field_id: Optional[str]
    name: str
    field_type: str
    is_required: bool
    is_active: bool
    sort_order: float
    config: dict
    default_value: Any = None
    field_category: Optional[str] = None
    requirement_type_id: Optional[str] = None


def field_specs_from_models(fields):
    return [
        RequirementFieldSpec(
            id=str(field.id),
            parent_field_id=(
                str(field.parent_field_id) if field.parent_field_id else None
            ),
            name=field.name,
            field_type=field.field_type,
            is_required=field.is_required,
            is_active=field.is_active,
            sort_order=field.sort_order,
            config=deepcopy(field.config) or {},
            default_value=deepcopy(field.default_value),
            field_category=field.field_category,
            requirement_type_id=str(field.requirement_type_id),
        )
        for field in fields
    ]


def field_specs_from_tree(tree, *, parent_id=None, requirement_type_id=None):
    """把字段树形状的嵌套结构摊平成 spec 列表。"""
    specs = []
    for index, node in enumerate(tree or []):
        node_id = str(node.get("id") or uuid4())
        node_type_id = node.get("requirement_type_id") or requirement_type_id
        specs.append(
            RequirementFieldSpec(
                id=node_id,
                parent_field_id=parent_id,
                name=node.get("name") or "",
                field_type=node.get("field_type") or RequirementFieldType.TEXT,
                is_required=bool(node.get("is_required", False)),
                is_active=bool(node.get("is_active", True)),
                sort_order=node.get("sort_order", (index + 1) * SORT_ORDER_STEP),
                config=deepcopy(node.get("config") or {}),
                default_value=deepcopy(node.get("default_value")),
                field_category=node.get("field_category"),
                requirement_type_id=str(node_type_id) if node_type_id else None,
            )
        )
        if node.get("children"):
            specs.extend(
                field_specs_from_tree(
                    node["children"],
                    parent_id=node_id,
                    requirement_type_id=node_type_id,
                )
            )
    return specs


def field_tree_from_specs(specs):
    """specs -> 嵌套树，与字段树接口输出同构。

    保持传入顺序，不重新排序 —— 调用方（DB 查询或快照树遍历）已经是有序的。
    """
    children_by_parent = {}
    roots = []
    for spec in specs:
        payload = {
            "id": spec.id,
            "name": spec.name,
            "field_type": spec.field_type,
            "is_required": spec.is_required,
            "is_active": spec.is_active,
            "sort_order": spec.sort_order,
            "config": deepcopy(spec.config),
            "default_value": deepcopy(spec.default_value),
            "field_category": spec.field_category,
            "requirement_type_id": spec.requirement_type_id,
            "children": [],
        }
        if spec.parent_field_id:
            children_by_parent.setdefault(spec.parent_field_id, []).append(payload)
        else:
            roots.append(payload)

    for payload in roots:
        payload["children"] = children_by_parent.get(payload["id"], [])
    return roots


# --- 内置字段（条目表上的列） --------------------------------------------
#
# 接口契约里内置字段是行上的平铺键，与 data 平级；data 只装自定义字段。


def builtin_values_from_row(row):
    """行 -> 内置列 dict，可直接当模型 kwargs（拷贝行时用）。"""
    return {column: field_attr(row, column) for column in BUILTIN_COLUMNS}


def serialize_builtin_values(row):
    """行 -> JSON 安全的内置列 dict（快照、diff 用）。

    UUID 与 date 直接塞进 JSONField 会在写入时炸，且两侧类型不一致会让 diff
    把「没变」判成「变了」，所以统一在这里落成字符串。
    """
    values = {}
    for column, value in builtin_values_from_row(row).items():
        if value is None:
            values[column] = None
        elif column in ("start_date", "target_date"):
            values[column] = value.isoformat() if hasattr(value, "isoformat") else value
        elif column in ("assignee_id", "parent_id"):
            values[column] = str(value)
        else:
            values[column] = value
    return values


def requirement_content_values(row):
    """行 -> 参与「内容变了没有」判定的值。与提交评审时的内容 diff 用同一套列。"""
    values = serialize_builtin_values(row)
    return (
        tuple(values[column] for column in CONTENT_BUILTIN_COLUMNS),
        deepcopy(row.data or {}),
    )


def resync_approved_row_version(row, *, before, was_approved):
    """本次写入没动内容，就把行判回「已通过」。

    `approval_state` 的 modified 判定是 `version != approved_row_version`，而 version 是
    乐观锁，**任何**一次保存都会 +1 —— 包括一次什么都没改的保存。不处理的话行会挂在
    「已改动·待提交」上，点提交又被 REQUIREMENT_NO_CHANGES 打回，是个死胡同。

    `was_approved` 必须在 version 自增**之前**、在已上锁的那个实例上算出来。少了它就是
    审批绕过：「先改标题（→modified）、再做一次空保存」会把未审的标题判成已通过，而
    can_submit_review 对 approved 的行返回 False，那份内容再也提交不上去。
    """
    if not was_approved:
        return False
    if requirement_content_values(row) != before:
        return False
    row.approved_row_version = row.version
    return True


def row_was_approved(row):
    """写入前这一行是不是「内容与已批准版本一致」。配合 resync_approved_row_version 用。"""
    return (
        row.approved_version is not None
        and row.version == row.approved_row_version
    )


def builtin_values_from_payload(payload):
    """请求/快照 dict -> 补齐缺省值的完整内置列 dict。

    一定返回全部八列，调用方可以直接展开成模型 kwargs，不用逐列判断有没有传。
    """
    payload = payload or {}
    return {
        column: payload.get(column, default)
        for column, default in BUILTIN_COLUMN_DEFAULTS.items()
    }


def _choice_options(choices):
    return [{"id": value, "label": label} for value, label in choices]


def builtin_filter_specs():
    """把内置列包装成字段形状，喂给搜索与筛选。

    id 用列名而不是 UUID：自定义字段的 key 一定是 UUID，两者不可能撞上，于是
    筛选条件可以用同一个 field_id 维度同时表达内置列与自定义字段。
    """
    common = {"parent_field_id": None, "is_required": False, "is_active": True}
    return [
        {"id": "title", "name": "标题", "field_type": RequirementFieldType.TEXT, "config": {}, **common},
        {
            "id": "description_html",
            "name": "描述",
            "field_type": RequirementFieldType.RICH_TEXT,
            "config": {},
            **common,
        },
        {
            "id": "status",
            "name": "状态",
            "field_type": RequirementFieldType.SELECT,
            "config": {"options": _choice_options(RequirementItemStatus.choices)},
            **common,
        },
        {
            "id": "priority",
            "name": "优先级",
            "field_type": RequirementFieldType.SELECT,
            "config": {"options": _choice_options(RequirementPriority.choices)},
            **common,
        },
        {
            "id": "assignee_id",
            "name": "负责人",
            "field_type": RequirementFieldType.MEMBER,
            "config": {},
            **common,
        },
        {"id": "start_date", "name": "开始日期", "field_type": RequirementFieldType.TEXT, "config": {}, **common},
        {"id": "target_date", "name": "截止日期", "field_type": RequirementFieldType.TEXT, "config": {}, **common},
        {"id": "parent_id", "name": "父项", "field_type": RequirementFieldType.TEXT, "config": {}, **common},
    ]


class RequirementDataLossError(Exception):
    def __init__(self, affected_row_count):
        self.affected_row_count = affected_row_count
        super().__init__("Saving this field structure will remove existing requirement values.")


class RequirementBatchConflict(Exception):
    def __init__(self, conflicts):
        self.conflicts = conflicts
        super().__init__("One or more requirements changed before the batch was saved.")


def get_requirement_select_mode(field):
    config = field_attr(field, "config") or {}
    return "multiple" if config.get("selection_mode") == "multiple" else "single"


def get_requirement_select_options(field):
    config = field_attr(field, "config") or {}
    options = config.get("options") or []
    return options if isinstance(options, list) else []


def get_requirement_eligible_user_ids(
    *,
    workspace_id,
    user_ids,
    product_id=None,
    project_id=None,
):
    """Return users that can own or approve a requirement in its target scope."""
    candidate_ids = set(user_ids)
    if not candidate_ids:
        return set()

    workspace_member_ids = set(
        WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            member_id__in=candidate_ids,
            is_active=True,
            deleted_at__isnull=True,
        ).values_list("member_id", flat=True)
    )

    if product_id:
        product = Product.objects.filter(id=product_id).only("owner_id").first()
        product_member_ids = set(
            ProductMember.objects.filter(
                product_id=product_id,
                member_id__in=workspace_member_ids,
            ).values_list("member_id", flat=True)
        )
        privileged_ids = set(
            WorkspaceMember.objects.filter(
                workspace_id=workspace_id,
                member_id__in=workspace_member_ids,
                role=ROLE.ADMIN.value,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        workspace_owner_id = (
            Workspace.objects.filter(id=workspace_id)
            .values_list("owner_id", flat=True)
            .first()
        )
        if workspace_owner_id in candidate_ids:
            privileged_ids.add(workspace_owner_id)
        if product is not None and product.owner_id in candidate_ids:
            privileged_ids.add(product.owner_id)
        return workspace_member_ids.intersection(product_member_ids).union(
            privileged_ids
        )

    if project_id:
        project_member_ids = set(
            ProjectMember.objects.filter(
                project_id=project_id,
                member_id__in=workspace_member_ids,
                is_active=True,
                deleted_at__isnull=True,
            ).values_list("member_id", flat=True)
        )
        return workspace_member_ids.intersection(project_member_ids)

    return workspace_member_ids


def rows_affected_by_fields(requirement_type):
    """字段变更会波及的需求行 —— 现在就是引用这个类型的全部行。

    「已发布基线下的正式行不在内」那条豁免删掉了：字段结构变更现在立即生效，正式表里
    再没有任何东西是冻结的。历史版本靠 RequirementTypeSchemaRevision 保住渲染依据，
    不再靠让活行不动。

    因此 affected_row_count 现在也包含已通过审批的行，确认弹窗的文案要跟着改口径。
    """
    return Requirement.objects.filter(requirement_type=requirement_type)


def replace_requirement_approvers(*, policy, approver_ids, actor=None):
    """Replace the active approver list while preserving the submitted order."""
    RequirementApprover.objects.filter(policy=policy).delete()
    RequirementApprover.objects.bulk_create(
        [
            RequirementApprover(
                policy=policy,
                approver_id=approver_id,
                sort_order=index,
                created_by=actor,
            )
            for index, approver_id in enumerate(approver_ids)
        ]
    )
    if hasattr(policy, "_prefetched_objects_cache"):
        policy._prefetched_objects_cache.pop("approvers", None)


def _field_specs_of(owner):
    return field_specs_from_models(
        owner.fields.select_related("parent_field").order_by(
            "sort_order", "created_at", "id"
        )
    )


def get_requirement_type_field_specs(requirement_type):
    """需求类型自己的字段定义 —— 字段只归需求类型所有。"""
    return _field_specs_of(requirement_type)


def serialize_requirement_type_field_tree(requirement_type):
    return field_tree_from_specs(get_requirement_type_field_specs(requirement_type))


def get_library_field_specs(library):
    """标准库的字段实时引用所选需求类型，不拷贝。

    只取标准字段 —— 数据字段是产品需求录入/导入时才填的东西，标准库不展示它，
    这里是这条规则的唯一执行点（网格表头与写入校验都走 specs）。八个内置字段
    不受影响，标准库照样有。
    """
    return [
        spec
        for spec in get_requirement_type_field_specs(library.requirement_type)
        if spec.field_category == RequirementFieldCategory.STANDARD
    ]


def serialize_library_field_tree(library):
    return field_tree_from_specs(get_library_field_specs(library))


def get_referenced_requirement_type_ids(*, model, scope):
    """这批需求行引用到的需求类型 ID。

    排序取类型自身的 (sort_order, created_at, id)，而不是「行里首次出现的顺序」——
    后者会随着行的增删改序而变，让 snapshot["fields"] 无谓地重排，diff 里冒出一堆
    并不存在的字段变更。
    """
    requirement_type_ids = (
        model.objects.filter(**scope)
        .exclude(requirement_type_id=None)
        .values_list("requirement_type_id", flat=True)
        .distinct()
    )
    return list(
        RequirementType.objects.filter(id__in=list(requirement_type_ids))
        .order_by("sort_order", "created_at", "id")
        .values_list("id", flat=True)
    )


def field_specs_for_requirement_types(requirement_type_ids):
    """返回 (扁平并集, 按 requirement_type_id 分组)。

    并集给筛选/搜索/变更快照用 —— 字段 UUID 全局唯一，摊平不会撞 key；分组给逐行
    校验用 —— 每行只能用它自己那个需求类型的字段。
    """
    requirement_type_ids = list(requirement_type_ids)
    if not requirement_type_ids:
        return [], {}

    rows = (
        RequirementField.objects.filter(requirement_type_id__in=requirement_type_ids)
        .select_related("parent_field")
        .order_by("sort_order", "created_at", "id")
    )
    by_requirement_type = {}
    for spec in field_specs_from_models(rows):
        by_requirement_type.setdefault(spec.requirement_type_id, []).append(spec)

    # 保持调用方给定的需求类型顺序
    flat = []
    ordered_by_type = {}
    for requirement_type_id in requirement_type_ids:
        key = str(requirement_type_id)
        specs = by_requirement_type.get(key, [])
        ordered_by_type[key] = specs
        flat.extend(specs)
    return flat, ordered_by_type


def requirement_types_field_payload_from_specs(requirement_type_ids, specs_by_type):
    """产品需求配置接口里的 requirement_types[]：每个类型一份 id/name/图标/字段树。

    字段取调用方给的 specs 而不是自己去查库 —— 已发布的需求传进来的是版本里冻结
    的那份，自己查库会把冻结语义直接绕过去。图标不属于冻结内容，跟着类型走。
    """
    requirement_type_ids = [str(item) for item in requirement_type_ids]
    if not requirement_type_ids:
        return []

    identities = {
        str(key): (name, logo_props)
        for key, name, logo_props in RequirementType.objects.filter(
            id__in=requirement_type_ids
        ).values_list("id", "name", "logo_props")
    }
    payload = []
    for requirement_type_id in requirement_type_ids:
        specs = specs_by_type.get(requirement_type_id, [])
        name, logo_props = identities.get(requirement_type_id, ("", {}))
        payload.append(
            {
                "id": requirement_type_id,
                "name": name,
                "logo_props": logo_props or {},
                "fields": field_tree_from_specs(specs),
            }
        )
    return payload


def _clean_requirement_data_for_fields(data, removed_fields):
    cleaned = deepcopy(data)
    changed = False
    removed_root_ids = {
        str(field_attr(field, "id"))
        for field in removed_fields
        if field_attr(field, "parent_field_id") is None
    }
    for field_id in removed_root_ids:
        if field_id in cleaned:
            cleaned.pop(field_id, None)
            changed = True

    removed_children_by_parent = {}
    for field in removed_fields:
        parent_field_id = field_attr(field, "parent_field_id")
        if parent_field_id is not None:
            removed_children_by_parent.setdefault(str(parent_field_id), set()).add(
                str(field_attr(field, "id"))
            )

    for parent_id, child_ids in removed_children_by_parent.items():
        rows = cleaned.get(parent_id)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
                continue
            for child_id in child_ids:
                if child_id in row["values"]:
                    row["values"].pop(child_id, None)
                    changed = True
    return cleaned, changed


def _clear_requirement_value_for_field(data, field, empty_value):
    cleaned = deepcopy(data)
    field_id = str(field_attr(field, "id"))
    parent_field_id = field_attr(field, "parent_field_id")
    changed = False

    if parent_field_id is None:
        if not _is_empty_requirement_value(cleaned.get(field_id)):
            cleaned[field_id] = deepcopy(empty_value)
            changed = True
        return cleaned, changed

    rows = cleaned.get(str(parent_field_id))
    if not isinstance(rows, list):
        return cleaned, changed
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("values"), dict):
            continue
        if not _is_empty_requirement_value(row["values"].get(field_id)):
            row["values"][field_id] = deepcopy(empty_value)
            changed = True
    return cleaned, changed


def select_config_removes_values(field, payload):
    """选择器的模式变化或选项收缩会让已存的值失效。"""
    if (
        field_attr(field, "field_type") != RequirementFieldType.SELECT
        or field_attr(payload, "field_type") != RequirementFieldType.SELECT
    ):
        return False
    old_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(field)
        if isinstance(option, dict) and option.get("id")
    }
    new_ids = {
        str(option.get("id"))
        for option in get_requirement_select_options(payload)
        if isinstance(option, dict) and option.get("id")
    }
    return (
        get_requirement_select_mode(field) != get_requirement_select_mode(payload)
        or not old_ids.issubset(new_ids)
    )


def apply_field_change_cleanup(
    *,
    rows,
    removed_fields,
    reset_select_fields,
    actor=None,
):
    """清掉因字段被删除 / 换类型 / 选项收缩而失效的字段值。

    正式表与草稿表的行结构一致（data / version / updated_by），所以两条路径
    共用这一份逻辑；调用方各自对自己的模型做 bulk_update。

    内置的标题与描述不会走到这里 —— 它们不可删除也不可改类型，值也不在 data 里。
    """
    changed_rows = []
    if not removed_fields and not reset_select_fields:
        return changed_rows

    now = timezone.now()
    for row in rows:
        cleaned_data, changed = _clean_requirement_data_for_fields(
            row.data, removed_fields
        )
        for field, empty_value in reset_select_fields:
            cleaned_data, select_changed = _clear_requirement_value_for_field(
                cleaned_data,
                field,
                empty_value,
            )
            changed = changed or select_changed
        if changed:
            row.data = cleaned_data
            row.version += 1
            row.updated_at = now
            row.updated_by = actor
            changed_rows.append(row)
    return changed_rows


def sync_requirement_type_fields(
    *,
    requirement_type,
    field_payloads,
    actor=None,
    confirm_data_loss=False,
):
    existing_fields = {
        field.id: field
        for field in RequirementField.objects.filter(
            requirement_type=requirement_type
        ).select_related("parent_field")
    }
    submitted_ids = set()
    created_field_ids = {}
    data_loss_fields = []
    reset_select_fields = {}

    def save_field(payload, parent=None, index=0):
        field_id = payload.get("id")
        if field_id:
            field = existing_fields.get(field_id)
            if field is None:
                raise ValueError(
                    "A submitted field does not belong to this requirement type."
                )
            expected_parent_id = parent.id if parent else None
            if field.parent_field_id != expected_parent_id:
                raise ValueError("Existing fields cannot be moved between field levels.")
            if field.field_type != payload["field_type"]:
                data_loss_fields.append(deepcopy(field))
            elif select_config_removes_values(field, payload):
                reset_select_fields[field.id] = (
                    deepcopy(field),
                    [] if get_requirement_select_mode(payload) == "multiple" else None,
                )
            submitted_ids.add(field.id)
        else:
            field = RequirementField(
                requirement_type=requirement_type, parent_field=parent
            )

        field.name = payload["name"]
        field.field_type = payload["field_type"]
        field.is_required = payload["is_required"]
        field.is_active = payload["is_active"]
        field.sort_order = (index + 1) * SORT_ORDER_STEP
        field.config = deepcopy(payload.get("config") or {})
        field.default_value = deepcopy(payload.get("default_value"))
        # 子字段跟着所属表单走，分类不单独提交
        field.field_category = (
            parent.field_category if parent else payload["field_category"]
        )
        field.full_clean(exclude=["created_by", "updated_by"])
        if field._state.adding and actor is not None:
            field.created_by = actor
        field.save()

        client_id = payload.get("client_id")
        if client_id:
            created_field_ids[str(client_id)] = str(field.id)

        for child_index, child_payload in enumerate(payload.get("children") or []):
            save_field(child_payload, parent=field, index=child_index)
        return field

    for root_index, root_payload in enumerate(field_payloads):
        save_field(root_payload, index=root_index)

    deleted_fields = [
        field for field_id, field in existing_fields.items() if field_id not in submitted_ids
    ]

    cleanup_fields_by_id = {
        field.id: field for field in [*deleted_fields, *data_loss_fields]
    }
    cleanup_fields = list(cleanup_fields_by_id.values())

    changed_rows = []
    if cleanup_fields or reset_select_fields:
        changed_rows = apply_field_change_cleanup(
            # of=("self",) 只锁需求行本身 —— queryset 会 join 到产品或标准库，
            # 不该把那些行一起锁住。
            rows=rows_affected_by_fields(requirement_type).select_for_update(of=("self",)),
            removed_fields=cleanup_fields,
            reset_select_fields=list(reset_select_fields.values()),
            actor=actor,
        )

    if changed_rows and not confirm_data_loss:
        raise RequirementDataLossError(len(changed_rows))

    if deleted_fields:
        RequirementField.objects.filter(
            id__in=[field.id for field in deleted_fields]
        ).delete()
    if changed_rows:
        Requirement.objects.bulk_update(
            changed_rows, ["data", "version", "updated_at", "updated_by"]
        )

    requirement_type.updated_by = actor
    requirement_type.save(update_fields=["updated_at", "updated_by"])

    # 字段树真的变了才写修订 —— 只改类型名也走到这里，无条件写会往这个类型下每条
    # 需求的变更轨迹里塞一条空变更。
    # 延迟导入：requirement_schema 依赖本模块的字段树 helper，模块级互相 import 会成环。
    from plane.utils.requirement_schema import write_schema_revision

    revision = write_schema_revision(requirement_type, actor=actor)
    if cleanup_fields or reset_select_fields:
        _reprune_pending_change_items(
            requirement_type=requirement_type,
            removed_fields=cleanup_fields,
            reset_select_fields=list(reset_select_fields.values()),
            revision=revision,
        )
    return created_field_ids


def _reprune_pending_change_items(
    *, requirement_type, removed_fields, reset_select_fields, revision
):
    """把待审变更项里的快照按新字段结构重裁一遍。

    活行刚被 apply_field_change_cleanup 清过，但待审变更项里的 proposed_snapshot 是
    提交那一刻冻结的。不同步裁剪的话，两边会脱节，而且审批通过时冻结的快照会把一个
    已经不存在的字段的值"复活"回来。

    范围是这个类型下**正在评审中**的需求，比全表小几个数量级。
    """
    if not removed_fields and not reset_select_fields:
        return

    pending_items = list(
        RequirementChangeItem.objects.select_for_update()
        .filter(
            requirement_type=requirement_type,
            change_request__status=RequirementChangeStatus.PENDING,
        )
    )
    if not pending_items:
        return

    touched = []
    for item in pending_items:
        changed = False
        for attribute in ("before_snapshot", "proposed_snapshot"):
            snapshot = getattr(item, attribute)
            if not isinstance(snapshot, dict):
                continue
            cleaned_data, data_changed = _clean_requirement_data_for_fields(
                snapshot.get("data") or {}, removed_fields
            )
            for field, empty_value in reset_select_fields:
                cleaned_data, select_changed = _clear_requirement_value_for_field(
                    cleaned_data, field, empty_value
                )
                data_changed = data_changed or select_changed
            if data_changed:
                snapshot["data"] = cleaned_data
                setattr(item, attribute, snapshot)
                changed = True
        if item.schema_revision_id != revision.id:
            item.schema_revision = revision
            changed = True
        if changed:
            touched.append(item)

    if touched:
        RequirementChangeItem.objects.bulk_update(
            touched, ["before_snapshot", "proposed_snapshot", "schema_revision"]
        )


# 相邻两行 sort_order 之间的最小间隙。低于它就说明浮点精度快用尽了，需要局部重排。
SORT_ORDER_MIN_GAP = 1e-6


def _sort_order_for_insert(*, model, scope, before_id=None, after_id=None):
    """算出插入位置的 sort_order —— 取相邻两行的中值，只读两行、只写一行。

    以前这里把作用域内**全部**行 select_for_update 进内存再整表 bulk_update 一遍，
    即使是追加到末尾也照做。那是这个模块里最后一个 O(N) 写入：几千行需求时每点一次
    「新增」就是一次全表行锁 + 全表 UPDATE，还会去动正在评审中的行的 updated_at。

    留空隙是特性不是缺陷：删除之后不回填，下一次插入照样能在间隙里落脚。
    """
    ordered = model.objects.filter(**scope).order_by("sort_order", "created_at", "id")

    if before_id:
        anchor = ordered.filter(id=before_id).values_list("sort_order", flat=True).first()
        if anchor is None:
            raise ValueError("The insertion anchor was not found.")
        previous = (
            ordered.filter(sort_order__lt=anchor)
            .values_list("sort_order", flat=True)
            .last()
        )
        lower, upper = previous, anchor
    elif after_id:
        anchor = ordered.filter(id=after_id).values_list("sort_order", flat=True).first()
        if anchor is None:
            raise ValueError("The insertion anchor was not found.")
        following = (
            ordered.filter(sort_order__gt=anchor)
            .values_list("sort_order", flat=True)
            .first()
        )
        lower, upper = anchor, following
    else:
        last = ordered.values_list("sort_order", flat=True).last()
        lower, upper = last, None

    if lower is None and upper is None:
        return SORT_ORDER_STEP
    if lower is None:
        return upper - SORT_ORDER_STEP
    if upper is None:
        return lower + SORT_ORDER_STEP
    if upper - lower < SORT_ORDER_MIN_GAP:
        # 精度耗尽：把这批行整体重排一次，再取中值。实践中几乎不会走到。
        _rebalance_sort_orders(model=model, scope=scope)
        return _sort_order_for_insert(
            model=model, scope=scope, before_id=before_id, after_id=after_id
        )
    return (lower + upper) / 2


def _rebalance_sort_orders(*, model, scope):
    """把作用域内的 sort_order 按当前顺序重新拉开间距。只在精度耗尽时调用。"""
    rows = list(
        model.objects.select_for_update()
        .filter(**scope)
        .order_by("sort_order", "created_at", "id")
    )
    now = timezone.now()
    for index, row in enumerate(rows):
        row.sort_order = (index + 1) * SORT_ORDER_STEP
        row.updated_at = now
    if rows:
        model.objects.bulk_update(rows, ["sort_order", "updated_at"])


def insert_requirement_row(
    *,
    model,
    scope,
    new_row,
    data,
    builtin,
    requirement_type_id,
    actor=None,
    before_id=None,
    after_id=None,
):
    """在指定位置插入一行需求。

    model / scope / new_row 三个参数让不同归属的表共用同一套插入语义。
    data 只装自定义字段，builtin 是八个内置列的完整 dict。
    """
    if before_id and after_id:
        raise ValueError("Only one insertion anchor can be provided.")

    sort_order = _sort_order_for_insert(
        model=model, scope=scope, before_id=before_id, after_id=after_id
    )

    row = new_row(
        data=deepcopy(data or {}),
        columns=builtin_values_from_payload(builtin),
        sort_order=sort_order,
        actor=actor,
        requirement_type_id=requirement_type_id,
    )
    row.save()
    return row


@dataclass(frozen=True)
class RequirementSource:
    """一条需求的标准库出处。只有导入路径会构造它。

    存的是库 id + 库内序号，不是拼好的 "SEC-12" —— 库改名之后已导入需求的来源编号
    要跟着变，前缀在读侧解析（source_library_identifier_map）。
    """

    library_id: Any
    sequence_id: int


def _sequence_allocator(scope):
    """作用域内取号器：每个工厂实例只查一次 Max，之后在内存里自增。

    惰性是刻意的 —— 工厂在 save_requirement_row_batch 的 select_for_update **之前**
    构造，惰性让第一次 allocate() 落在锁之后；顺带让没有 creates 的批次一次查询都不发。

    用 all_objects 而不是 objects：编号永不复用，软删的行也占着号。这与
    Requirement.Meta 里那三条**不带** deleted_at 条件的唯一约束是一对 ——
    用 objects 的话，删掉 ECOM-7 之后下一条新建会拿到 7，然后撞
    req_unique_product_sequence，整批回滚。

    并发正确性完全依赖调用方已经持有该作用域的写锁：产品/项目是
    RequirementApprovalPolicy 行（get_scoped_policy(for_update=True)），
    标准库是 RequirementLibrary 行（get_scoped_library(for_update=True)）。

    计数器活在闭包里，所以**工厂实例必须一次写入用一个**，绝不能提到 RowLayer
    字段上或缓存在按请求复用的对象里 —— 跨事务复用会发出重复的号。
    """
    state = {"next": None}

    def allocate():
        if state["next"] is None:
            current = Requirement.all_objects.filter(**scope).aggregate(
                value=Max("sequence_id")
            )["value"]
            state["next"] = (current or 0) + 1
        value = state["next"]
        state["next"] += 1
        return value

    return allocate


def source_library_identifier_map(rows):
    """这一批行引用到的标准库 -> identifier，用于拼来源编号（SEC-12）。

    source_library_id 是裸 UUID 不是外键（溯源不该被库的生命周期绑架），所以没有
    prefetch 可用，改成按页批量解析：一页 100 行跨 N 个来源库也只多一次走主键的
    IN 查询，没有来源的批次一次都不发。

    用 all_objects：库被软删之后，从它导入的需求仍然该显示 SEC-12 ——
    溯源不能因为源头没了就变成空白。
    """
    library_ids = {row.source_library_id for row in rows if row.source_library_id}
    if not library_ids:
        return {}
    return {
        str(library_id): identifier
        for library_id, identifier in RequirementLibrary.all_objects.filter(
            id__in=library_ids
        ).values_list("id", "identifier")
    }


def _new_scoped_requirement(*, product=None, project=None):
    if product is not None:
        scope = {"product_id": product.id}
    elif project is not None:
        scope = {"project_id": project.id}
    else:
        raise ValueError("A scoped requirement needs a product or a project.")
    allocate = _sequence_allocator(scope)

    def factory(data, columns, sort_order, actor, requirement_type_id, source=None):
        return Requirement(
            product=product,
            project=project,
            requirement_type_id=requirement_type_id,
            sequence_id=allocate(),
            # 只有从标准库导入才有来源；手工创建恒为 (None, None)
            source_library_id=source.library_id if source else None,
            source_sequence_id=source.sequence_id if source else None,
            data=data,
            sort_order=sort_order,
            created_by=actor,
            **columns,
        )

    return factory


def _new_library_item(library):
    allocate = _sequence_allocator({"library_id": library.id})

    def factory(data, columns, sort_order, actor, requirement_type_id, source=None):
        # 库内条目的需求类型恒等于库所选的类型，不接受调用方指定。
        # source 同理被**无条件丢弃** —— 库条目是导入的源头，不可能有来源。
        # DB 侧有 req_library_item_has_no_source 兜底。
        return Requirement(
            library=library,
            requirement_type_id=library.requirement_type_id,
            sequence_id=allocate(),
            data=data,
            sort_order=sort_order,
            created_by=actor,
            **columns,
        )

    return factory


def scope_row_filter(policy):
    """一个产品/项目作用域下的需求行的过滤条件。标准库的行永远不在其中。"""
    if policy.product_id:
        return {"product_id": policy.product_id}
    return {"project_id": policy.project_id}


def insert_baseline_requirement(
    *,
    policy,
    data,
    builtin,
    requirement_type_id,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_requirement_row(
        model=Requirement,
        scope=scope_row_filter(policy),
        new_row=_new_scoped_requirement(
            product=policy.product, project=policy.project
        ),
        data=data,
        builtin=builtin,
        requirement_type_id=requirement_type_id,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def insert_library_item(
    *,
    library,
    data,
    builtin,
    requirement_type_id=None,
    actor=None,
    before_id=None,
    after_id=None,
):
    return insert_requirement_row(
        model=Requirement,
        scope={"library": library},
        new_row=_new_library_item(library),
        data=data,
        builtin=builtin,
        requirement_type_id=library.requirement_type_id,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def save_requirement_row_batch(
    *,
    model,
    scope,
    new_row,
    creates,
    updates,
    deletes,
    actor=None,
    hard_delete=False,
):
    """批量保存需求行的新增/修改/删除，并保持 sort_order 连续。

    正式表与草稿表共用这份实现，因此两条路径的响应形状完全一致，前端的网格无需
    为草稿态做任何分支。creates/updates 里 data 只装自定义字段，内置列在 builtin。

    hard_delete 供草稿层使用：草稿行的 UUID 会在物化时复用为正式表主键，也会
    在重新「编辑」时被再次克隆，所以软删除留下的行会撞上 id 的唯一约束。
    """
    existing = list(
        model.objects.select_for_update()
        .filter(**scope)
        .order_by("sort_order", "created_at", "id")
    )
    rows_by_id = {row.id: row for row in existing}
    conflicts = []

    for item in [*updates, *deletes]:
        row = rows_by_id.get(item["id"])
        if row is None:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "not_found",
                }
            )
        elif row.version != item["version"]:
            conflicts.append(
                {
                    "id": str(item["id"]),
                    "reason": "version_conflict",
                    "current_version": row.version,
                }
            )

    delete_ids = {item["id"] for item in deletes}
    for item in creates:
        anchor_id = item.get("before_id") or item.get("after_id")
        if anchor_id is None:
            continue
        if anchor_id in delete_ids:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_deleted",
                }
            )
        elif anchor_id not in rows_by_id:
            conflicts.append(
                {
                    "id": str(anchor_id),
                    "reason": "anchor_not_found",
                }
            )

    if conflicts:
        raise RequirementBatchConflict(conflicts)

    now = timezone.now()
    updated_rows = []
    for item in updates:
        row = rows_by_id[item["id"]]
        # 前快照与 was_approved 都必须在改动之前抓，且要用这里上了锁的行
        before = requirement_content_values(row)
        was_approved = row_was_approved(row)
        for column, value in builtin_values_from_payload(item.get("builtin")).items():
            setattr(row, column, value)
        row.data = deepcopy(item["data"] or {})
        row.version += 1
        row.updated_at = now
        row.updated_by = actor
        resync_approved_row_version(row, before=before, was_approved=was_approved)
        updated_rows.append(row)
    if updated_rows:
        model.objects.bulk_update(
            updated_rows,
            [
                *BUILTIN_COLUMNS,
                "data",
                "version",
                "approved_row_version",
                "updated_at",
                "updated_by",
            ],
        )

    ordered_rows = [row for row in existing if row.id not in delete_ids]
    created_rows = []
    after_anchor_offsets = {}
    for item in creates:
        before_id = item.get("before_id")
        after_id = item.get("after_id")
        ordered_ids = [row.id for row in ordered_rows]
        if before_id:
            insert_at = ordered_ids.index(before_id)
        elif after_id:
            anchor_offset = after_anchor_offsets.get(after_id, 0)
            insert_at = ordered_ids.index(after_id) + 1 + anchor_offset
            after_anchor_offsets[after_id] = anchor_offset + 1
        else:
            insert_at = len(ordered_rows)

        # 取相邻两行的中值，而不是「下标 × 步长」—— 后者要求整批重排才自洽
        lower = ordered_rows[insert_at - 1].sort_order if insert_at > 0 else None
        upper = ordered_rows[insert_at].sort_order if insert_at < len(ordered_rows) else None
        if lower is None and upper is None:
            sort_order = SORT_ORDER_STEP
        elif lower is None:
            sort_order = upper - SORT_ORDER_STEP
        elif upper is None:
            sort_order = lower + SORT_ORDER_STEP
        else:
            sort_order = (lower + upper) / 2

        row = new_row(
            data=deepcopy(item["data"] or {}),
            columns=builtin_values_from_payload(item.get("builtin")),
            sort_order=sort_order,
            actor=actor,
            requirement_type_id=item.get("requirement_type_id"),
            # source 只可能由 build_library_import_creates 放进来 ——
            # RequirementBatchSaveSerializer 没有这个字段，所以客户端伪造不了。
            # 别给那个 serializer 加 source 字段，否则溯源就成了可伪造的输入。
            source=item.get("source"),
        )
        row.save()
        ordered_rows.insert(insert_at, row)
        created_rows.append((item["client_id"], row))

    if delete_ids:
        doomed = model.objects.filter(**scope, id__in=delete_ids)
        if hard_delete:
            doomed.delete(soft=False)
        else:
            doomed.delete()

    # 不再全量重排 sort_order。新增行在 ordered_rows 里插进位置时已经拿到了中值，
    # 删除留下的空隙是特性 —— 见 _sort_order_for_insert 的说明。
    return created_rows, updated_rows, list(delete_ids)


def save_baseline_requirement_batch(
    *,
    policy,
    creates,
    updates,
    deletes,
    actor=None,
):
    return save_requirement_row_batch(
        model=Requirement,
        scope=scope_row_filter(policy),
        new_row=_new_scoped_requirement(
            product=policy.product, project=policy.project
        ),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
    )


def build_library_import_creates(*, library, item_ids, before_id=None, after_id=None):
    """把选中的库条目整理成 (creates, 源父项映射)。

    data 直接深拷贝 —— 库条目与目标行引用的是同一个需求类型，字段 UUID 完全一致，
    不做任何重映射；只顺手裁掉不属于当前字段集的残留 key（字段后来被删过）。
    内置列里只带标题、描述、优先级 —— 执行期四列（状态/负责人/起止日期）拍回缺省
    值，标准库根本不展示它们，历史数据里若有残留也不该跟着漏进产品需求。父项先置空，
    等新行落库后再按 client_id 重映射。
    这里**不重跑必填校验**：库条目本来就允许留空，导入不该因此失败。

    client_id 直接用库条目自己的 id —— 导入结束后要靠它把父项接回同批的新行。
    """
    items_by_id = {
        item.id: item
        for item in Requirement.objects.filter(
            library=library, id__in=item_ids
        ).order_by("sort_order", "created_at", "id")
    }
    missing = [item_id for item_id in item_ids if item_id not in items_by_id]
    if missing:
        raise ValueError("One or more library items were not found.")

    specs = get_library_field_specs(library)
    creates = []
    parent_by_client_id = {}
    for item_id in item_ids:
        item = items_by_id[item_id]
        builtin = builtin_values_from_row(item)
        parent_by_client_id[item_id] = builtin[BUILTIN_PARENT_COLUMN]
        builtin[BUILTIN_PARENT_COLUMN] = None
        for column in LIBRARY_HIDDEN_BUILTIN_COLUMNS:
            builtin[column] = BUILTIN_COLUMN_DEFAULTS[column]
        creates.append(
            {
                "client_id": item_id,
                "data": prune_requirement_data_to_fields(deepcopy(item.data), specs),
                "builtin": builtin,
                "requirement_type_id": library.requirement_type_id,
                # 溯源：目标行记住自己来自 SEC-12。库条目侧不写任何东西 ——
                # 一条库条目可以被导入无数次，反向指针没有单值可存。
                "source": RequirementSource(
                    library_id=library.id, sequence_id=item.sequence_id
                ),
                **({"before_id": before_id} if before_id else {}),
                **({"after_id": after_id} if after_id else {}),
            }
        )
    return creates, parent_by_client_id


def remap_imported_parents(*, model, created_rows, parent_by_client_id):
    """把导入进来的行的父项接到同一批的新行上。

    只在本批内部重映射：源条目的父项没被一起选中时保持为空 —— 让产品需求的行指回
    标准库的行会把两个作用域串到一起，父项链上溯就跨出了自己的归属。
    """
    new_id_by_client_id = {client_id: row.id for client_id, row in created_rows}
    changed = []
    for client_id, row in created_rows:
        source_parent_id = parent_by_client_id.get(client_id)
        if source_parent_id is None:
            continue
        new_parent_id = new_id_by_client_id.get(source_parent_id)
        if new_parent_id is None:
            continue
        row.parent_id = new_parent_id
        changed.append(row)
    if changed:
        model.objects.bulk_update(changed, ["parent_id"])
    return changed


def import_library_items(
    *, policy, library, item_ids, actor=None, before_id=None, after_id=None
):
    """把标准库条目导入这个作用域的需求表。"""
    creates, parent_by_client_id = build_library_import_creates(
        library=library,
        item_ids=item_ids,
        before_id=before_id,
        after_id=after_id,
    )
    created_rows, updated_rows, deleted_ids = save_baseline_requirement_batch(
        policy=policy,
        creates=creates,
        updates=[],
        deletes=[],
        actor=actor,
    )
    remap_imported_parents(
        model=Requirement,
        created_rows=created_rows,
        parent_by_client_id=parent_by_client_id,
    )
    return created_rows, updated_rows, deleted_ids


def save_library_item_batch(
    *,
    library,
    creates,
    updates,
    deletes,
    actor=None,
):
    return save_requirement_row_batch(
        model=Requirement,
        scope={"library": library},
        new_row=_new_library_item(library),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
    )


def prune_requirement_data_to_fields(data, fields):
    """丢掉不属于这套字段的 key。

    只是安全网 —— 库条目可能残留着某个后来被删掉的字段的值。**不重跑必填校验**：
    标准库里的条目本来就允许留空，导入不该因为必填而失败。
    """
    roots = {
        str(field_attr(field, "id"))
        for field in fields
        if field_attr(field, "parent_field_id") is None
    }
    children_by_parent = {}
    for field in fields:
        parent_id = field_attr(field, "parent_field_id")
        if parent_id:
            children_by_parent.setdefault(str(parent_id), set()).add(
                str(field_attr(field, "id"))
            )

    pruned = {}
    for key, value in (data or {}).items():
        if key not in roots:
            continue
        allowed_children = children_by_parent.get(key)
        if allowed_children is not None and isinstance(value, list):
            rows = []
            for row in value:
                if not isinstance(row, dict):
                    continue
                values = row.get("values")
                rows.append(
                    {
                        "id": row.get("id"),
                        "values": {
                            child_id: child_value
                            for child_id, child_value in (values or {}).items()
                            if child_id in allowed_children
                        },
                    }
                )
            pruned[key] = rows
        else:
            pruned[key] = deepcopy(value)
    return pruned


def _is_empty_requirement_value(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not strip_tags(value).strip()
    if isinstance(value, (list, dict)):
        return not value
    return False


def _value_matches_filter(value, operator, expected, field=None):
    if operator == "is_empty":
        return _is_empty_requirement_value(value)
    if operator == "is_not_empty":
        return not _is_empty_requirement_value(value)
    if operator == "contains":
        if (
            field is not None
            and field_attr(field, "field_type") == RequirementFieldType.SELECT
            and get_requirement_select_mode(field) == "multiple"
        ):
            return isinstance(value, list) and expected in value
        return str(expected or "").casefold() in strip_tags(str(value or "")).casefold()
    if operator == "equals":
        if isinstance(value, str) and isinstance(expected, str):
            return value.casefold() == expected.casefold()
        return value == expected
    return False


def get_requirement_field_values(row_data, field):
    """取出某个字段在一行需求里的全部值（子表单字段可能有多行）。"""
    parent_field_id = field_attr(field, "parent_field_id")
    field_id = str(field_attr(field, "id"))
    if parent_field_id:
        rows = row_data.get(str(parent_field_id), [])
        if not isinstance(rows, list):
            return []
        return [
            (row.get("values") or {}).get(field_id)
            for row in rows
            if isinstance(row, dict)
        ]
    return [row_data.get(field_id)]


def filter_requirement_row_ids(
    *, fields, rows, search="", filters=None, fields_by_requirement_type=None
):
    """按搜索词与筛选条件筛出命中的需求行 ID。

    fields 是扁平并集，用来解析筛选条件里的 field_id；fields_by_requirement_type
    给定时，每一行只用它自己需求类型的那套字段 —— 针对类型 B 某个字段的筛选不会
    误伤类型 A 的行（那些行根本没有这个字段，判定为不命中）。

    fields 接受任意字段来源（模型行 / spec / dict），rows 接受任意需求行序列，
    因此正式表与草稿表共用同一套搜索与筛选语义。

    内置列在这里被包装成一组「伪字段」（id 就是列名，不是 UUID，与自定义字段的
    key 天然不撞），行数据也按同样的 key 摊平，于是标题、状态、负责人这些和自定义
    字段走完全相同的搜索与筛选路径，不需要任何特例分支。
    """
    filters = filters or []
    fields = list(fields)
    rows = list(rows)
    builtin_specs = builtin_filter_specs()
    fields_by_id = {spec["id"]: spec for spec in builtin_specs}
    fields_by_id.update({str(field_attr(field, "id")): field for field in fields})

    def row_fields(row):
        if fields_by_requirement_type is None:
            own = fields
        else:
            own = fields_by_requirement_type.get(str(row.requirement_type_id), [])
        # 内置列每一行都有，与需求类型无关
        return [*builtin_specs, *own]

    data_by_row = {
        row.id: {**serialize_builtin_values(row), **(row.data or {})} for row in rows
    }

    member_ids = set()
    for row in rows:
        for field in row_fields(row):
            if field_attr(field, "field_type") != RequirementFieldType.MEMBER:
                continue
            for value in get_requirement_field_values(data_by_row[row.id], field):
                if value:
                    member_ids.add(value)
    members = {}
    for member in User.objects.filter(id__in=member_ids):
        members[str(member.id)] = member.display_name

    def get_field_values(row, field):
        return get_requirement_field_values(data_by_row[row.id], field)

    def searchable_value(field, value):
        field_type = field_attr(field, "field_type")
        if field_type == RequirementFieldType.MEMBER:
            return members.get(str(value), str(value or ""))
        if field_type == RequirementFieldType.SELECT:
            option_labels = {
                str(option.get("id")): str(option.get("label") or "")
                for option in get_requirement_select_options(field)
                if isinstance(option, dict) and option.get("id")
            }
            selected_ids = value if isinstance(value, list) else [value]
            return " ".join(
                option_labels.get(str(option_id), "")
                for option_id in selected_ids
                if option_id
            )
        if field_type in (
            RequirementFieldType.ATTACHMENT,
            RequirementFieldType.IMAGE,
        ):
            if not isinstance(value, list):
                return ""
            return " ".join(
                str(item.get("name") or "")
                for item in value
                if isinstance(item, dict)
            )
        if field_type == RequirementFieldType.RICH_TEXT:
            return strip_tags(str(value or ""))
        return str(value or "")

    normalized_search = search.strip().casefold()
    matching_ids = []
    for row in rows:
        own_field_ids = {str(field_attr(field, "id")) for field in row_fields(row)}
        if normalized_search:
            haystack = []
            for field in row_fields(row):
                if field_attr(field, "field_type") == RequirementFieldType.FORM:
                    continue
                haystack.extend(
                    searchable_value(field, value)
                    for value in get_field_values(row, field)
                )
            if normalized_search not in " ".join(haystack).casefold():
                continue

        matches = True
        for item in filters:
            field = fields_by_id.get(str(item.get("field_id")))
            if (
                field is None
                or field_attr(field, "field_type") == RequirementFieldType.FORM
                # 这一行的需求类型没有这个字段 —— 跨类型的筛选条件不命中它
                or str(field_attr(field, "id")) not in own_field_ids
            ):
                matches = False
                break
            values = get_field_values(row, field)
            operator = item.get("operator")
            expected = item.get("value")
            if field_attr(field, "parent_field_id") and operator == "is_empty":
                item_matches = not values or all(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            else:
                item_matches = any(
                    _value_matches_filter(value, operator, expected, field)
                    for value in values
                )
            if not item_matches:
                matches = False
                break
        if matches:
            matching_ids.append(row.id)
    return matching_ids
