"""需求审批：以**一条需求**为单位的提交 / 审批 / 驳回 / 撤回。

一条需求的生命周期（approval_state 由三列派生，不落库）：

    draft ──提交──> in_review ──通过──> approved（写 v1，status=confirmed）
                              ──驳回/撤回──> draft（内容原样保留）

    approved ──改动──> modified ──提交──> in_review ──通过──> approved（写 v(N+1)）

    approved/modified ──提交删除──> pending_deletion ──通过──> 写墓碑版本后软删

没有影子表。`requirements` 的行就是唯一的可变副本，人直接改它；「最后一次批准的
内容」在 RequirementVersion 里。所以审批不是「把工作副本物化回正式表」，而是「写一条
版本行、改两个整数、清一个指针」，而驳回与撤回在行上完全相同 —— 都只是清指针。

一张变更单覆盖 1..N 条需求，同批通过、同批驳回。「一条需求同时最多在一张待审单里」
由 Requirement.pending_change_item 这个单值外键保证。
"""

from copy import deepcopy

from django.db.models import Count, Max, Q
from django.utils import timezone

from plane.db.models import (
    Requirement,
    RequirementApprovalAction,
    RequirementApprovalType,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeStatus,
    RequirementChangeType,
    RequirementFieldType,
    RequirementItemStatus,
    RequirementType,
    RequirementVersion,
)
from plane.utils.requirement import (
    CONTENT_BUILTIN_COLUMNS,
    builtin_values_from_payload,
    field_specs_for_requirement_types,
    prune_requirement_data_to_fields,
    serialize_builtin_values,
)
from plane.utils.requirement_notification import (
    notify_rejected_by_approver,
    notify_review_requested,
    notify_review_settled,
    notify_review_withdrawn,
)
from plane.utils.requirement_schema import ensure_schema_revision, flatten_field_tree


ITEM_BATCH_SIZE = 500


class RequirementChangeError(Exception):
    """变更流程的状态或权限前置条件不满足。"""

    def __init__(self, message, *, code="REQUIREMENT_CHANGE_INVALID", detail=None):
        self.code = code
        self.detail = detail or {}
        super().__init__(message)


# --- 行快照与内容比较 -----------------------------------------------------


