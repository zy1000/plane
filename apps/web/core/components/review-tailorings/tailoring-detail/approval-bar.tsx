import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringApproval, TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

const dotClass = (approval: TReviewTailoringApproval) => {
  if (approval.action === "approved") return "bg-success-primary";
  if (approval.action === "rejected") return "bg-danger-primary";
  return "bg-layer-3";
};

/** 「任一通过」/「全部通过」/「{n} 人通过」 */
const ruleLabel = (t: (key: string, values?: Record<string, unknown>) => string, detail: TReviewTailoringDetail) => {
  if (detail.approval_type === "all") return t("review_tailoring.approval.rule_all");
  if (detail.approval_type === "n_of_m")
    return t("review_tailoring.approval.rule_n_of_m", { count: detail.required_count ?? 1 });
  return t("review_tailoring.approval.rule_any");
};

/**
 * 底部固定签批条。整宽 sticky，不做右侧栏 —— 矩阵列多，右侧栏会抢宽度。
 *
 * 按当前用户身份分派操作区：本轮未表态的签批人看到通过/驳回，提交人看到撤回，
 * 其他人只看到进度。非签批中状态整条不渲染。
 */
export const TailoringApprovalBar = ({
  detail,
  currentUserId,
  isMutating,
  onApprove,
  onReject,
  onWithdraw,
}: {
  detail: TReviewTailoringDetail;
  currentUserId: string | undefined;
  isMutating: boolean;
  onApprove: (comment: string) => void;
  onReject: (comment: string) => void;
  onWithdraw: () => void;
}) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");

  if (detail.status !== EReviewTailoringStatus.PENDING) return null;

  const myApproval = detail.approvals.find((approval) => approval.approver === currentUserId);
  const canAct = Boolean(myApproval && !myApproval.action);
  const isSubmitter = detail.submitted_by_detail?.id === currentUserId;
  const approvedCount = detail.approvals.filter((approval) => approval.action === "approved").length;

  return (
    <div className="sticky bottom-0 z-[2] flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle bg-surface-1 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5">
          {detail.approvals.map((approval) => (
            <span key={approval.id} className="relative shrink-0">
              <Avatar
                size="base"
                name={approval.approver_detail?.display_name ?? ""}
                src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
              />
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border border-surface-1",
                  dotClass(approval)
                )}
              />
            </span>
          ))}
        </span>
        <div className="min-w-0 text-12">
          <p className="text-primary">
            {ruleLabel(t, detail)} ·{" "}
            {t("review_tailoring.approval.progress", {
              approved: approvedCount,
              total: detail.approvals.length,
            })}
          </p>
          <p className="text-tertiary">{t("review_tailoring.approval.round", { count: detail.round })}</p>
        </div>
      </div>

      {canAct && (
        <div className="ml-auto flex flex-1 items-center justify-end gap-2">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t("review_tailoring.approval.comment_placeholder")}
            className="focus:border-accent-primary h-8 min-w-0 max-w-sm flex-1 rounded border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
          />
          <Button variant="secondary" size="sm" disabled={isMutating} onClick={() => onReject(comment)}>
            {t("review_tailoring.approval.reject")}
          </Button>
          <Button variant="primary" size="sm" disabled={isMutating} onClick={() => onApprove(comment)}>
            {t("review_tailoring.approval.approve")}
          </Button>
        </div>
      )}

      {!canAct && isSubmitter && (
        <div className="ml-auto">
          <Button variant="secondary" size="sm" disabled={isMutating} onClick={onWithdraw}>
            {t("review_tailoring.approval.withdraw")}
          </Button>
        </div>
      )}

      {!canAct && !isSubmitter && (
        <span className="ml-auto text-12 text-tertiary">
          {myApproval?.action
            ? t(`review_tailoring.approval.acted_${myApproval.action}`)
            : t("review_tailoring.approval.waiting")}
        </span>
      )}
    </div>
  );
};
