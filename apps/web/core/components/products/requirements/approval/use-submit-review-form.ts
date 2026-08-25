import { useCallback, useEffect, useState } from "react";
import type { TRequirementApprovalSpec, TRequirementApprovalType } from "@plane/types";

/** n_of_m 的合法区间是 1..评审人数；没人时按 1 兜底，选上人再校正 */
const clampRequiredCount = (count: number, approverCount: number) =>
  Math.min(Math.max(count, 1), approverCount || 1);

/**
 * 提交评审弹窗的表单状态：变更原因 + 本次的评审人与通过规则。
 *
 * 弹窗每次打开都从头来（默认 any、评审人为空、不预填）—— 评审人与规则只对这一张变更单
 * 有效，上一次选了谁与这一次无关。
 */
export const useSubmitReviewForm = ({ isOpen }: { isOpen: boolean }) => {
  const [reason, setReason] = useState("");
  const [approvalType, setApprovalTypeState] = useState<TRequirementApprovalType>("any");
  const [approverIds, setApproverIdsState] = useState<string[]>([]);
  const [requiredCount, setRequiredCount] = useState(1);

  useEffect(() => {
    if (!isOpen) return;
    setReason("");
    setApprovalTypeState("any");
    setApproverIdsState([]);
    setRequiredCount(1);
  }, [isOpen]);

  /** 切到 none 时清空评审人：名单在这条规则下没有意义，留着会随 payload 发出去被服务端拒绝 */
  const setApprovalType = useCallback((type: TRequirementApprovalType) => {
    setApprovalTypeState(type);
    if (type === "none") setApproverIdsState([]);
  }, []);

  /** 评审人变动时把 requiredCount 夹回 1..人数，否则 n_of_m 会带着越界的数字提交 */
  const setApproverIds = useCallback((ids: string[]) => {
    setApproverIdsState(ids);
    setRequiredCount((current) => clampRequiredCount(current, ids.length));
  }, []);

  /** 除 none 外都必须有评审人；不满足时确认按钮禁用，不把 400 留给服务端 */
  const canSubmit = approvalType === "none" || approverIds.length > 0;

  const buildPayload = useCallback(
    (): TRequirementApprovalSpec & { reason: string } => ({
      reason: reason.trim(),
      approval_type: approvalType,
      required_count: approvalType === "n_of_m" ? requiredCount : null,
      approver_ids: approvalType === "none" ? [] : approverIds,
    }),
    [approvalType, approverIds, reason, requiredCount]
  );

  return {
    reason,
    setReason,
    approvalType,
    setApprovalType,
    approverIds,
    setApproverIds,
    requiredCount,
    setRequiredCount,
    canSubmit,
    buildPayload,
  };
};