def requirement_row_snapshot(row):
    """行快照：八个内置列平铺在顶层，data 只装自定义字段。

    编号（sequence_id / source_*）直接写在顶层，**没有**走 BUILTIN_COLUMN_DEFAULTS ——
    原因见那份 dict 上方的注释。快照顶层的额外 key 则完全安全：所有消费方
    （_row_compare_values 按 CONTENT_BUILTIN_COLUMNS 取、builtin_values_from_payload
    按 BUILTIN_COLUMNS 取）都是白名单取值，不是整体比对，所以编号既不会污染 diff，
    也不会被回滚写回活行。

    基线视图把 version.snapshot 原样吐给前端，没有编号那里就显示不出 ECOM-1，
    而基线恰恰是最需要稳定编号的场景。
    历史快照没有这三个 key，读侧一律 .get()，前端拿不到就不显示编号。
    """
    return {
        "id": str(row.id),
        "requirement_type_id": str(row.requirement_type_id),
        "sequence_id": row.sequence_id,
        "source_library_id": (
            str(row.source_library_id) if row.source_library_id else None
        ),
        "source_sequence_id": row.source_sequence_id,
        **serialize_builtin_values(row),
        "data": deepcopy(row.data or {}),
        "sort_order": row.sort_order,
    }


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

    内置列用列名当 key，自定义字段用字段 UUID —— 两者不可能撞上，于是内置列和自定义
    字段走同一套字段级 diff，前端的「仅显示变化列」也能覆盖内置列。

    只取 CONTENT_BUILTIN_COLUMNS：status 是交付进度轴，研发做完了不该触发一轮内容评审。
    """
    row = row or {}
    return {
        **{column: row.get(column) for column in CONTENT_BUILTIN_COLUMNS},
        **(row.get("data") or {}),
    }


def changed_root_field_ids(before_row, after_row, fields_by_id):
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


# --- 序号与版本号 ---------------------------------------------------------


def scope_filter(policy):
    """这份审批配置管辖的行/单的过滤条件。标准库的行永远不在其中。"""
    if policy.product_id:
        return {"product_id": policy.product_id}
    return {"project_id": policy.project_id}


def _next_sequence_id(policy):
    """变更单序号按作用域自增（CR-001），不再按基线。"""
    current = RequirementChangeRequest.objects.filter(
        **scope_filter(policy)
    ).aggregate(value=Max("sequence_id"))["value"]
    return (current or 0) + 1


def _next_version_number(requirement_id):
    """版本号按需求自增。软删的版本也要算进来 —— 唯一约束是 (target_id, version)。"""
    current = RequirementVersion.all_objects.filter(
        target_id=requirement_id
    ).aggregate(value=Max("version"))["value"]
    return (current or 0) + 1


def approved_snapshot(requirement):
    """这条需求最后一次通过审批时的内容快照；从未通过则为 None。"""
    if requirement.approved_version is None:
        return None
    return (
        RequirementVersion.objects.filter(
            target_id=requirement.id, version=requirement.approved_version
        )
        .values_list("snapshot", flat=True)
        .first()
    )


# --- 删除闭包 -------------------------------------------------------------


def descendant_requirements(requirement):
    """这条需求的全部后代（广度优先，去重）。

    删除必须连着子树走：parent 是 SET_NULL，只删父项会静默把每个已确认子需求的
    parent_id 改掉 —— 那是对已批准内容的修改却没走审批。
    """
    scope = (
        {"product_id": requirement.product_id}
        if requirement.product_id
        else {"project_id": requirement.project_id}
    )
    seen = {requirement.id}
    frontier = [requirement.id]
    collected = []
    while frontier:
        children = list(
            Requirement.objects.filter(**scope, parent_id__in=frontier).exclude(
                id__in=seen
            )
        )
        if not children:
            break
        frontier = []
        for child in children:
            seen.add(child.id)
            frontier.append(child.id)
            collected.append(child)
    return collected


# --- 提交 -----------------------------------------------------------------


def _resolve_change_type(row, requested):
    """change_type 由服务端定，客户端只能表达「我要删」这个意图。

    新增与修改的区别是「有没有通过过审批」，让客户端说了算等于让一个陈旧的网格决定
    这条需求算不算新建。
    """
    if requested == RequirementChangeType.DELETE:
        return RequirementChangeType.DELETE
    if row.approved_version is None:
        return RequirementChangeType.CREATE
    return RequirementChangeType.UPDATE


def submit_change_request(*, policy, items, reason="", actor=None):
    """提交 1..N 条需求进入评审。

    items: [{"requirement_id": UUID, "change_type": "create"|"update"|"delete"}]
    客户端只发指针不发快照 —— 服务端自己读当前行内容，否则一个陈旧的网格可以用旧
    内容开出一张新单。
    """
    approver_ids = list(
        policy.approvers.order_by("sort_order", "created_at", "id").values_list(
            "approver_id", flat=True
        )
    )
    if not approver_ids:
        raise RequirementChangeError(
            "Configure at least one approver before submitting.",
            code="REQUIREMENT_APPROVER_REQUIRED",
        )
    if not items:
        raise RequirementChangeError(
            "Select at least one requirement to submit.",
            code="REQUIREMENT_NO_CHANGES",
        )

    scope = scope_filter(policy)
    requested_by_id = {}
    for item in items:
        requested_by_id[str(item["requirement_id"])] = item.get(
            "change_type"
        ) or RequirementChangeType.UPDATE

    # 锁定顺序恒定（sort_order, created_at, id），两个并发提交不会死锁
    rows = list(
        Requirement.objects.select_for_update()
        .filter(**scope, id__in=list(requested_by_id))
        .order_by("sort_order", "created_at", "id")
    )
    found_ids = {str(row.id) for row in rows}
    missing = [item_id for item_id in requested_by_id if item_id not in found_ids]
    if missing:
        raise RequirementChangeError(
            "Some requirements were not found in this scope.",
            code="REQUIREMENT_NOT_FOUND",
            detail={"requirement_ids": missing},
        )

    targets = []
    for row in rows:
        targets.append((row, _resolve_change_type(row, requested_by_id[str(row.id)])))

    # 删除要连着子树：已通过审批的后代作为额外的删除项进同一张单；从未通过的后代
    # 在批准时直接删，不需要变更项（没有已批准内容需要保护）。
    known_ids = {row.id for row, _ in targets}
    for row, change_type in list(targets):
        if change_type != RequirementChangeType.DELETE:
            continue
        for child in descendant_requirements(row):
            if child.id in known_ids:
                continue
            known_ids.add(child.id)
            if child.approved_version is not None:
                targets.append((child, RequirementChangeType.DELETE))

    locked = [
        str(row.id) for row, _ in targets if row.pending_change_item_id is not None
    ]
    if locked:
        # 子树里有别的单锁住的行时，报一个更能指导操作的码
        explicit_ids = set(requested_by_id)
        if any(row_id not in explicit_ids for row_id in locked):
            raise RequirementChangeError(
                "Some sub requirements are already under review.",
                code="REQUIREMENT_HAS_LOCKED_CHILDREN",
                detail={"requirement_ids": locked},
            )
        raise RequirementChangeError(
            "Some requirements are already under review.",
            code="REQUIREMENT_ALREADY_IN_REVIEW",
            detail={"requirement_ids": locked},
        )

    _, fields_by_type = field_specs_for_requirement_types(
        {row.requirement_type_id for row, _ in targets}
    )
    revisions = {}
    for requirement_type in RequirementType.objects.filter(
        id__in={row.requirement_type_id for row, _ in targets}
    ):
        revisions[requirement_type.id] = ensure_schema_revision(
            requirement_type, actor=actor
        )

    change_request = RequirementChangeRequest(
        workspace_id=policy.workspace_id,
        product_id=policy.product_id,
        project_id=policy.project_id,
        sequence_id=_next_sequence_id(policy),
        approval_type=policy.approval_type,
        required_count=policy.required_count,
        status=RequirementChangeStatus.PENDING,
        reason=reason or "",
        created_by=actor,
        updated_by=actor,
    )
    change_request.save()

    pending_items = []
    counts = {
        RequirementChangeType.CREATE: 0,
        RequirementChangeType.UPDATE: 0,
        RequirementChangeType.DELETE: 0,
    }
    changed_field_ids = set()
    unchanged = []

    for row, change_type in targets:
        before = approved_snapshot(row)
        proposed = requirement_row_snapshot(row)
        if change_type == RequirementChangeType.DELETE:
            proposed = None
        elif change_type == RequirementChangeType.UPDATE:
            fields_by_id = flatten_field_tree(
                _tree_of(fields_by_type.get(str(row.requirement_type_id)) or [])
            )
            row_changed = changed_root_field_ids(before, proposed, fields_by_id)
            if not row_changed:
                unchanged.append(str(row.id))
                continue
            changed_field_ids.update(row_changed)

        counts[change_type] += 1
        pending_items.append(
            RequirementChangeItem(
                change_request=change_request,
                change_type=change_type,
                target_id=row.id,
                requirement_type_id=row.requirement_type_id,
                schema_revision=revisions[row.requirement_type_id],
                before_snapshot=before,
                proposed_snapshot=proposed,
                base_version=row.approved_version,
                base_row_version=row.version,
                proposed_sort_order=row.sort_order,
                created_by=actor,
                updated_by=actor,
            )
        )

    if not pending_items:
        change_request.delete(soft=False)
        raise RequirementChangeError(
            "The selected requirements have no changes to submit.",
            code="REQUIREMENT_NO_CHANGES",
            detail={"requirement_ids": unchanged},
        )

    RequirementChangeItem.objects.bulk_create(pending_items, batch_size=ITEM_BATCH_SIZE)

    change_request.created_count = counts[RequirementChangeType.CREATE]
    change_request.updated_count = counts[RequirementChangeType.UPDATE]
    change_request.deleted_count = counts[RequirementChangeType.DELETE]
    change_request.changed_field_ids = sorted(changed_field_ids)
    change_request.save(
        update_fields=[
            "created_count",
            "updated_count",
            "deleted_count",
            "changed_field_ids",
            "updated_at",
        ]
    )

    # 审批人名单与规则在提交这一刻就物化下来，此后改配置不影响在途的单
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

    notify_review_requested(change_request, actor=actor)

    item_by_target = {item.target_id: item for item in pending_items}
    locked_rows = []
    for row, _ in targets:
        item = item_by_target.get(row.id)
        if item is None:
            continue
        row.pending_change_item = item
        locked_rows.append(row)
    if locked_rows:
        Requirement.objects.bulk_update(locked_rows, ["pending_change_item"])

    return change_request


def _tree_of(specs):
    """specs -> 字段树，只为了喂给 flatten_field_tree 做行内字段级 diff。"""
    from plane.utils.requirement import field_tree_from_specs

    return field_tree_from_specs(specs)


# --- 审批 -----------------------------------------------------------------


def _is_approved(change_request, approved_count, total_count):
    if change_request.approval_type == RequirementApprovalType.ALL:
        return approved_count >= total_count
    if change_request.approval_type == RequirementApprovalType.N_OF_M:
        return approved_count >= (change_request.required_count or total_count)
    return approved_count >= 1


def _clear_pending(change_request, *, actor=None):
    """把这张单锁住的行全部解锁。驳回与撤回共用 —— 内容一个字都不动。"""
    Requirement.objects.filter(
        pending_change_item__change_request=change_request
    ).update(pending_change_item=None, updated_at=timezone.now(), updated_by=actor)


def _apply_approved_items(change_request, *, actor):
    """通过审批：逐条写版本、改两个整数、清指针。"""
    versions = []
    items = list(
        change_request.items.select_related("schema_revision").order_by(
            "proposed_sort_order", "created_at", "id"
        )
    )
    rows = {
        row.id: row
        for row in Requirement.objects.select_for_update().filter(
            id__in=[item.target_id for item in items]
        )
    }

    for item in items:
        row = rows.get(item.target_id)
        if row is None:
            # 行在评审期间被删了。指针本该挡住这条路径，留个兜底不写版本。
            continue

        if item.change_type == RequirementChangeType.DELETE:
            snapshot = item.before_snapshot or requirement_row_snapshot(row)
        else:
            # 首次通过时把 draft 顶成 confirmed 再快照 —— 版本记录的是「批准后的样子」，
            # 而 draft 这个状态按定义不可能是被批准的内容。
            if row.status == RequirementItemStatus.DRAFT:
                row.status = RequirementItemStatus.CONFIRMED
            snapshot = requirement_row_snapshot(row)

        version = RequirementVersion(
            workspace_id=row.workspace_id,
            product_id=row.product_id,
            project_id=row.project_id,
            target_id=row.id,
            requirement_type_id=row.requirement_type_id,
            schema_revision=item.schema_revision,
            version=_next_version_number(row.id),
            change_type=item.change_type,
            snapshot=snapshot,
            sort_order=row.sort_order,
            change_request=change_request,
            change_item=item,
            approved_by=[
                str(approval.approver_id)
                for approval in change_request.approvals.all()
                if approval.action == RequirementApprovalAction.APPROVED
            ],
            created_by=actor,
            updated_by=actor,
        )
        version.save()
        versions.append(version)

        row.approved_version = version.version
        row.pending_change_item = None
        row.updated_by = actor

        if item.change_type == RequirementChangeType.DELETE:
            row.save(
                update_fields=[
                    "approved_version",
                    "pending_change_item",
                    "updated_at",
                    "updated_by",
                ]
            )
            # 从未通过审批的后代没有需要保护的已批准内容，随父项一起删
            for child in descendant_requirements(row):
                if child.approved_version is None:
                    child.delete()
            row.delete()
            continue

        row.approved_row_version = row.version
        row.save(
            update_fields=[
                "status",
                "approved_version",
                "approved_row_version",
                "pending_change_item",
                "updated_at",
                "updated_by",
            ]
        )

    return versions


def _revert_rejected_items(change_request, *, actor):
    """驳回时把内容退回上一个已通过版本（禅道的「撤销变更」）。

    必须在 _clear_pending 之后调用：那是一次 .update()，内存里的行已经陈旧，所以这里
    重新上锁取一遍；而 rollback_requirement_to_version 自己会拒绝仍被锁住的行，顺序反了
    会整批失败。

    change_type=create 的条目跳过 —— 它没有「上一版」可回，驳回后留在草稿即可。
    """
    items = [
        item
        for item in change_request.items.all()
        if item.base_version is not None
        and item.change_type != RequirementChangeType.CREATE
    ]
    if not items:
        return
    rows = {
        row.id: row
        for row in Requirement.objects.select_for_update().filter(
            id__in=[item.target_id for item in items]
        )
    }
    for item in items:
        row = rows.get(item.target_id)
        if row is None:
            continue
        rollback_requirement_to_version(
            requirement=row, version_number=item.base_version, actor=actor
        )


def act_on_change_request(*, change_request, approver, action, comment="", revert=False):
    """写审批记录并按规则判定结果。

    任一拒绝立即驳回；通过则逐条写版本。驳回与撤回默认只清指针、内容原样保留 ——
    用户改完可以直接再提交。

    revert=True 时额外把内容退回上一个已通过版本，对应禅道评审结果里的「撤销变更」。
    它是审批人的一个显式选项，不是驳回的默认行为：多数驳回是「改一改再提」，直接把人
    的改动丢掉太重。
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
    approval.save(
        update_fields=["action", "comment", "acted_at", "updated_at", "updated_by"]
    )

    versions = []
    if action == RequirementApprovalAction.REJECTED:
        change_request.status = RequirementChangeStatus.REJECTED
        change_request.completed_at = timezone.now()
        change_request.updated_by = approver
        change_request.save(
            update_fields=["status", "completed_at", "updated_at", "updated_by"]
        )
        _clear_pending(change_request, actor=approver)
        if revert:
            _revert_rejected_items(change_request, actor=approver)
        notify_review_settled(change_request, actor=approver)
        # 任一拒绝即驳回，其余人不用再看了
        notify_rejected_by_approver(change_request, actor=approver)
        return change_request, versions

    approvals = list(change_request.approvals.all())
    approved_count = sum(
        1 for item in approvals if item.action == RequirementApprovalAction.APPROVED
    )
    if _is_approved(change_request, approved_count, len(approvals)):
        versions = _apply_approved_items(change_request, actor=approver)
        change_request.status = RequirementChangeStatus.APPROVED
        change_request.completed_at = timezone.now()
        change_request.updated_by = approver
        change_request.save(
            update_fields=["status", "completed_at", "updated_at", "updated_by"]
        )
        notify_review_settled(change_request, actor=approver)
    return change_request, versions


