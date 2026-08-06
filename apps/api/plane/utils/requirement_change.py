"""需求变更审批与版本管理。

一条链路走首次发布与后续变更两种场景：
draft --提交--> in_review --通过--> published（物化 + 新版本）
                          --驳回/撤回--> draft（保留工作副本）

两种场景的差别只在 diff 的两侧从哪里取：

- 首次发布（`current_version is None`，没有工作副本）：基线是空快照，正式表上的
  内容就是提案，所有变更项都是「新增」，通过时无需物化。
- 后续变更（有工作副本）：基线是正式表 + 工作副本里冻结的 meta 基线，提案是工作
  副本的字段与明细 + 正式行上的当前 meta，通过时把工作副本物化进正式表。

变更项按三类分组落库（审批配置 / 字段定义 / 需求条目）。需求条目组在千行量级下
可能有上千条变更项，所以变更单详情只返回汇总计数与前两组，条目组由独立的分页
端点按需拉取。

条目快照里的 data 是**合并态**（标题与描述按内置字段 UUID 塞回 data），diff 因此
不必为「哪些值住在列上」分支 —— 标题变更和任何自定义字段变更走的是同一条路径。
"""

from copy import deepcopy

from django.db.models import Count, Max, Q
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Coalesce
from django.utils import timezone

from plane.db.models import (
    Requirement,
    RequirementApprovalAction,
    RequirementApprovalType,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeRequestKind,
    RequirementChangeStatus,
    RequirementChangeTargetKind,
    RequirementChangeType,
    RequirementDraftRow,
    RequirementFieldType,
    RequirementStatus,
    RequirementType,
    RequirementVersion,
)
from plane.utils.requirement import (
    BUILTIN_COLUMNS,
    baseline_row_scope,
    field_specs_for_requirement_types,
    field_specs_from_tree,
    field_tree_from_specs,
    get_referenced_requirement_type_ids,
    replace_requirement_approvers,
    serialize_builtin_values,
)
from plane.utils.requirement_draft import (
    baseline_meta_snapshot,
    drop_draft,
    get_draft,
    get_draft_baseline_field_tree,
    get_draft_baseline_meta,
    load_snapshot_into_draft,
    materialize_draft,
    stamp_initial_versions,
    start_editing,
)


ITEM_BATCH_SIZE = 500
ROW_CHUNK_SIZE = 500

META_KEYS = (
    "owner_id",
    "approval_type",
    "required_count",
    "approver_ids",
)

FIELD_COMPARE_KEYS = (
    "name",
    "field_type",
    "field_category",
    "is_required",
    "is_active",
    "position",
    "config",
    "default_value",
)


class RequirementChangeError(Exception):
    """变更流程的状态或权限前置条件不满足。"""

    def __init__(self, message, *, code="REQUIREMENT_CHANGE_INVALID"):
        self.code = code
        super().__init__(message)


def _requirement_row(row):
    """行快照：八个内置列平铺在顶层，data 只装自定义字段。"""
    return {
        "id": str(row.id),
        "requirement_type_id": str(row.requirement_type_id),
        **serialize_builtin_values(row),
        "data": deepcopy(row.data or {}),
        "sort_order": row.sort_order,
    }


def _live_field_tree(*, model, scope):
    """这批需求行当前生效的字段树：各引用类型的字段树按类型顺序拼接。

    保持成「扁平的根字段树列表」而不是按类型分组的嵌套结构 —— 字段 UUID 全局唯一，
    所以 _flatten_fields / diff_snapshots / 版本对比全都不用改；要分视图时前端按
    节点上的 requirement_type_id 分组即可。
    """
    requirement_type_ids = get_referenced_requirement_type_ids(model=model, scope=scope)
    specs, _ = field_specs_for_requirement_types(requirement_type_ids)
    return field_tree_from_specs(specs)


def _rows_snapshot(queryset):
    """把一批需求行读成快照列表。分块读，避免千行一次性驻留。"""
    return [
        _requirement_row(row)
        for row in queryset.order_by("sort_order", "created_at", "id").iterator(
            chunk_size=ROW_CHUNK_SIZE
        )
    ]


