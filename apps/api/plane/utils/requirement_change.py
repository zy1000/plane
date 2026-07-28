"""需求变更审批与版本管理。

一条链路走首次发布与后续变更两种场景：
draft --提交--> in_review --通过--> published（物化 + 新版本）
                          --驳回/撤回--> draft（保留工作副本）

两种场景的差别只在 diff 的两侧从哪里取：

- 首次发布（`current_version is None`，没有工作副本）：基线是空快照，正式表上的
  内容就是提案，所有变更项都是「新增」，通过时无需物化。
- 后续变更（有工作副本）：基线是正式表 + 工作副本里冻结的 meta 基线，提案是工作
  副本的字段与明细 + 正式行上的当前 meta，通过时把工作副本物化进正式表。

变更项按三类分组落库（基本信息 / 字段定义 / 明细数据）。明细数据组在千行量级下
可能有上千条变更项，所以变更单详情只返回汇总计数与前两组，明细组由独立的分页
端点按需拉取。
"""

from copy import deepcopy

from django.db.models import Max
from django.utils import timezone

from plane.db.models import (
    RequirementApprovalAction,
    RequirementApprovalType,
    RequirementChangeApproval,
    RequirementChangeItem,
    RequirementChangeRequest,
    RequirementChangeRequestKind,
    RequirementChangeStatus,
    RequirementChangeTargetKind,
    RequirementChangeType,
    RequirementDetail,
    RequirementDraftDetail,
    RequirementFieldType,
    RequirementStatus,
    RequirementVersion,
)
from plane.utils.requirement import (
    field_specs_from_tree,
    replace_requirement_approvers,
    serialize_requirement_field_tree,
)
from plane.utils.requirement_draft import (
    drop_draft,
    get_draft,
    get_draft_baseline_meta,
    get_draft_field_tree,
    load_snapshot_into_draft,
    materialize_draft,
    requirement_meta_snapshot,
    start_editing,
)


ITEM_BATCH_SIZE = 500
DETAIL_CHUNK_SIZE = 500

META_KEYS = (
    "title",
    "description_html",
    "owner_id",
    "approval_type",
    "required_count",
    "approver_ids",
)