def cancel_change_request(*, change_request, actor=None):
    """撤回审批：变更单置为已撤回，行解锁，内容原样保留。"""
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
    _clear_pending(change_request, actor=actor)
    notify_review_withdrawn(change_request, actor=actor)
    return change_request


# --- 统计 -----------------------------------------------------------------


def build_change_requirement_type_stats(change_request_id):
    """一张单里各需求类型的增删改计数。

    requirement_type 现在是变更项上的真实列，直接分组即可 —— 不再需要在
    proposed_snapshot/before_snapshot 的 JSON key 上做 Coalesce 取值。
    """
    rows = (
        RequirementChangeItem.objects.filter(change_request_id=change_request_id)
        .order_by()
        .values("requirement_type_id")
        .annotate(
            created_count=Count(
                "id", filter=Q(change_type=RequirementChangeType.CREATE)
            ),
            updated_count=Count(
                "id", filter=Q(change_type=RequirementChangeType.UPDATE)
            ),
            deleted_count=Count(
                "id", filter=Q(change_type=RequirementChangeType.DELETE)
            ),
        )
    )
    rows = list(rows)
    identities = {
        key: (name, logo_props)
        for key, name, logo_props in RequirementType.objects.filter(
            id__in=[row["requirement_type_id"] for row in rows]
        ).values_list("id", "name", "logo_props")
    }
    return [
        {
            "id": str(row["requirement_type_id"]),
            "name": identities.get(row["requirement_type_id"], ("", {}))[0],
            "logo_props": identities.get(row["requirement_type_id"], ("", {}))[1] or {},
            "created_count": row["created_count"],
            "updated_count": row["updated_count"],
            "deleted_count": row["deleted_count"],
        }
        for row in rows
    ]