def build_snapshot(baseline, *, fields=None):
    """从正式表构造整份快照，版本记录与 diff 基准共用。

    fields 不给时按正式行引用到的类型实时派生 —— 写版本时这就是「冻结」动作。
    审批通过走的是提交时冻结的那份（见 _publish），避免提交到通过之间类型被改掉。
    """
    scope = baseline_row_scope(baseline)
    resolved_fields = (
        deepcopy(fields)
        if fields is not None
        else _live_field_tree(model=Requirement, scope=scope)
    )
    return {
        "baseline": baseline_meta_snapshot(baseline),
        "fields": resolved_fields,
        "requirements": _rows_snapshot(Requirement.objects.filter(**scope)),
    }


def build_draft_full_snapshot(*, baseline, draft):
    """把工作副本读成与 build_snapshot 同构的整份快照。

    meta 取基线行上的当前值 —— meta 编辑不经过草稿层。字段实时取自草稿行引用到
    的需求类型，这正是「提案」的一部分：类型改了字段，就会在 diff 里显示出来。
    """
    fields = _live_field_tree(model=RequirementDraftRow, scope={"draft": draft})
    return {
        "baseline": baseline_meta_snapshot(baseline),
        "fields": fields,
        "requirements": _rows_snapshot(RequirementDraftRow.objects.filter(draft=draft)),
    }


def build_change_snapshots(*, baseline, draft):
    """算出 diff 的两侧 (before, after)。

    「变更前」的字段必须取草稿里冻结的基线，不能实时派生：字段现在住在需求类型里，
    两侧都实时取的话永远是同一份，类型的字段改动就一条 diff 都出不来 —— 而这恰恰
    是类型改动抵达已发布内容的唯一通道。
    """
    if draft is None:
        return {}, build_snapshot(baseline)

    before = build_snapshot(baseline, fields=get_draft_baseline_field_tree(draft))
    before["baseline"] = get_draft_baseline_meta(draft)
    return before, build_draft_full_snapshot(baseline=baseline, draft=draft)


def _flatten_fields(tree):
    """摊平字段树，并给子字段带上父字段名，供 diff 展示定位。"""
    flat = {}
    sibling_positions = {}
    for spec in field_specs_from_tree(tree):
        # position 按 (需求类型, 父字段) 分组计数，而不是全局。字段树现在是多个
        # 类型的拼接，全局计数会让「引用的类型集合变了」把其他类型的根字段重新编号，
        # 而 position 在 FIELD_COMPARE_KEYS 里 —— 那会凭空炸出一堆假的字段变更项。
        position_key = (spec.requirement_type_id, spec.parent_field_id)
        position = sibling_positions.get(position_key, 0) + 1
        sibling_positions[position_key] = position
        flat[spec.id] = {
            "id": spec.id,
            "parent_field_id": spec.parent_field_id,
            "requirement_type_id": spec.requirement_type_id,
            "field_category": spec.field_category,
            "name": spec.name,
            "field_type": spec.field_type,
            "is_required": spec.is_required,
            "is_active": spec.is_active,
            "sort_order": spec.sort_order,
            "position": position,
            "config": spec.config,
            "default_value": spec.default_value,
        }
    for payload in flat.values():
        parent = flat.get(payload["parent_field_id"])
        payload["parent_name"] = parent["name"] if parent else None
    return flat


def _normalize_form_rows(rows):
    """子表单行按 row id 建索引，让「行内顺序变化」不被误判成内容变化。"""
    normalized = {}
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and row.get("id"):
            normalized[str(row["id"])] = row.get("values") or {}
    return normalized


def _root_field_changed(before_value, after_value, field_type):
    if field_type == RequirementFieldType.FORM:
        return _normalize_form_rows(before_value) != _normalize_form_rows(after_value)
    return before_value != after_value


def _row_compare_values(row):
    """行快照 -> 参与比较的 {key: value}。

    内置列用列名当 key，自定义字段用字段 UUID —— 两者不可能撞上，于是内置列和
    自定义字段走同一套字段级 diff，前端的「仅显示变化列」也能覆盖内置列。
    """
    row = row or {}
    return {
        **{column: row.get(column) for column in BUILTIN_COLUMNS},
        **(row.get("data") or {}),
    }


