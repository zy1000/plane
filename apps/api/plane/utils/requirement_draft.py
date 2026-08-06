"""基线工作副本（草稿层）。

**工作副本只在「有已发布内容需要保护」时才存在。** 从未发布过的基线
（`current_version is None`）直接在正式表上编辑 —— 此时正式表里根本没有已批准
的内容会被覆盖，首次发布的 diff 以空快照为基线。一旦发过版本，「编辑」会克隆出
工作副本，之后所有改动都落在这里，正式表继续持有最后一次批准通过的内容。

草稿层只承载**需求行**（RequirementDraftRow）。字段定义不在这里 —— 它归需求
类型所有，草稿行通过 requirement_type 外键实时引用，所以「编辑」态看到的永远是
类型的最新字段。

snapshot 里存两份**冻结的基线**，都只用来算 diff 的「变更前」：
- `baseline`：meta 基线（负责人/审批规则/审批人）。meta 继续直接写正式的基线行，
  快照还用于撤回草稿时把 meta 恢复回上一版本。
- `fields`：已发布版本里冻结的字段树。没有它，diff 两侧都会实时取需求类型，类型的
  字段改动就永远显示不出来。

草稿行在服务端预分配 UUID，物化时直接复用为正式表主键，因此行 data 里以字段
ID 为 key 的结构不需要任何 remap。
"""

from copy import deepcopy
from uuid import uuid4

from plane.db.models import (
    Requirement,
    RequirementDraft,
    RequirementDraftRow,
    RequirementStatus,
)
from plane.utils.requirement import (
    BUILTIN_COLUMNS,
    BUILTIN_PARENT_COLUMN,
    SORT_ORDER_STEP,
    baseline_row_scope,
    build_library_import_creates,
    builtin_values_from_payload,
    builtin_values_from_row,
    get_published_field_tree,
    insert_requirement_row,
    remap_imported_parents,
    replace_requirement_approvers,
    save_requirement_row_batch,
    serialize_builtin_values,
)


ROW_BATCH_SIZE = 500


def baseline_meta_snapshot(baseline):
    """基线 meta 部分的快照形状，草稿快照与版本快照共用。

    标题与描述不在这里 —— 它们现在是需求行自己的字段，属于「需求条目」那一组变更。
    """
    return {
        "owner_id": str(baseline.owner_id),
        "approval_type": baseline.approval_type,
        "required_count": baseline.required_count,
        "approver_ids": [
            str(item)
            for item in baseline.approvers.order_by(
                "sort_order", "created_at", "id"
            ).values_list("approver_id", flat=True)
        ],
    }


def build_draft_snapshot(baseline):
    """构造草稿快照：冻结的 meta 基线 + 冻结的已发布字段基线。"""
    return {
        "baseline": baseline_meta_snapshot(baseline),
        "fields": get_published_field_tree(baseline),
    }


def get_draft(baseline):
    if baseline is None:
        return None
    return RequirementDraft.objects.filter(baseline=baseline).first()


def get_draft_baseline_field_tree(draft):
    """「编辑」那一刻已发布的字段树 —— diff 的「变更前」。

    名字里刻意带上 baseline：它是**冻结的基线**，不是草稿当前生效的字段（后者由
    草稿行引用到的需求类型实时解析）。
    """
    return deepcopy((draft.snapshot or {}).get("fields") or [])


def get_draft_baseline_field_specs(draft):
    return field_specs_from_tree(get_draft_baseline_field_tree(draft))


def get_draft_baseline_meta(draft):
    """「编辑」那一刻的 meta，也就是最后一次批准通过的 meta。"""
    return deepcopy((draft.snapshot or {}).get("baseline") or {})


def _draft_row_scope(draft):
    return {"draft": draft}


def _new_draft_row(draft):
    def factory(data, columns, sort_order, actor, requirement_type_id):
        return RequirementDraftRow(
            draft=draft,
            requirement_type_id=requirement_type_id,
            data=data,
            sort_order=sort_order,
            created_by=actor,
            **columns,
        )

    return factory