# --- 回滚 -----------------------------------------------------------------

# 回滚的是内容，不是结构：父需求可能早就不在了，sort_order 也早被别的插入挤过位置。
# 把它们一起退回去只会制造 FK 悬挂和一次没人要求的重排。
ROLLBACK_STRUCTURE_COLUMNS = ("parent_id",)

# 回滚真正会写回去的列：内容列减去结构列。
#
# status 天然不在其中（它不是内容列）—— 回滚是「内容退回那一版」，不是「研发进度倒退」。
# 一条已实现的需求把文案改错了要退回去，它仍然是已实现的。
ROLLBACK_RESTORED_COLUMNS = tuple(
    column
    for column in CONTENT_BUILTIN_COLUMNS
    if column not in ROLLBACK_STRUCTURE_COLUMNS
)


def rollback_requirement_to_version(*, requirement, version_number, actor):
    """把某个已通过版本的内容拷回活行。

    **不是撤销审批**：版本链一条不动，approved_version 也不变。回滚只是一次写在活行上
    的普通编辑 —— 要不要真的退回某个旧版本，由随后的审批说了算。这样回滚就不需要自己的
    一套权限与审计，它复用编辑那一套。

    只有一个例外：**回到的正是已通过的那一版**（也就是「放弃改动」）。这时行上的内容与
    已批准的内容重新一致了，它就该回到 approved，而不是挂在「已改动·待提交」上 —— 挂着
    的话点提交会被 REQUIREMENT_NO_CHANGES 打回，是个走不出去的死胡同。

    恢复的 data 要按**当前**字段结构裁剪：字段结构立即生效且不走审批，vK 当年填的字段
    今天可能已经删了，原样写回去等于往行里塞一堆读不出来的孤儿键。
    """
    if requirement.pending_change_item_id:
        raise RequirementChangeError(
            "This requirement is under review and is read-only.",
            code="REQUIREMENT_IN_REVIEW",
            detail={
                "requirement_ids": [str(requirement.id)],
                "pending_change_request_id": str(
                    requirement.pending_change_item.change_request_id
                ),
            },
        )

    version = (
        RequirementVersion.objects.filter(
            target_id=requirement.id, version=version_number
        )
        .exclude(change_type=RequirementChangeType.DELETE)
        .first()
    )
    if version is None:
        raise RequirementChangeError(
            "This version does not exist for the requirement.",
            code="REQUIREMENT_VERSION_NOT_FOUND",
            detail={"version": version_number},
        )

    snapshot = version.snapshot or {}
    builtin = builtin_values_from_payload(snapshot)

    _, specs_by_type = field_specs_for_requirement_types(
        [requirement.requirement_type_id]
    )
    specs = specs_by_type.get(str(requirement.requirement_type_id), [])

    for column in ROLLBACK_RESTORED_COLUMNS:
        setattr(requirement, column, builtin[column])
    requirement.data = prune_requirement_data_to_fields(
        deepcopy(snapshot.get("data") or {}), specs
    )
    requirement.version += 1
    requirement.updated_by = actor
    # 回到已通过的那一版 = 放弃改动，内容与已批准的重新一致，行判回 approved。
    # 用版本号判定而不是比对内容：回滚就是照着那一版写的，比一遍只会被「字段被删过所以
    # 快照里多一个键」这类噪声干扰。
    if requirement.approved_version == version_number:
        requirement.approved_row_version = requirement.version
    requirement.save(
        update_fields=[
            *ROLLBACK_RESTORED_COLUMNS,
            "data",
            "version",
            "approved_row_version",
            "updated_at",
            "updated_by",
        ]
    )
    return requirement