def _changed_root_field_ids(before_row, after_row, fields_by_id):
    """行内字段级 + 子表单行级比较，得出这一行里哪些根字段（含内置列）发生了变化。"""
    before_values = _row_compare_values(before_row)
    after_values = _row_compare_values(after_row)
    changed = []
    root_ids = {
        field_id
        for field_id, payload in fields_by_id.items()
        if payload["parent_field_id"] is None
    }
    for field_id in root_ids | set(before_values) | set(after_values):
        field = fields_by_id.get(field_id)
        field_type = field["field_type"] if field else None
        if _root_field_changed(
            before_values.get(field_id), after_values.get(field_id), field_type
        ):
            changed.append(field_id)
    return changed


def diff_snapshots(before, after):
    """产出三组变更项：审批配置 / 字段定义 / 需求条目。

    返回 (items, stats)。items 是未落库的 dict 列表，stats 带三个计数与本次涉及
    的字段 ID 集合（供前端「仅显示变化列」用）。
    """
    items = []
    changed_field_ids = set()

    # 没有基线 meta（首次发布）时不做 meta diff —— 「负责人：无 → X」是噪音
    before_meta = before.get("baseline")
    after_meta = after.get("baseline") or {}
    for index, key in enumerate(META_KEYS if before_meta is not None else ()):
        if key not in after_meta and key not in before_meta:
            continue
        if before_meta.get(key) == after_meta.get(key):
            continue
        items.append(
            {
                "target_kind": RequirementChangeTargetKind.BASELINE,
                "change_type": RequirementChangeType.UPDATE,
                "target_id": None,
                "before_snapshot": {"field": key, "value": before_meta.get(key)},
                "proposed_snapshot": {"field": key, "value": after_meta.get(key)},
                "proposed_sort_order": float(index),
            }
        )

    before_fields = _flatten_fields(before.get("fields") or [])
    after_fields = _flatten_fields(after.get("fields") or [])
    for field_id, payload in after_fields.items():
        previous = before_fields.get(field_id)
        if previous is None:
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.SCHEMA,
                    "change_type": RequirementChangeType.CREATE,
                    "target_id": field_id,
                    "before_snapshot": None,
                    "proposed_snapshot": payload,
                    "proposed_sort_order": payload["sort_order"],
                }
            )
            changed_field_ids.add(payload["parent_field_id"] or field_id)
        elif any(previous.get(key) != payload.get(key) for key in FIELD_COMPARE_KEYS):
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.SCHEMA,
                    "change_type": RequirementChangeType.UPDATE,
                    "target_id": field_id,
                    "before_snapshot": previous,
                    "proposed_snapshot": payload,
                    "proposed_sort_order": payload["sort_order"],
                }
            )
    for field_id, payload in before_fields.items():
        if field_id in after_fields:
            continue
        items.append(
            {
                "target_kind": RequirementChangeTargetKind.SCHEMA,
                "change_type": RequirementChangeType.DELETE,
                "target_id": field_id,
                "before_snapshot": payload,
                "proposed_snapshot": None,
                "proposed_sort_order": payload["sort_order"],
            }
        )

    before_rows = {row["id"]: row for row in before.get("requirements") or []}
    after_rows = {row["id"]: row for row in after.get("requirements") or []}
    for row in after.get("requirements") or []:
        previous = before_rows.get(row["id"])
        if previous is None:
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.REQUIREMENT,
                    "change_type": RequirementChangeType.CREATE,
                    "target_id": row["id"],
                    "before_snapshot": None,
                    "proposed_snapshot": row,
                    "proposed_sort_order": row.get("sort_order"),
                }
            )
            continue
        changed_roots = _changed_root_field_ids(previous, row, after_fields)
        if changed_roots:
            changed_field_ids.update(changed_roots)
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.REQUIREMENT,
                    "change_type": RequirementChangeType.UPDATE,
                    "target_id": row["id"],
                    "before_snapshot": previous,
                    "proposed_snapshot": row,
                    "proposed_sort_order": row.get("sort_order"),
                }
            )
    for row in before.get("requirements") or []:
        if row["id"] in after_rows:
            continue
        items.append(
            {
                "target_kind": RequirementChangeTargetKind.REQUIREMENT,
                "change_type": RequirementChangeType.DELETE,
                "target_id": row["id"],
                "before_snapshot": row,
                "proposed_snapshot": None,
                "proposed_sort_order": row.get("sort_order"),
            }
        )

    stats = {
        "created_count": sum(
            1 for item in items if item["change_type"] == RequirementChangeType.CREATE
        ),
        "updated_count": sum(
            1 for item in items if item["change_type"] == RequirementChangeType.UPDATE
        ),
        "deleted_count": sum(
            1 for item in items if item["change_type"] == RequirementChangeType.DELETE
        ),
        "changed_field_ids": sorted(item for item in changed_field_ids if item),
    }
    return items, stats