def start_editing(*, baseline, actor=None):
    """对应「编辑」按钮：从正式表克隆出工作副本，并把状态置为 draft。

    幂等 —— 已存在工作副本时直接返回，否则会丢掉尚未提交的改动。从未发布过的
    基线不需要工作副本（正式表里没有已批准内容要保护），直接返回 None。
    """
    if baseline.current_version is None:
        return None

    draft = get_draft(baseline)
    if draft is None:
        draft = RequirementDraft(
            baseline=baseline,
            workspace_id=baseline.workspace_id,
            product_id=baseline.product_id,
            project_id=baseline.project_id,
            base_version=baseline.current_version,
            snapshot=build_draft_snapshot(baseline),
            created_by=actor,
        )
        draft.save()

        pending = []
        row_queryset = Requirement.objects.filter(
            **baseline_row_scope(baseline)
        ).order_by("sort_order", "created_at", "id")
        for row in row_queryset.iterator(chunk_size=ROW_BATCH_SIZE):
            pending.append(
                RequirementDraftRow(
                    id=row.id,
                    draft=draft,
                    requirement_type_id=row.requirement_type_id,
                    data=deepcopy(row.data),
                    sort_order=row.sort_order,
                    version=row.version,
                    last_changed_version=row.last_changed_version,
                    created_by=actor,
                    # 草稿行复用正式行的 UUID，所以 parent_id 也能原样搬
                    **builtin_values_from_row(row),
                )
            )
            if len(pending) >= ROW_BATCH_SIZE:
                RequirementDraftRow.objects.bulk_create(pending)
                pending = []
        if pending:
            RequirementDraftRow.objects.bulk_create(pending)

    if baseline.status != RequirementStatus.DRAFT:
        baseline.status = RequirementStatus.DRAFT
        baseline.updated_by = actor
        baseline.save(update_fields=["status", "updated_at", "updated_by"])
    return draft


def drop_draft(draft):
    """硬删除工作副本。

    必须硬删除：草稿行的 UUID 会在下一次「编辑」时被再次克隆，软删除留下的行会
    撞上 id 的唯一约束。历史内容由 RequirementVersion 快照保存，草稿本身没有留档
    价值。
    """
    RequirementDraftRow.all_objects.filter(draft=draft).delete()
    draft.delete(soft=False)


def discard_draft(*, baseline, actor=None):
    """对应「撤回草稿」，两种语义靠 current_version 区分。

    - 从未发布过：清空这条基线管辖的全部需求行，基线本身回到初始草稿态
    - 曾发布过：丢弃工作副本、meta 恢复到基线、状态回 published。字段与需求行在
      审批通过前从未被改动，所以这部分不需要真的回滚数据
    """
    draft = get_draft(baseline)

    if baseline.current_version is None:
        if draft is not None:
            drop_draft(draft)
        Requirement.objects.filter(**baseline_row_scope(baseline)).delete()
        return "cleared"

    update_fields = ["status", "updated_at", "updated_by"]
    if draft is not None:
        update_fields.extend(_restore_baseline_meta(baseline, draft, actor=actor))
        drop_draft(draft)

    baseline.status = RequirementStatus.PUBLISHED
    baseline.updated_by = actor
    baseline.save(update_fields=list(dict.fromkeys(update_fields)))
    return "reverted"


def _restore_baseline_meta(baseline, draft, *, actor=None):
    """把 meta 恢复成「编辑」那一刻的值，返回需要写回的字段名。"""
    meta = get_draft_baseline_meta(draft)
    if not meta:
        return []

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
    return ["owner", "approval_type", "required_count"]


def insert_draft_row(
    *, draft, data, requirement_type_id, actor=None, before_id=None, after_id=None
):
    return insert_requirement_row(
        model=RequirementDraftRow,
        scope=_draft_row_scope(draft),
        new_row=_new_draft_row(draft),
        data=data,
        requirement_type_id=requirement_type_id,
        actor=actor,
        before_id=before_id,
        after_id=after_id,
    )


def save_draft_row_batch(*, draft, creates, updates, deletes, actor=None):
    """草稿版的批量保存，响应形状与正式表版完全相同。"""
    return save_requirement_row_batch(
        model=RequirementDraftRow,
        scope=_draft_row_scope(draft),
        new_row=_new_draft_row(draft),
        creates=creates,
        updates=updates,
        deletes=deletes,
        actor=actor,
        hard_delete=True,
    )


def import_draft_library_items(
    *, draft, library, item_ids, actor=None, before_id=None, after_id=None
):
    """草稿版的标准库导入，与正式表版共用同一份条目整理逻辑。"""
    creates, parent_by_client_id = build_library_import_creates(
        library=library,
        item_ids=item_ids,
        before_id=before_id,
        after_id=after_id,
    )
    created_rows, updated_rows, deleted_ids = save_draft_row_batch(
        draft=draft,
        creates=creates,
        updates=[],
        deletes=[],
        actor=actor,
    )
    remap_imported_parents(
        model=RequirementDraftRow,
        created_rows=created_rows,
        parent_by_client_id=parent_by_client_id,
    )
    return created_rows, updated_rows, deleted_ids


def _row_content(row):
    """判断「这一行相对上一版有没有变」时比较的内容。

    内置列走 serialize_builtin_values 而不是直接读属性：正式行给的是 date/UUID
    对象，比对两边必须落在同一种表示上，否则每次物化都会把没变的行判成变了。
    """
    return (serialize_builtin_values(row), row.data or {})


