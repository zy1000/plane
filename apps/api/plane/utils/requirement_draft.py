"""需求工作副本（草稿层）。

**工作副本只在「有已发布内容需要保护」时才存在。** 从未发布过的需求
（`current_version is None`）直接在正式表上编辑 —— 此时正式表里根本没有已批准
的内容会被覆盖，首次发布的 diff 以空快照为基线。一旦发过版本，「编辑」会克隆出
工作副本，之后所有改动都落在这里，正式表继续持有最后一次批准通过的内容。

字段定义存在 RequirementDraft.snapshot（字段量级小，整体读写最省事），明细行拆到
RequirementDraftDetail 表，让千行量级下的分页、筛选、行级乐观锁直接复用正式明细
表那一套实现。snapshot 里的 `requirement` 则是**冻结的 meta 基线** —— meta
（标题/描述/负责人/审批规则）继续直接写正式行，基线只用来算 diff 的「变更前」，
以及撤回草稿时把 meta 恢复回上一版本。

草稿里的字段与明细都在服务端预分配 UUID，物化时直接复用为正式表主键，因此
明细 data 里以字段 ID 为 key 的结构不需要任何 remap。
"""

from copy import deepcopy
from uuid import uuid4

from plane.db.models import (
    RequirementDetail,
    RequirementDraft,
    RequirementDraftDetail,
    RequirementField,
    RequirementFieldType,
    RequirementStatus,
)
from plane.utils.requirement import (
    SORT_ORDER_STEP,
    RequirementDataLossError,
    apply_field_change_cleanup,
    field_specs_from_tree,
    get_requirement_select_mode,
    insert_detail_row,
    replace_requirement_approvers,
    save_detail_row_batch,
    select_config_removes_values,
    serialize_requirement_field_tree,
)


DETAIL_BATCH_SIZE = 500


def requirement_meta_snapshot(requirement):
    """需求 meta 部分的快照形状，草稿快照与版本快照共用。"""
    return {
        "title": requirement.title,
        "description_html": requirement.description_html,
        "owner_id": str(requirement.owner_id),
        "approval_type": requirement.approval_type,
        "required_count": requirement.required_count,
        "approver_ids": [
            str(item)
            for item in requirement.approvers.order_by(
                "sort_order", "created_at", "id"
            ).values_list("approver_id", flat=True)
        ],
    }


def build_draft_snapshot(requirement):
    """从正式表构造草稿快照：字段定义 + 冻结的 meta 基线。"""
    return {
        "requirement": requirement_meta_snapshot(requirement),
        "fields": serialize_requirement_field_tree(requirement),
    }


def get_draft(requirement):
    return RequirementDraft.objects.filter(requirement=requirement).first()


def get_draft_field_specs(draft):
    return field_specs_from_tree((draft.snapshot or {}).get("fields") or [])


def get_draft_field_tree(draft):
    return deepcopy((draft.snapshot or {}).get("fields") or [])


def get_draft_baseline_meta(draft):
    """「编辑」那一刻的 meta，也就是最后一次批准通过的 meta。"""
    return deepcopy((draft.snapshot or {}).get("requirement") or {})


def _draft_detail_scope(draft):
    return {"draft": draft}


def _new_draft_detail(draft):
    def factory(data, sort_order, actor):
        return RequirementDraftDetail(
            draft=draft,
            data=data,
            sort_order=sort_order,
            created_by=actor,
        )

    return factory


def start_editing(*, requirement, actor=None):
    """对应「编辑」按钮：从正式表克隆出工作副本，并把状态置为 draft。

    幂等 —— 已存在工作副本时直接返回，否则会丢掉尚未提交的改动。从未发布过的
    需求不需要工作副本（正式表里没有已批准内容要保护），直接返回 None。
    """
    if requirement.current_version is None:
        return None

    draft = get_draft(requirement)
    if draft is None:
        draft = RequirementDraft(
            requirement=requirement,
            workspace_id=requirement.workspace_id,
            product_id=requirement.product_id,
            project_id=requirement.project_id,
            base_version=requirement.current_version,
            snapshot=build_draft_snapshot(requirement),
            created_by=actor,
        )
        draft.save()

        pending = []
        detail_queryset = RequirementDetail.objects.filter(
            requirement=requirement
        ).order_by("sort_order", "created_at", "id")
        for detail in detail_queryset.iterator(chunk_size=DETAIL_BATCH_SIZE):
            pending.append(
                RequirementDraftDetail(
                    id=detail.id,
                    draft=draft,
                    data=deepcopy(detail.data),
                    sort_order=detail.sort_order,
                    version=detail.version,
                    created_by=actor,
                )
            )
            if len(pending) >= DETAIL_BATCH_SIZE:
                RequirementDraftDetail.objects.bulk_create(pending)
                pending = []
        if pending:
            RequirementDraftDetail.objects.bulk_create(pending)

    if requirement.status != RequirementStatus.DRAFT:
        requirement.status = RequirementStatus.DRAFT
        requirement.updated_by = actor
        requirement.save(update_fields=["status", "updated_at", "updated_by"])
    return draft