def build_version_comparison(*, before, after, from_version, to_version):
    """把两份版本快照整理成前端可直接消费的三组差异。

    版本快照没有 RequirementChangeItem 数据库行，因此这里补出稳定的字符串 id 和
    base_version。明细组仍保留完整列表，交给 view 在服务端按筛选条件分页。
    """
    items, stats = diff_snapshots(before, after)
    grouped_items = {
        RequirementChangeTargetKind.BASELINE: [],
        RequirementChangeTargetKind.SCHEMA: [],
        RequirementChangeTargetKind.REQUIREMENT: [],
    }

    for item in items:
        snapshot = item.get("proposed_snapshot") or item.get("before_snapshot") or {}
        target_key = item.get("target_id") or snapshot.get("field") or "unknown"
        normalized = {
            "id": f"{item['target_kind']}:{target_key}",
            **item,
            "base_version": from_version,
        }
        grouped_items[item["target_kind"]].append(normalized)

    def item_sort_key(item):
        sort_order = item.get("proposed_sort_order")
        return (
            sort_order is None,
            sort_order if sort_order is not None else 0,
            str(item.get("target_id") or item["id"]),
        )

    for grouped in grouped_items.values():
        grouped.sort(key=item_sort_key)

    requirement_items = grouped_items[RequirementChangeTargetKind.REQUIREMENT]
    schema_items = grouped_items[RequirementChangeTargetKind.SCHEMA]
    fields_snapshot = deepcopy(after.get("fields") or [])
    return {
        "from_version": from_version,
        "to_version": to_version,
        "baseline_items": grouped_items[RequirementChangeTargetKind.BASELINE],
        "schema_items": schema_items,
        "requirement_items": requirement_items,
        "requirement_item_count": len(requirement_items),
        "changed_field_ids": stats["changed_field_ids"],
        "to_fields_snapshot": fields_snapshot,
        "requirement_type_stats": _comparison_requirement_type_stats(
            schema_items=schema_items,
            requirement_items=requirement_items,
            fields=fields_snapshot,
        ),
    }


def _requirement_type_key_expression():
    """变更项所属需求类型的取值表达式。

    需求类型 ID 只存在于快照 JSON 里 —— 变更项表上没有这一列。新增项没有
    before_snapshot、删除项没有 proposed_snapshot，所以两侧取先有的那个。
    """
    return Coalesce(
        KeyTextTransform("requirement_type_id", "proposed_snapshot"),
        KeyTextTransform("requirement_type_id", "before_snapshot"),
    )


def filter_change_items_by_requirement_type(queryset, requirement_type_id):
    """按需求类型裁剪变更项。

    分页在服务端，一页里混着多个类型的行，前端没法自己分组。
    """
    return queryset.filter(
        Q(proposed_snapshot__requirement_type_id=str(requirement_type_id))
        | Q(before_snapshot__requirement_type_id=str(requirement_type_id))
    )