FIELD_COMPARE_KEYS = (
    "name",
    "field_type",
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


def _detail_row(detail):
    return {
        "id": str(detail.id),
        "data": deepcopy(detail.data),
        "sort_order": detail.sort_order,
    }


def build_snapshot(requirement):
    """从正式表构造整份快照，版本记录与 diff 基准共用。

    明细分块读，避免千行一次性驻留。
    """
    details = []
    queryset = RequirementDetail.objects.filter(requirement=requirement).order_by(
        "sort_order", "created_at", "id"
    )
    for detail in queryset.iterator(chunk_size=DETAIL_CHUNK_SIZE):
        details.append(_detail_row(detail))

    return {
        "requirement": requirement_meta_snapshot(requirement),
        "fields": serialize_requirement_field_tree(requirement),
        "details": details,
    }


def build_draft_full_snapshot(*, requirement, draft):
    """把工作副本读成与 build_snapshot 同构的整份快照。

    meta 取正式行上的当前值 —— meta 编辑不经过草稿层。
    """
    details = []
    queryset = RequirementDraftDetail.objects.filter(draft=draft).order_by(
        "sort_order", "created_at", "id"
    )
    for detail in queryset.iterator(chunk_size=DETAIL_CHUNK_SIZE):
        details.append(_detail_row(detail))

    return {
        "requirement": requirement_meta_snapshot(requirement),
        "fields": get_draft_field_tree(draft),
        "details": details,
    }


def build_change_snapshots(*, requirement, draft):
    """算出 diff 的两侧 (before, after)。"""
    if draft is None:
        return {}, build_snapshot(requirement)

    before = build_snapshot(requirement)
    before["requirement"] = get_draft_baseline_meta(draft)
    return before, build_draft_full_snapshot(requirement=requirement, draft=draft)


def _flatten_fields(tree):
    """摊平字段树，并给子字段带上父字段名，供 diff 展示定位。"""
    flat = {}
    sibling_positions = {}
    for spec in field_specs_from_tree(tree):
        position = sibling_positions.get(spec.parent_field_id, 0) + 1
        sibling_positions[spec.parent_field_id] = position
        flat[spec.id] = {
            "id": spec.id,
            "parent_field_id": spec.parent_field_id,
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


def _changed_root_field_ids(before_data, after_data, fields_by_id):
    """行内字段级 + 子表单行级比较，得出这一行里哪些根字段发生了变化。"""
    changed = []
    root_ids = {
        field_id
        for field_id, payload in fields_by_id.items()
        if payload["parent_field_id"] is None
    }
    for field_id in root_ids.union(set(before_data) | set(after_data)):
        field = fields_by_id.get(field_id)
        field_type = field["field_type"] if field else None
        if _root_field_changed(
            before_data.get(field_id), after_data.get(field_id), field_type
        ):
            changed.append(field_id)
    return changed


def diff_snapshots(before, after):
    """产出三组变更项：基本信息 / 字段定义 / 明细数据。

    返回 (items, stats)。items 是未落库的 dict 列表，stats 带三个计数与本次涉及
    的字段 ID 集合（供前端「仅显示变化列」用）。
    """
    items = []
    changed_field_ids = set()

    # 没有基线 meta（首次发布）时不做 meta diff —— 「标题：无 → X」是噪音
    before_meta = before.get("requirement")
    after_meta = after.get("requirement") or {}
    for index, key in enumerate(META_KEYS if before_meta is not None else ()):
        if key not in after_meta and key not in before_meta:
            continue
        if before_meta.get(key) == after_meta.get(key):
            continue
        items.append(
            {
                "target_kind": RequirementChangeTargetKind.REQUIREMENT,
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

    before_details = {row["id"]: row for row in before.get("details") or []}
    after_details = {row["id"]: row for row in after.get("details") or []}
    for row in after.get("details") or []:
        previous = before_details.get(row["id"])
        if previous is None:
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.DETAIL_DATA,
                    "change_type": RequirementChangeType.CREATE,
                    "target_id": row["id"],
                    "before_snapshot": None,
                    "proposed_snapshot": row,
                    "proposed_sort_order": row.get("sort_order"),
                }
            )
            continue
        changed_roots = _changed_root_field_ids(
            previous.get("data") or {}, row.get("data") or {}, after_fields
        )
        if changed_roots:
            changed_field_ids.update(changed_roots)
            items.append(
                {
                    "target_kind": RequirementChangeTargetKind.DETAIL_DATA,
                    "change_type": RequirementChangeType.UPDATE,
                    "target_id": row["id"],
                    "before_snapshot": previous,
                    "proposed_snapshot": row,
                    "proposed_sort_order": row.get("sort_order"),
                }
            )
    for row in before.get("details") or []:
        if row["id"] in after_details:
            continue
        items.append(
            {
                "target_kind": RequirementChangeTargetKind.DETAIL_DATA,
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


def _next_sequence_id(requirement):
    latest = RequirementChangeRequest.all_objects.filter(
        requirement=requirement
    ).aggregate(latest=Max("sequence_id"))["latest"]
    return (latest or 0) + 1


def _next_version_number(requirement):
    latest = RequirementVersion.objects.filter(
        requirement=requirement,
        target_kind=RequirementChangeTargetKind.REQUIREMENT,
    ).aggregate(latest=Max("version"))["latest"]
    return (latest or 0) + 1


def get_pending_change_request(requirement):
    return (
        RequirementChangeRequest.objects.filter(
            requirement=requirement,
            status=RequirementChangeStatus.PENDING,
        )
        .order_by("-created_at")
        .first()
    )


def _get_effective_approval_config(*, requirement, draft):
    """返回本次变更单必须遵循的已生效审批配置。

    首次发布还没有已生效版本，只能使用当前配置。后续变更的审批设置本身也是提案的
    一部分，因此必须从开始编辑时冻结的基线读取；否则提交人可以先把审批人改成自己，
    再用尚未生效的配置审批同一份变更。
    """
    if requirement.current_version is None:
        approval_meta = requirement_meta_snapshot(requirement)
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


def submit_change_request(*, requirement, reason="", actor=None):
    """从 draft 提交审批。首次发布与后续变更走完全相同的这条链路。"""
    if requirement.is_template:
        raise RequirementChangeError(
            "Workspace templates do not go through the approval flow.",
            code="REQUIREMENT_TEMPLATE_NOT_APPROVABLE",
        )
    if requirement.status != RequirementStatus.DRAFT:
        raise RequirementChangeError(
            "Only a draft requirement can be submitted for approval.",
            code="REQUIREMENT_NOT_DRAFT",
        )

    draft = get_draft(requirement)
    approval_type, required_count, approver_ids = _get_effective_approval_config(
        requirement=requirement,
        draft=draft,
    )
    before, after = build_change_snapshots(
        requirement=requirement,
        draft=draft,
    )
    items, stats = diff_snapshots(before, after)
    if not items:
        raise RequirementChangeError(
            "There are no changes to submit.",
            code="REQUIREMENT_NO_CHANGES",
        )

    change_request = RequirementChangeRequest(
        requirement=requirement,
        workspace_id=requirement.workspace_id,
        product_id=requirement.product_id,
        project_id=requirement.project_id,
        target_kind=RequirementChangeTargetKind.REQUIREMENT,
        request_kind=(
            RequirementChangeRequestKind.INITIAL_PUBLISH
            if requirement.current_version is None
            else RequirementChangeRequestKind.CHANGE
        ),
        sequence_id=_next_sequence_id(requirement),
        base_version=requirement.current_version,
        approval_type=approval_type,
        required_count=required_count,
        status=RequirementChangeStatus.PENDING,
        reason=reason or "",
        created_by=actor,
        **stats,
    )
    change_request.save()

    pending = []
    for item in items:
        pending.append(
            RequirementChangeItem(
                change_request=change_request,
                base_version=requirement.current_version,
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

    requirement.status = RequirementStatus.IN_REVIEW
    requirement.updated_by = actor
    requirement.save(update_fields=["status", "updated_at", "updated_by"])
    return change_request


def _is_approved(change_request, approved_count, total_count):
    if change_request.approval_type == RequirementApprovalType.ALL:
        return approved_count >= total_count
    if change_request.approval_type == RequirementApprovalType.N_OF_M:
        return approved_count >= (change_request.required_count or total_count)
    return approved_count >= 1


def _publish(*, change_request, requirement, actor=None):
    """把提案落成已发布内容：物化工作副本（如果有）+ 写一个新版本。"""
    draft = get_draft(requirement)
    if draft is not None:
        materialize_draft(requirement=requirement, draft=draft, actor=actor)
    version_number = _next_version_number(requirement)
    approved_by = [
        str(approver_id)
        for approver_id in change_request.approvals.filter(
            action=RequirementApprovalAction.APPROVED
        ).values_list("approver_id", flat=True)
    ]
    version = RequirementVersion(
        requirement=requirement,
        workspace_id=requirement.workspace_id,
        product_id=requirement.product_id,
        project_id=requirement.project_id,
        target_kind=RequirementChangeTargetKind.REQUIREMENT,
        target_id=requirement.id,
        version=version_number,
        change_type=(
            RequirementChangeType.CREATE
            if change_request.base_version is None
            else RequirementChangeType.UPDATE
        ),
        snapshot=build_snapshot(requirement),
        change_request=change_request,
        approved_by=approved_by,
        created_by=actor,
    )
    version.save()

    if draft is not None:
        drop_draft(draft)
    requirement.status = RequirementStatus.PUBLISHED
    requirement.current_version = version_number
    requirement.updated_by = actor
    requirement.save(
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

    requirement = change_request.requirement
    version = None
    if action == RequirementApprovalAction.REJECTED:
        change_request.status = RequirementChangeStatus.REJECTED
        change_request.completed_at = timezone.now()
        change_request.updated_by = approver
        change_request.save(
            update_fields=["status", "completed_at", "updated_at", "updated_by"]
        )
        requirement.status = RequirementStatus.DRAFT
        requirement.updated_by = approver
        requirement.save(update_fields=["status", "updated_at", "updated_by"])
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
            requirement=requirement,
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
    """撤回审批：变更单置为已撤回，需求回到 draft 并保留工作副本。"""
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

    requirement = change_request.requirement
    requirement.status = RequirementStatus.DRAFT
    requirement.updated_by = actor
    requirement.save(update_fields=["status", "updated_at", "updated_by"])
    return change_request


def rollback_to_version(*, requirement, version, actor=None):
    """把历史快照灌入工作副本，字段与明细不直接改正式表 —— 回滚也要再走一次审批。

    meta 与常规编辑一样直接写正式行（diff 的「变更前」来自工作副本里冻结的基线，
    所以回滚出来的 meta 变化仍然会出现在变更单里）。
    """
    if requirement.status == RequirementStatus.IN_REVIEW:
        raise RequirementChangeError(
            "The requirement is under review and cannot be rolled back right now.",
            code="REQUIREMENT_IN_REVIEW",
        )
    draft = start_editing(requirement=requirement, actor=actor)
    if draft is None:
        raise RequirementChangeError(
            "This requirement has never been published, so there is nothing to roll back to.",
            code="REQUIREMENT_NEVER_PUBLISHED",
        )
    load_snapshot_into_draft(draft=draft, snapshot=version.snapshot, actor=actor)
    _apply_meta(
        requirement=requirement,
        meta=(version.snapshot or {}).get("requirement") or {},
        actor=actor,
    )
    return draft


def _apply_meta(*, requirement, meta, actor=None):
    if not meta:
        return requirement

    requirement.title = meta.get("title", requirement.title)
    requirement.description_html = meta.get(
        "description_html", requirement.description_html
    )
    if meta.get("owner_id"):
        requirement.owner_id = meta["owner_id"]
    requirement.approval_type = meta.get("approval_type", requirement.approval_type)
    requirement.required_count = meta.get("required_count", requirement.required_count)
    if "approver_ids" in meta:
        replace_requirement_approvers(
            requirement=requirement,
            approver_ids=meta["approver_ids"],
            actor=actor,
        )
    requirement.updated_by = actor
    requirement.save(
        update_fields=[
            "title",
            "description_html",
            "owner",
            "approval_type",
            "required_count",
            "updated_at",
            "updated_by",
        ]
    )
    return requirement