def materialize_draft(*, baseline, draft, version_number, actor=None):
    """审批通过时把工作副本的需求行写进正式表。

    字段不在这里处理 —— 它归需求类型所有，正式行只是通过 requirement_type 外键
    引用它。meta 也不在这里 —— 它一直直接写在基线行上。

    草稿是整份工作副本而不是增量，所以先清空正式表的旧行再重建。清空走
    all_objects 的真删除 —— 草稿行会复用同一批 UUID，任何残留（含历史软删除行）
    都会撞上 id 的唯一约束。历史内容由 RequirementVersion 快照保存。

    重建时顺带算出每行的 last_changed_version：内容与上一版相同的行沿用旧值，
    新增或被改过的行记为本次版本号 —— 这就是网格里「最后变更于 vN」那一列。
    """
    scope = baseline_row_scope(baseline)
    previous = {
        row.id: (_row_content(row), row.last_changed_version)
        for row in Requirement.objects.filter(**scope).only(
            "id", *BUILTIN_COLUMNS, "data", "last_changed_version"
        )
    }
    Requirement.all_objects.filter(**scope).delete()

    pending = []
    draft_rows = RequirementDraftRow.objects.filter(draft=draft).order_by(
        "sort_order", "created_at", "id"
    )
    for index, row in enumerate(draft_rows.iterator(chunk_size=ROW_BATCH_SIZE)):
        content = _row_content(row)
        previous_content, previous_version = previous.get(row.id, (None, None))
        pending.append(
            Requirement(
                id=row.id,
                product_id=baseline.product_id,
                project_id=baseline.project_id,
                workspace_id=baseline.workspace_id,
                requirement_type_id=row.requirement_type_id,
                # 草稿行与正式行共用 UUID，parent_id 直接搬过来仍然指向对的那一行
                **builtin_values_from_row(row),
                data=deepcopy(row.data),
                sort_order=(index + 1) * SORT_ORDER_STEP,
                version=row.version,
                last_changed_version=(
                    previous_version if content == previous_content else version_number
                ),
                created_by=row.created_by or actor,
                updated_by=actor,
            )
        )
        if len(pending) >= ROW_BATCH_SIZE:
            Requirement.objects.bulk_create(pending)
            pending = []
    if pending:
        Requirement.objects.bulk_create(pending)

    baseline.updated_by = actor
    baseline.save(update_fields=["updated_at", "updated_by"])
    return baseline


def stamp_initial_versions(*, baseline, version_number):
    """首次发布没有工作副本，正式行直接就是提案，整批记为第一个版本。"""
    Requirement.objects.filter(**baseline_row_scope(baseline)).update(
        last_changed_version=version_number
    )


def load_snapshot_into_draft(*, draft, snapshot, actor=None):
    """用给定快照的需求行整体覆盖工作副本（回滚到历史版本时使用）。

    meta 基线与字段基线都保持不动 —— 它们记录的是「编辑」那一刻已批准的内容，
    回滚不该改写它们，否则 diff 的「变更前」就不再是已发布的内容。

    回滚只搬需求行；行上的 requirement_type_id 从快照里取回，字段结构随之自动恢复。
    快照里内置列与 data 是平级的，直接取用。
    """
    RequirementDraftRow.all_objects.filter(draft=draft).delete()
    rows = [
        row
        for row in ((snapshot or {}).get("requirements") or [])
        # 快照里没有需求类型就无法确定字段来源，只能跳过
        if row.get("requirement_type_id")
    ]
    # 父项只在快照内部有意义：指向被跳过（或本就不在快照里）的行时置空，
    # 否则 bulk_create 会撞上外键
    restorable_ids = {str(row.get("id")) for row in rows if row.get("id")}
    pending = []
    for index, row in enumerate(rows):
        builtin = builtin_values_from_payload(row)
        if str(builtin[BUILTIN_PARENT_COLUMN]) not in restorable_ids:
            builtin[BUILTIN_PARENT_COLUMN] = None
        pending.append(
            RequirementDraftRow(
                id=row.get("id") or uuid4(),
                draft=draft,
                requirement_type_id=row["requirement_type_id"],
                data=deepcopy(row.get("data") or {}),
                sort_order=(index + 1) * SORT_ORDER_STEP,
                last_changed_version=row.get("last_changed_version"),
                created_by=actor,
                **builtin,
            )
        )
        if len(pending) >= ROW_BATCH_SIZE:
            RequirementDraftRow.objects.bulk_create(pending)
            pending = []
    if pending:
        RequirementDraftRow.objects.bulk_create(pending)
    return draft