def build_change_requirement_type_stats(change_request_id):
    """变更单涉及的需求类型及各自的变更计数。

    一个产品下的需求可能分属多个类型，评审页据此按类型分视图 —— 否则表头是所有类型
    字段的并集，而每行只属于一个类型，只填得满自己那几列，其余全是空洞。

    计数在库侧按 JSON key 分组算：上千条变更项每条都带两份完整行快照，不能为了数
    个数把它们读进内存。
    """
    rows = (
        RequirementChangeItem.objects.filter(change_request_id=change_request_id)
        .exclude(target_kind=RequirementChangeTargetKind.BASELINE)
        .annotate(requirement_type_key=_requirement_type_key_expression())
        # 必须清掉 Meta.ordering：排序字段会被一并塞进 GROUP BY，分组会退化成不聚合
        .order_by()
        .values("requirement_type_key")
        .annotate(
            created_count=Count(
                "id",
                filter=Q(
                    target_kind=RequirementChangeTargetKind.REQUIREMENT,
                    change_type=RequirementChangeType.CREATE,
                ),
            ),
            updated_count=Count(
                "id",
                filter=Q(
                    target_kind=RequirementChangeTargetKind.REQUIREMENT,
                    change_type=RequirementChangeType.UPDATE,
                ),
            ),
            deleted_count=Count(
                "id",
                filter=Q(
                    target_kind=RequirementChangeTargetKind.REQUIREMENT,
                    change_type=RequirementChangeType.DELETE,
                ),
            ),
            schema_item_count=Count(
                "id",
                filter=Q(target_kind=RequirementChangeTargetKind.SCHEMA),
            ),
        )
    )
    counts = {
        row["requirement_type_key"]: row
        for row in rows
        if row["requirement_type_key"]
    }
    if not counts:
        return []

    def stat(requirement_type_id, name, row):
        return {
            "id": requirement_type_id,
            "name": name,
            "created_count": row["created_count"],
            "updated_count": row["updated_count"],
            "deleted_count": row["deleted_count"],
            "schema_item_count": row["schema_item_count"],
        }

    # 顺序跟随需求类型自身的 (sort_order, created_at, id)，与数据页的视图切换器一致
    stats = []
    ordered = (
        RequirementType.objects.filter(id__in=list(counts))
        .order_by("sort_order", "created_at", "id")
        .values_list("id", "name")
    )
    for requirement_type_id, name in ordered:
        row = counts.pop(str(requirement_type_id), None)
        if row is not None:
            stats.append(stat(str(requirement_type_id), name, row))
    # 需求类型已被删除时也要保留分组，否则这部分变更项在评审页里没有任何入口
    stats.extend(
        stat(requirement_type_key, "", row)
        for requirement_type_key, row in counts.items()
    )
    return stats


def _requirement_type_names(requirement_type_ids):
    ids = [item for item in requirement_type_ids if item]
    if not ids:
        return {}
    return {
        str(key): value
        for key, value in RequirementType.objects.filter(id__in=ids).values_list(
            "id", "name"
        )
    }


def snapshot_requirement_type_stats(snapshot):
    """版本快照涉及的需求类型 + 各自的字段数与需求条目数。

    顺序取字段树里类型首次出现的顺序：快照里的字段树本来就是按类型顺序拼接的，不必
    再回查类型表排序 —— 快照是冻结的，类型此刻可能已经被删了。
    """
    field_counts = {}
    order = []

    def bucket(key):
        if key not in field_counts:
            field_counts[key] = 0
            order.append(key)
        return key

    for node in snapshot.get("fields") or []:
        key = bucket(str(node.get("requirement_type_id") or ""))
        field_counts[key] += 1 + len(node.get("children") or [])

    requirement_counts = {}
    for row in snapshot.get("requirements") or []:
        key = bucket(str(row.get("requirement_type_id") or ""))
        requirement_counts[key] = requirement_counts.get(key, 0) + 1

    names = _requirement_type_names(order)
    return [
        {
            "id": key,
            "name": names.get(key, ""),
            "field_count": field_counts[key],
            "requirement_count": requirement_counts.get(key, 0),
        }
        for key in order
    ]


_CHANGE_TYPE_COUNT_KEYS = {
    RequirementChangeType.CREATE: "created_count",
    RequirementChangeType.UPDATE: "updated_count",
    RequirementChangeType.DELETE: "deleted_count",
}


def _comparison_requirement_type_stats(*, schema_items, requirement_items, fields):
    """版本对比的按需求类型计数，形状与 build_change_requirement_type_stats 对齐。

    对比结果不落库，全在内存里，所以直接按快照上的 requirement_type_id 分组即可。
    """
    counts = {}
    order = []

    def bucket(key):
        if key not in counts:
            counts[key] = {
                "created_count": 0,
                "updated_count": 0,
                "deleted_count": 0,
                "schema_item_count": 0,
            }
            order.append(key)
        return counts[key]

    # 先按目标版本的字段树排一遍需求类型顺序，与快照视图保持一致
    for node in fields or []:
        bucket(str(node.get("requirement_type_id") or ""))

    def requirement_type_key(item):
        snapshot = item.get("proposed_snapshot") or item.get("before_snapshot") or {}
        return str(snapshot.get("requirement_type_id") or "")

    for item in schema_items:
        bucket(requirement_type_key(item))["schema_item_count"] += 1
    for item in requirement_items:
        count_key = _CHANGE_TYPE_COUNT_KEYS.get(item["change_type"])
        if count_key:
            bucket(requirement_type_key(item))[count_key] += 1

    names = _requirement_type_names(order)
    return [
        {"id": key, "name": names.get(key, ""), **counts[key]}
        for key in order
        # 目标版本里没有任何变更的类型不出现在切换器上 —— 切过去只会是一张空表
        if any(counts[key].values())
    ]


