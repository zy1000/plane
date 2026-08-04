"""需求工作副本（草稿层）。

**工作副本只在「有已发布内容需要保护」时才存在。** 从未发布过的需求
（`current_version is None`）直接在正式表上编辑 —— 此时正式表里根本没有已批准
的内容会被覆盖，首次发布的 diff 以空快照为基线。一旦发过版本，「编辑」会克隆出
工作副本，之后所有改动都落在这里，正式表继续持有最后一次批准通过的内容。

草稿层只承载**明细行**（RequirementDraftDetail）。字段定义不在这里 —— 它归工作区
模板所有，草稿行通过 template 外键实时引用，所以「编辑」态看到的永远是模板的最新
字段。

snapshot 里存两份**冻结的基线**，都只用来算 diff 的「变更前」：
- `requirement`：meta 基线（标题/描述/负责人/审批规则）。meta 继续直接写正式行，
  基线还用于撤回草稿时把 meta 恢复回上一版本。
- `fields`：已发布版本里冻结的字段树。没有它，diff 两侧都会实时取模板，模板的字段
  改动就永远显示不出来。

草稿明细在服务端预分配 UUID，物化时直接复用为正式表主键，因此明细 data 里以字段
ID 为 key 的结构不需要任何 remap。
"""

from copy import deepcopy
from uuid import uuid4

from plane.db.models import (
    RequirementDetail,
    RequirementDraft,
    RequirementDraftDetail,
    RequirementStatus,
)
from plane.utils.requirement import (
    SORT_ORDER_STEP,
    build_library_import_creates,
    field_specs_for_templates,
    field_specs_from_tree,
    get_published_field_tree,
    get_referenced_template_ids,
    insert_detail_row,
    replace_requirement_approvers,
    save_detail_row_batch,
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
    """构造草稿快照：冻结的 meta 基线 + 冻结的已发布字段基线。"""
    return {
        "requirement": requirement_meta_snapshot(requirement),
        "fields": get_published_field_tree(requirement),
    }


def get_draft(requirement):
    return RequirementDraft.objects.filter(requirement=requirement).first()


def get_draft_baseline_field_tree(draft):
    """「编辑」那一刻已发布的字段树 —— diff 的「变更前」。

    刻意与 get_draft_field_specs 那个旧名字区分开：语义已经从「可编辑的字段树」
    翻转成「冻结的基线」，同名会让调用方误以为它还是当前生效的字段。
    """
    return deepcopy((draft.snapshot or {}).get("fields") or [])


def get_draft_baseline_field_specs(draft):
    return field_specs_from_tree(get_draft_baseline_field_tree(draft))


def get_draft_field_specs(draft):
    """草稿当前生效的字段：由草稿明细引用到的模板实时解析。"""
    template_ids = get_referenced_template_ids(
        model=RequirementDraftDetail, scope={"draft": draft}
    )
    return field_specs_for_templates(template_ids)[0]


def get_draft_baseline_meta(draft):
    """「编辑」那一刻的 meta，也就是最后一次批准通过的 meta。"""
    return deepcopy((draft.snapshot or {}).get("requirement") or {})


def _draft_detail_scope(draft):
    return {"draft": draft}


def _new_draft_detail(draft):
    def factory(data, sort_order, actor, template_id):
        return RequirementDraftDetail(
            draft=draft,
            template_id=template_id,
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
                    template_id=detail.template_id,
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


def insert_draft_detail(
    *, draft, data, template_id, actor=None, before_id=None, after_id=None
):
    return insert_detail_row(
        model=RequirementDraftDetail,
        scope=_draft_detail_scope(draft),
        new_row=_new_draft_detail(draft),
        data=data,
        template_id=template_id,
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


def import_draft_library_items(
    *, draft, library, item_ids, actor=None, before_id=None, after_id=None
):
    """草稿版的标准库导入，与正式表版共用同一份条目整理逻辑。"""
    return save_draft_detail_batch(
        draft=draft,
        creates=build_library_import_creates(
            library=library,
            item_ids=item_ids,
            before_id=before_id,
            after_id=after_id,
        ),
        updates=[],
        deletes=[],
        actor=actor,
    )


def materialize_draft(*, requirement, draft, actor=None):
    """审批通过时把工作副本的明细写进正式表。

    字段不在这里处理 —— 它归模板所有，正式行只是通过 template 外键引用它。
    meta 也不在这里 —— 它一直直接写在正式行上。

    草稿是整份工作副本而不是增量，所以先清空正式表的旧明细再重建。清空走
    all_objects 的真删除 —— 草稿行会复用同一批 UUID，任何残留（含历史软删除行）
    都会撞上 id 的唯一约束。历史内容由 RequirementVersion 快照保存。
    """
    RequirementDetail.all_objects.filter(requirement=requirement).delete()

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
                template_id=detail.template_id,
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
    """用给定快照的明细整体覆盖工作副本（回滚到历史版本时使用）。

    meta 基线与字段基线都保持不动 —— 它们记录的是「编辑」那一刻已批准的内容，
    回滚不该改写它们，否则 diff 的「变更前」就不再是已发布的内容。

    回滚只搬明细行；行上的 template_id 从快照里取回，字段结构随之自动恢复。
    """
    RequirementDraftDetail.all_objects.filter(draft=draft).delete()
    pending = []
    for index, row in enumerate(snapshot.get("details") or []):
        template_id = row.get("template_id")
        if not template_id:
            # 0313 之前的快照没有这个字段，无法确定字段来源，只能跳过
            continue
        pending.append(
            RequirementDraftDetail(
                id=row.get("id") or uuid4(),
                draft=draft,
                template_id=template_id,
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
