/**
 * 底部固定审批条。整宽 sticky，不做右侧审批栏 —— 明细网格列多，右侧栏会抢宽度。
 *
 * 按当前用户角色分派操作区：审批人（未表态）看到完整操作区、发起人看到「撤回审批」、
 * 其他人只看到左侧进度；变更单已是终态则整条不渲染。
 */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementChangeApproval, TRequirementChangeRequestDetail } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { approvalRuleLabel } from "./styles";

const dotClass = (approval: TRequirementChangeApproval) => {
  if (approval.action === "approved") return "bg-success-primary";
  if (approval.action === "rejected") return "bg-danger-primary";
  return "bg-layer-3";
};

type TProps = {
  changeRequest: TRequirementChangeRequestDetail;
  isMutating: boolean;
  onApprove: (comment: string) => void;
  onReject: (comment: string, revert: boolean) => void;
  onWithdraw: () => void;
};

export function ChangeApprovalBar({ changeRequest, isMutating, onApprove, onReject, onWithdraw }: TProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");
  /** 驳回时顺带把内容退回上一版（禅道的「撤销变更」）。默认关：多数驳回是「改一改再提」 */
  const [revert, setRevert] = useState(false);

  if (changeRequest.status !== "pending") return null;

  const rule = approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count);

  return (
    <div className="sticky bottom-0 z-[2] flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle bg-surface-1 px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5">
          {changeRequest.approvals.map((approval) => (
            <span key={approval.id} className="relative shrink-0">
              <Avatar
                size="base"
                name={approval.approver_detail?.display_name ?? ""}
                src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
              />
              <span
                aria-hidden
                className={cn(
                  "ring-surface-1 absolute right-0 bottom-0 size-2 rounded-full ring-2",
                  dotClass(approval)
                )}
              />
            </span>
          ))}
        </span>
        <span className="text-13 text-secondary">
          {t("workspace_products.requirements.change.bar.effective_after", {
            approved: changeRequest.approved_count,
            total: changeRequest.total_count,
            rule,
          })}
        </span>
      </div>

      {changeRequest.can_approve ? (
        <div className="flex min-w-0 basis-full items-center justify-end gap-2 lg:ml-auto lg:flex-1 lg:basis-auto">
          <label htmlFor="change-approval-comment" className="sr-only">
            {t("workspace_products.requirements.change.bar.comment_label")}
          </label>
          <input
            id="change-approval-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            placeholder={t("workspace_products.requirements.change.bar.comment_placeholder")}
            className="focus:border-accent-primary focus:ring-accent-primary/10 h-9 max-w-md min-w-0 flex-1 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary outline-none placeholder:text-placeholder focus:ring-2"
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-11 text-secondary">
            <input
              type="checkbox"
              checked={revert}
              onChange={(event) => setRevert(event.target.checked)}
              className="size-3.5 cursor-pointer accent-accent-primary"
            />
            {t("workspace_products.requirements.change.bar.revert")}
          </label>
          <Button variant="error-outline" disabled={isMutating} onClick={() => onReject(comment, revert)}>
            {t("workspace_products.requirements.change.bar.reject")}
          </Button>
          <Button
            variant="primary"
            className="bg-success-primary text-on-color hover:bg-success-primary hover:opacity-90"
            loading={isMutating}
            onClick={() => onApprove(comment)}
          >
            {t("workspace_products.requirements.change.bar.approve")}
          </Button>
        </div>
      ) : changeRequest.can_cancel ? (
        <div className="ml-auto">
          <Button variant="secondary" loading={isMutating} onClick={onWithdraw}>
            <RotateCcw className="size-3.5" />
            {t("workspace_products.requirements.state.withdraw_review")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