def _next_sequence_id(baseline):
    latest = RequirementChangeRequest.all_objects.filter(
        baseline=baseline
    ).aggregate(latest=Max("sequence_id"))["latest"]
    return (latest or 0) + 1


def _next_version_number(baseline):
    latest = RequirementVersion.objects.filter(
        baseline=baseline,
        target_kind=RequirementChangeTargetKind.BASELINE,
    ).aggregate(latest=Max("version"))["latest"]
    return (latest or 0) + 1


def get_pending_change_request(baseline):
    if baseline is None:
        return None
    return (
        RequirementChangeRequest.objects.filter(
            baseline=baseline,
            status=RequirementChangeStatus.PENDING,
        )
        .order_by("-created_at")
        .first()
    )


def _get_effective_approval_config(*, baseline, draft):
    """返回本次变更单必须遵循的已生效审批配置。

    首次发布还没有已生效版本，只能使用当前配置。后续变更的审批设置本身也是提案的
    一部分，因此必须从开始编辑时冻结的基线读取；否则提交人可以先把审批人改成自己，
    再用尚未生效的配置审批同一份变更。
    """
    if baseline.current_version is None:
        approval_meta = baseline_meta_snapshot(baseline)
    else:
        approval_meta = get_draft_baseline_meta(draft) if draft is not None else {}
        required_keys = {"approval_type", "required_count", "approver_ids"}
        if not required_keys.issubset(approval_meta):
            raise RequirementChangeError(
                "The approved approval configuration could not be resolved.",
                code="REQUIREMENT_APPROVAL_BASELINE_MISSING",
            )

    approver_ids = list(dict.fromkeys(approval_meta.get("approver_ids") or []))
    if not approver_ids:
        raise RequirementChangeError(
            "Configure at least one approver before submitting for approval.",
            code="REQUIREMENT_APPROVER_REQUIRED",
        )

    approval_type = approval_meta.get("approval_type")
    required_count = approval_meta.get("required_count")
    valid_rule = approval_type in RequirementApprovalType.values and (
        (
            approval_type == RequirementApprovalType.N_OF_M
            and isinstance(required_count, int)
            and 1 <= required_count <= len(approver_ids)
        )
        or (
            approval_type != RequirementApprovalType.N_OF_M
            and required_count is None
        )
    )
    if not valid_rule:
        raise RequirementChangeError(
            "The approved approval configuration is invalid.",
            code="REQUIREMENT_APPROVAL_BASELINE_INVALID",
        )
    return approval_type, required_count, approver_ids


