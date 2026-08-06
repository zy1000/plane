/**
 * 变更审批与版本模块的共享配色与文案 helper。
 *
 * 配色对齐设计规格「状态与 diff 配色总表」，全部走语义 token，不写死 hex。
 */
import type {
  TRequirementApprovalType,
  TRequirementChangeStatus,
  TRequirementChangeType,
} from "@plane/types";


export const CHANGE_STATUS_PILL: Record<TRequirementChangeStatus, string> = {
  pending: "bg-warning-subtle text-warning-primary",
  approved: "bg-success-subtle text-success-primary",
  rejected: "bg-danger-subtle text-danger-primary",
  cancelled: "bg-layer-2 text-tertiary",
};

export const CHANGE_TYPE_PILL: Record<TRequirementChangeType, string> = {
  create: "bg-success-subtle text-success-primary",
  update: "bg-warning-subtle text-warning-primary",
  delete: "bg-danger-subtle text-danger-primary",
};

/** 行级底色：修改行本身不着色，靠单元格角标提示 */
export const CHANGE_TYPE_ROW: Record<TRequirementChangeType, string> = {
  create: "bg-success-subtle/40",
  update: "",
  delete: "bg-danger-subtle/40",
};

export const DIFF_OLD_VALUE = "text-danger-secondary line-through";
export const DIFF_NEW_VALUE = "text-success-secondary";

export const PILL_BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-10 font-medium";
export const CHANGE_TYPE_BADGE = "inline-flex items-center rounded px-1.5 py-0.5 text-10 font-medium";

/** 「全部通过」/「任一通过」/「{n} 人通过」——审批进度卡片与底部审批条共用 */
export const approvalRuleLabel = (
  t: (key: string, values?: Record<string, unknown>) => string,
  approvalType: TRequirementApprovalType,
  requiredCount: number | null
) =>
  approvalType === "n_of_m"
    ? t("workspace_products.requirements.change.rule.n_of_m", { count: requiredCount ?? 1 })
    : t(`workspace_products.requirements.change.rule.${approvalType}`);