def drop_draft(draft):
    """硬删除工作副本。

    必须硬删除：草稿行的 UUID 会在下一次「编辑」时被再次克隆，软删除留下的行会
    撞上 id 的唯一约束。历史内容由 RequirementVersion 快照保存，草稿本身没有留档
    价值。
    """
    RequirementDraftDetail.all_objects.filter(draft=draft).delete()
    draft.delete(soft=False)


def discard_draft(*, requirement, actor=None):
    """对应「撤回草稿」，两种语义靠 current_version 区分。

    - 从未发布过：删除整个需求（沿用现有软删除）
    - 曾发布过：丢弃工作副本、meta 恢复到基线、状态回 published。字段与明细在
      审批通过前从未被改动，所以这部分不需要真的回滚数据
    """
    draft = get_draft(requirement)

    if requirement.current_version is None:
        if draft is not None:
            drop_draft(draft)
        requirement.delete()
        return "deleted"

    update_fields = ["status", "updated_at", "updated_by"]
    if draft is not None:
        update_fields.extend(_restore_baseline_meta(requirement, draft, actor=actor))
        drop_draft(draft)

    requirement.status = RequirementStatus.PUBLISHED
    requirement.updated_by = actor
    requirement.save(update_fields=list(dict.fromkeys(update_fields)))
    return "reverted"


def _restore_baseline_meta(requirement, draft, *, actor=None):
    """把 meta 恢复成「编辑」那一刻的值，返回需要写回的字段名。"""
    baseline = get_draft_baseline_meta(draft)
    if not baseline:
        return []

    requirement.title = baseline.get("title", requirement.title)
    requirement.description_html = baseline.get(
        "description_html", requirement.description_html
    )
    if baseline.get("owner_id"):
        requirement.owner_id = baseline["owner_id"]
    requirement.approval_type = baseline.get(
        "approval_type", requirement.approval_type
    )
    requirement.required_count = baseline.get(
        "required_count", requirement.required_count
    )
    if "approver_ids" in baseline:
        replace_requirement_approvers(
            requirement=requirement,
            approver_ids=baseline["approver_ids"],
            actor=actor,
        )
    return ["title", "description_html", "owner", "approval_type", "required_count"]


def save_draft_fields(*, draft, field_payloads, actor=None, confirm_data_loss=False):
    """草稿版的字段定义保存，配置 PUT 在 draft 态走这一支。

    新字段在这里分配 UUID 并通过 created_field_ids 回给前端（与正式表版的响应
    契约一致）。字段被删除 / 换类型 / 选项收缩造成的明细失效值，复用正式表那套
    清理逻辑，只是作用在草稿明细表上。
    """
    existing_specs = {spec.id: spec for spec in get_draft_field_specs(draft)}
    submitted_ids = set()
    created_field_ids = {}
    data_loss_specs = []
    reset_select_specs = {}

    def build_node(payload, *, parent_id=None, index=0):
        field_id = payload.get("id")
        if field_id:
            field_id = str(field_id)
            spec = existing_specs.get(field_id)
            if spec is None:
                raise ValueError(
                    "A submitted field does not belong to this requirement."
                )
            if spec.parent_field_id != parent_id:
                raise ValueError(
                    "Existing fields cannot be moved between field levels."
                )
            if spec.field_type != payload["field_type"]:
                data_loss_specs.append(spec)
            elif select_config_removes_values(spec, payload):
                reset_select_specs[spec.id] = (
                    spec,
                    [] if get_requirement_select_mode(payload) == "multiple" else None,
                )
            submitted_ids.add(field_id)
        else:
            field_id = str(uuid4())
            client_id = payload.get("client_id")
            if client_id:
                created_field_ids[str(client_id)] = field_id

        return {
            "id": field_id,
            "name": payload["name"],
            "field_type": payload["field_type"],
            "is_required": payload["is_required"],
            "is_active": payload["is_active"],
            "sort_order": (index + 1) * SORT_ORDER_STEP,
            "config": deepcopy(payload.get("config") or {}),
            "default_value": (
                None
                if payload["field_type"] == RequirementFieldType.FORM
                else deepcopy(payload.get("default_value"))
            ),
            "children": [
                build_node(child_payload, parent_id=field_id, index=child_index)
                for child_index, child_payload in enumerate(
                    payload.get("children") or []
                )
            ],
        }

    tree = [
        build_node(root_payload, index=root_index)
        for root_index, root_payload in enumerate(field_payloads)
    ]

    deleted_specs = [
        spec
        for field_id, spec in existing_specs.items()
        if field_id not in submitted_ids
    ]
    cleanup_specs = list(
        {spec.id: spec for spec in [*deleted_specs, *data_loss_specs]}.values()
    )

    changed_details = apply_field_change_cleanup(
        details=RequirementDraftDetail.objects.select_for_update().filter(draft=draft),
        removed_fields=cleanup_specs,
        reset_select_fields=list(reset_select_specs.values()),
        actor=actor,
    )
    if changed_details and not confirm_data_loss:
        raise RequirementDataLossError(len(changed_details))
    if changed_details:
        RequirementDraftDetail.objects.bulk_update(
            changed_details, ["data", "version", "updated_at", "updated_by"]
        )

    snapshot = deepcopy(draft.snapshot or {})
    snapshot["fields"] = tree
    draft.snapshot = snapshot
    draft.updated_by = actor
    draft.save(update_fields=["snapshot", "updated_at", "updated_by"])
    return created_field_ids