def submit_change_request(*, baseline, reason="", actor=None):
    """从 draft 提交审批。首次发布与后续变更走完全相同的这条链路。"""
    if baseline.status != RequirementStatus.DRAFT:
        raise RequirementChangeError(
            "Only a draft baseline can be submitted for approval.",
            code="REQUIREMENT_NOT_DRAFT",
        )

    draft = get_draft(baseline)
    approval_type, required_count, approver_ids = _get_effective_approval_config(
        baseline=baseline,
        draft=draft,
    )
    before, after = build_change_snapshots(
        baseline=baseline,
        draft=draft,
    )
    items, stats = diff_snapshots(before, after)
    if not items:
        raise RequirementChangeError(
            "There are no changes to submit.",
            code="REQUIREMENT_NO_CHANGES",
        )

    change_request = RequirementChangeRequest(
        baseline=baseline,
        workspace_id=baseline.workspace_id,
        product_id=baseline.product_id,
        project_id=baseline.project_id,
        target_kind=RequirementChangeTargetKind.BASELINE,
        request_kind=(
            RequirementChangeRequestKind.INITIAL_PUBLISH
            if baseline.current_version is None
            else RequirementChangeRequestKind.CHANGE
        ),
        sequence_id=_next_sequence_id(baseline),
        base_version=baseline.current_version,
        approval_type=approval_type,
        required_count=required_count,
        status=RequirementChangeStatus.PENDING,
        reason=reason or "",
        # 冻结提案里的字段树：类型不走审批、随时可改，不冻结的话审批人看到的字段
        # 结构与通过后真正落库的可能不是同一份
        proposed_fields=deepcopy(after.get("fields") or []),
        created_by=actor,
        **stats,
    )
    change_request.save()

    pending = []
    for item in items:
        pending.append(
            RequirementChangeItem(
                change_request=change_request,
                base_version=baseline.current_version,
                created_by=actor,
                **item,
            )
        )
        if len(pending) >= ITEM_BATCH_SIZE:
            RequirementChangeItem.objects.bulk_create(pending)
            pending = []
    if pending:
        RequirementChangeItem.objects.bulk_create(pending)

    RequirementChangeApproval.objects.bulk_create(
        [
            RequirementChangeApproval(
                change_request=change_request,
                approver_id=approver_id,
                created_by=actor,
            )
            for approver_id in approver_ids
        ]
    )

    baseline.status = RequirementStatus.IN_REVIEW
    baseline.updated_by = actor
    baseline.save(update_fields=["status", "updated_at", "updated_by"])
    return change_request


def _is_approved(change_request, approved_count, total_count):
    if change_request.approval_type == RequirementApprovalType.ALL:
        return approved_count >= total_count
    if change_request.approval_type == RequirementApprovalType.N_OF_M:
        return approved_count >= (change_request.required_count or total_count)
    return approved_count >= 1


def _publish(*, change_request, baseline, actor=None):
    """把提案落成已发布内容：物化工作副本（如果有）+ 写一个新版本。

    版本号必须先算出来 —— 物化时要用它给「本次真正变了的行」盖上
    last_changed_version，那正是网格里「最后变更于 vN」那一列。
    """
    version_number = _next_version_number(baseline)
    draft = get_draft(baseline)
    if draft is not None:
        materialize_draft(
            baseline=baseline,
            draft=draft,
            version_number=version_number,
            actor=actor,
        )
    else:
        # 首次发布没有工作副本：正式表里的行就是提案，整批记为第一个版本
        stamp_initial_versions(baseline=baseline, version_number=version_number)

    approved_by = [
        str(approver_id)
        for approver_id in change_request.approvals.filter(
            action=RequirementApprovalAction.APPROVED
        ).values_list("approver_id", flat=True)
    ]
    version = RequirementVersion(
        baseline=baseline,
        workspace_id=baseline.workspace_id,
        product_id=baseline.product_id,
        project_id=baseline.project_id,
        target_kind=RequirementChangeTargetKind.BASELINE,
        target_id=baseline.id,
        version=version_number,
        change_type=(
            RequirementChangeType.CREATE
            if change_request.base_version is None
            else RequirementChangeType.UPDATE
        ),
        # 用提交时冻结的字段树，而不是此刻再去类型上实时取 —— 否则提交到通过之间
        # 有人改了类型，落库的版本就和审批人看过的对不上
        snapshot=build_snapshot(
            baseline, fields=change_request.proposed_fields or None
        ),
        change_request=change_request,
        approved_by=approved_by,
        created_by=actor,
    )
    version.save()

    if draft is not None:
        drop_draft(draft)
    baseline.status = RequirementStatus.PUBLISHED
    baseline.current_version = version_number
    baseline.updated_by = actor
    baseline.save(
        update_fields=["status", "current_version", "updated_at", "updated_by"]
    )
    return version


