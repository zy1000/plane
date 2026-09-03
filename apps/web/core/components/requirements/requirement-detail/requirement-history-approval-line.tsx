"use client";

/**
 * 历史行里的审批一句话：等谁批 / 谁批的 / 谁驳回的、为什么。
 * 只负责把审批数据翻成文案，不做布局。
 */
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementChangeStatus } from "@plane/types";
import { renderFormattedDateTime } from "@plane/utils";
import { approvalRuleLabel } from "@/components/products/requirements/change/styles";
import { useMember } from "@/hooks/store/use-member";
import type { THistoryApproval } from "./requirement-history-model";
import { HistoryNote } from "./requirement-history-timeline";

const NAME_SEPARATOR = "、";

export const RequirementHistoryApprovalLine = observer(function RequirementHistoryApprovalLine({
  approval,
  status,
}: {
  approval: THistoryApproval;
  status: TRequirementChangeStatus;
}) {
  const { t } = useTranslation();
  const { getUserDetails } = useMember();

  const namesWhere = (predicate: (action: string | null) => boolean) =>
    approval.approvals
      .filter((row) => predicate(row.action))
      .map((row) => row.approver_detail?.display_name)
      .filter((name): name is string => Boolean(name));

  let text: string | null = null;
  let tone: "default" | "danger" = "default";

  if (status === "pending") {
    const rule = approval.type ? approvalRuleLabel(t, approval.type, approval.requiredCount) : "";
    const waiting = namesWhere((action) => action === null);
    text = waiting.length
      ? t("requirement_detail.history.approval.pending", { names: waiting.join(NAME_SEPARATOR), rule })
      : t("requirement_detail.history.approval.pending_generic", { rule });
  } else if (status === "approved") {
    if (approval.type === "none") {
      text = t("requirement_detail.history.approval.none");
    } else {
      // 轨迹来源有审批行；版本兜底行只有 id 列表，去成员 store 换名
      const fromApprovals = namesWhere((action) => action === "approved");
      const fromIds = approval.approvedByIds.map((id) => getUserDetails(id)?.display_name ?? id);
      const names = fromApprovals.length ? fromApprovals : fromIds;
      const time = approval.completedAt ? renderFormattedDateTime(approval.completedAt) : "";
      text = names.length
        ? t("requirement_detail.history.approval.approved", { names: names.join(NAME_SEPARATOR), time })
        : t("requirement_detail.history.approval.approved_generic", { time });
    }
  } else if (status === "rejected") {
    const rejecter = approval.approvals.find((row) => row.action === "rejected");
    const name = rejecter?.approver_detail?.display_name ?? "—";
    text = rejecter?.comment
      ? t("requirement_detail.history.approval.rejected", { name, comment: rejecter.comment })
      : t("requirement_detail.history.approval.rejected_no_comment", { name });
    tone = "danger";
  } else if (status === "cancelled") {
    text = t("requirement_detail.history.approval.cancelled");
  }

  if (!text) return null;
  return <HistoryNote tone={tone}>{text}</HistoryNote>;
});