def insert_draft_detail(*, draft, data, actor=None, before_id=None, after_id=None):
    return insert_detail_row(
        model=RequirementDraftDetail,
        scope=_draft_detail_scope(draft),
        new_row=_new_draft_detail(draft),
        data=data,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def save_draft_detail_batch(*, draft, creates, updates, deletes, actor=None):
    """草稿版的批量保存，响应形状与正式表版完全相同。"""
    return save_detail_row_batch(
        model=RequirementDraftDetail,
        scope=_draft_detail_scope(draft),
        new_row=_new_draft_detail(draft),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
        hard_delete=True,
    )


def _materialize_fields(*, requirement, tree, parent=None, actor=None):
    """把草稿字段树写回正式表，复用草稿里的 UUID 作为主键。"""
    rows = [
        (
            RequirementField(
                id=node["id"],
                requirement=requirement,
                parent_field=parent,
                name=node["name"],
                field_type=node["field_type"],
                is_required=node["is_required"],
                is_active=node["is_active"],
                sort_order=node["sort_order"],
                config=deepcopy(node.get("config") or {}),
                default_value=(
                    None
                    if node["field_type"] == RequirementFieldType.FORM
                    else deepcopy(node.get("default_value"))
                ),
                created_by=actor,
            ),
            node.get("children") or [],
        )
        for node in tree
    ]
    if not rows:
        return
    RequirementField.objects.bulk_create([field for field, _ in rows])
    for field, children in rows:
        if children:
            _materialize_fields(
                requirement=requirement,
                tree=children,
                parent=field,
                actor=actor,
            )


def materialize_draft(*, requirement, draft, actor=None):
    """审批通过时把工作副本的字段与明细写进正式表。

    meta 不在这里处理 —— 它一直直接写在正式行上。

    草稿是整份工作副本而不是增量，所以先清空正式表的旧字段与旧明细再重建。清空
    走 all_objects 的真删除 —— 草稿行会复用同一批 UUID，任何残留（含历史软删除
    行）都会撞上 id 的唯一约束。历史内容由 RequirementVersion 快照保存。
    """
    RequirementDetail.all_objects.filter(requirement=requirement).delete()
    RequirementField.all_objects.filter(requirement=requirement).delete()

    _materialize_fields(
        requirement=requirement,
        tree=get_draft_field_tree(draft),
        actor=actor,
    )

    pending = []
    draft_details = RequirementDraftDetail.objects.filter(draft=draft).order_by(
        "sort_order", "created_at", "id"
    )
    for index, detail in enumerate(
        draft_details.iterator(chunk_size=DETAIL_BATCH_SIZE)
    ):
        pending.append(
            RequirementDetail(
                id=detail.id,
                requirement=requirement,
                data=deepcopy(detail.data),
                sort_order=(index + 1) * SORT_ORDER_STEP,
                version=detail.version,
                created_by=detail.created_by or actor,
                updated_by=actor,
            )
        )
        if len(pending) >= DETAIL_BATCH_SIZE:
            RequirementDetail.objects.bulk_create(pending)
            pending = []
    if pending:
        RequirementDetail.objects.bulk_create(pending)

    requirement.updated_by = actor
    requirement.save(update_fields=["updated_at", "updated_by"])
    return requirement


def load_snapshot_into_draft(*, draft, snapshot, actor=None):
    """用给定快照的字段与明细整体覆盖工作副本（回滚到历史版本时使用）。

    meta 基线保持不动 —— 它记录的是「编辑」那一刻已批准的 meta，回滚不该改写它，
    否则 diff 的「变更前」就不再是已发布的内容。
    """
    updated = deepcopy(draft.snapshot or {})
    updated["fields"] = deepcopy(snapshot.get("fields") or [])
    draft.snapshot = updated
    draft.updated_by = actor
    draft.save(update_fields=["snapshot", "updated_at", "updated_by"])

    RequirementDraftDetail.all_objects.filter(draft=draft).delete()
    pending = []
    for index, row in enumerate(snapshot.get("details") or []):
        pending.append(
            RequirementDraftDetail(
                id=row.get("id") or uuid4(),
                draft=draft,
                data=deepcopy(row.get("data") or {}),
                sort_order=(index + 1) * SORT_ORDER_STEP,
                created_by=actor,
            )
        )
        if len(pending) >= DETAIL_BATCH_SIZE:
            RequirementDraftDetail.objects.bulk_create(pending)
            pending = []
    if pending:
        RequirementDraftDetail.objects.bulk_create(pending)
    return draft