def act_on_change_request(*, change_request, approver, action, comment=""):
    """写审批记录并按规则判定结果。

    任一拒绝立即驳回；通过则物化工作副本 + 写新版本；驳回与撤回一律回 draft 并
    保留工作副本，用户改完可以再提交。
    """
    if change_request.status != RequirementChangeStatus.PENDING:
        raise RequirementChangeError(
            "This change request has already been closed.",
            code="REQUIREMENT_CHANGE_CLOSED",
        )

    approval = change_request.approvals.filter(approver=approver).first()
    if approval is None:
        raise RequirementChangeError(
            "You are not an approver of this change request.",
            code="REQUIREMENT_NOT_APPROVER",
        )
    if approval.action:
        raise RequirementChangeError(
            "You have already acted on this change request.",
            code="REQUIREMENT_ALREADY_ACTED",
        )

    approval.action = action
    approval.comment = comment or ""
    approval.acted_at = timezone.now()
    approval.updated_by = approver
    approval.save(update_fields=["action", "comment", "acted_at", "updated_at", "updated_by"])

    baseline = change_request.baseline
    version = None
    if action == RequirementApprovalAction.REJECTED:
        change_request.status = RequirementChangeStatus.REJECTED
        change_request.completed_at = timezone.now()
        change_request.updated_by = approver
        change_request.save(
            update_fields=["status", "completed_at", "updated_at", "updated_by"]
        )
        baseline.status = RequirementStatus.DRAFT
        baseline.updated_by = approver
        baseline.save(update_fields=["status", "updated_at", "updated_by"])
        return change_request, version

    approvals = list(change_request.approvals.all())
    approved_count = sum(
        1
        for item in approvals
        if item.action == RequirementApprovalAction.APPROVED
    )
    if _is_approved(change_request, approved_count, len(approvals)):
        version = _publish(
            change_request=change_request,
            baseline=baseline,
            actor=approver,
        )
        change_request.status = RequirementChangeStatus.APPROVED
        change_request.completed_at = timezone.now()
        change_request.updated_by = approver
        change_request.save(
            update_fields=["status", "completed_at", "updated_at", "updated_by"]
        )
    return change_request, version


def cancel_change_request(*, change_request, actor=None):
    """撤回审批：变更单置为已撤回，基线回到 draft 并保留工作副本。"""
    if change_request.status != RequirementChangeStatus.PENDING:
        raise RequirementChangeError(
            "This change request has already been closed.",
            code="REQUIREMENT_CHANGE_CLOSED",
        )
    change_request.status = RequirementChangeStatus.CANCELLED
    change_request.completed_at = timezone.now()
    change_request.updated_by = actor
    change_request.save(
        update_fields=["status", "completed_at", "updated_at", "updated_by"]
    )

    baseline = change_request.baseline
    baseline.status = RequirementStatus.DRAFT
    baseline.updated_by = actor
    baseline.save(update_fields=["status", "updated_at", "updated_by"])
    return change_request


def rollback_to_version(*, baseline, version, actor=None):
    """把历史快照灌入工作副本，字段与需求行不直接改正式表 —— 回滚也要再走一次审批。

    meta 与常规编辑一样直接写基线行（diff 的「变更前」来自工作副本里冻结的基线，
    所以回滚出来的 meta 变化仍然会出现在变更单里）。
    """
    if baseline.status == RequirementStatus.IN_REVIEW:
        raise RequirementChangeError(
            "Withdraw or complete the current review before rolling back.",
            code="REQUIREMENT_IN_REVIEW",
        )
    draft = start_editing(baseline=baseline, actor=actor)
    if draft is None:
        raise RequirementChangeError(
            "This baseline has never been published, so there is nothing to roll back to.",
            code="REQUIREMENT_NEVER_PUBLISHED",
        )
    load_snapshot_into_draft(draft=draft, snapshot=version.snapshot, actor=actor)
    _apply_meta(
        baseline=baseline,
        meta=(version.snapshot or {}).get("baseline") or {},
        actor=actor,
    )
    return draft


def _apply_meta(*, baseline, meta, actor=None):
    if not meta:
        return baseline

    if meta.get("owner_id"):
        baseline.owner_id = meta["owner_id"]
    baseline.approval_type = meta.get("approval_type", baseline.approval_type)
    baseline.required_count = meta.get("required_count", baseline.required_count)
    if "approver_ids" in meta:
        replace_requirement_approvers(
            baseline=baseline,
            approver_ids=meta["approver_ids"],
            actor=actor,
        )
    baseline.updated_by = actor
    baseline.save(
        update_fields=[
            "owner",
            "approval_type",
            "required_count",
            "updated_at",
            "updated_by",
        ]
    )
    return baseline
