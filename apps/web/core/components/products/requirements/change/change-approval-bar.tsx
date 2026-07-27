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
  onReject: (comment: string) => void;
  onWithdraw: () => void;
};

export function ChangeApprovalBar({ changeRequest, isMutating, onApprove, onReject, onWithdraw }: TProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");

  if (changeRequest.status !== "pending") return null;

  const rule = approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count);

  return (
    <div className="sticky bottom-0 z-[2] flex flex-wrap items-center gap-3 border-t border-subtle bg-surface-1 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex -space-x-2">
          {changeRequest.approvals.map((approval) => (
            <span key={approval.id} className="relative">
              <Avatar
                size="base"
                name={approval.approver_detail?.display_name ?? ""}
                src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
              />
              <span
                aria-hidden
                className={cn(
                  "absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-surface-1",
                  dotClass(approval)
                )}
              />
            </span>
          ))}
        </span>
        <span className="text-12 text-secondary">
          {t("workspace_products.requirements.change.bar.effective_after", {
            approved: changeRequest.approved_count,
            total: changeRequest.total_count,
            rule,
          })}
        </span>
      </div>

      {changeRequest.can_approve ? (
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2">
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={2000}
            placeholder={t("workspace_products.requirements.change.bar.comment_placeholder")}
            className="focus:border-accent-primary h-9 min-w-0 max-w-md flex-1 rounded-md border border-subtle bg-surface-1 px-3 text-12 text-primary outline-none placeholder:text-placeholder"
          />
          <Button
            variant="primary"
            className="bg-success-primary text-on-color hover:bg-success-primary hover:opacity-90"
            loading={isMutating}
            onClick={() => onApprove(comment)}
          >
            {t("workspace_products.requirements.change.bar.approve")}
          </Button>
          <Button variant="error-outline" disabled={isMutating} onClick={() => onReject(comment)}>
            {t("workspace_products.requirements.change.bar.reject")}
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
