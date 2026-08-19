import type { TRequirement, TRequirementBaselineEntry, TRequirementTypeSchema } from "@plane/types";

/**
 * 把基线条目收成网格 / 抽屉能读的 TRequirement。
 *
 * id 用 requirement_id：标题点击和 URL ?peek= 都按这条需求定位，而不是条目自己的 id。
 * 审批态写成已通过 + 收录版本号 —— 基线里的都是当时冻结的一版，没有「变更中」。
 */
export function baselineEntryToRequirement(entry: TRequirementBaselineEntry, productId: string): TRequirement {
  const snapshot = entry.snapshot;
  return {
    ...snapshot,
    id: entry.requirement_id,
    product_id: productId,
    project_id: null,
    library_id: null,
    requirement_type_id: entry.requirement_type_id,
    sequence_id: snapshot.sequence_id ?? 0,
    display_id: entry.display_id ?? null,
    source_library_id: snapshot.source_library_id ?? null,
    source_sequence_id: snapshot.source_sequence_id ?? null,
    source_display_id: null,
    sort_order: entry.sort_order,
    version: 0,
    approval_state: "approved",
    approved_version: entry.version_number,
    pending_change_request_id: null,
    pending_change_type: null,
    is_locked: true,
    can_submit_review: false,
    can_withdraw: false,
    project_ids: [],
    created_at: "",
    updated_at: "",
    created_by: null,
    updated_by: null,
  };
}

/**
 * 名称沿用今天的类型，字段树必须用收录时的 fields_snapshot。
 * 字段结构变更不走审批，用现在的表头渲染旧快照会错列。
 */
export function baselineEntryToRequirementType(
  entry: TRequirementBaselineEntry,
  requirementTypes: TRequirementTypeSchema[]
): TRequirementTypeSchema {
  const live = requirementTypes.find((item) => item.id === entry.requirement_type_id);
  return {
    id: entry.requirement_type_id,
    name: live?.name ?? "",
    logo_props: live?.logo_props,
    fields: entry.fields_snapshot,
  };
}
