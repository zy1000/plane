/**
 * 整页的审批动作区：状态胶囊 + 查看变更单 + 提交/撤回。
 *
 * 抽屉里不渲染这一块 —— 标题下的 RequirementApprovalBadge 已经说清审批态，
 * 提交/撤回走网格行菜单。整页标题行右侧才是详情视图里推动评审的入口。
 * variant="actions" 时不再重复状态胶囊（标题下的徽标已经说了），只出链接和按钮。
 */
import { Lock, Send, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirement } from "@plane/types";
import { cn } from "@plane/utils";
import { REQUIREMENT_APPROVAL_PILL } from "@/components/products/requirements/approval/requirement-approval-cell";

type TProps = {
  requirement: TRequirement;
  isMutating?: boolean;
  onSubmitReview?: (requirementId: string) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
  onOpenChangeRequest?: (changeRequestId: string) => void;
  /** panel：状态胶囊 + 版本 + 动作；actions：只有动作（状态由标题下的徽标承担） */
  variant?: "panel" | "actions";
  className?: string;
};

export const RequirementApprovalPanel = ({
  requirement,
  isMutating,
  onSubmitReview,
  onWithdrawReview,
  onOpenChangeRequest,
  variant = "panel",
  className,
}: TProps) => {
  const { t } = useTranslation();
  const state = requirement.approval_state;
  const showState = variant === "panel";
  // 标题行里的按钮跟 28px 的图标按钮同高；右栏胶囊旁边才用小号
  const buttonSize = showState ? "sm" : "lg";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {showState && (
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-caption-sm-medium",
            REQUIREMENT_APPROVAL_PILL[state]
          )}
        >
          {state === "pending_deletion" && <Trash2 className="size-3" />}
          {state === "in_review" && <Lock className="size-3" />}
          {t(`requirement_approval.state.${state}`)}
        </span>
      )}

      {showState && requirement.approved_version !== null && (
        <span className="text-body-xs-regular text-tertiary tabular-nums">
          {t("requirement_approval.approved_version", { version: requirement.approved_version })}
        </span>
      )}

      {requirement.pending_change_request_id && onOpenChangeRequest && (
        <button
          type="button"
          onClick={() => onOpenChangeRequest(requirement.pending_change_request_id as string)}
          className="text-body-xs-medium text-accent-primary hover:underline"
        >
          {t("requirement_approval.view_change_request")}
        </button>
      )}

      <span className={cn("flex items-center gap-2", showState && "ml-auto")}>
        {requirement.can_submit_review && onSubmitReview && (
          <Button variant="primary" size={buttonSize} disabled={isMutating} onClick={() => onSubmitReview(requirement.id)}>
            <Send className="size-3" />
            {t("requirement_approval.submit_review")}
          </Button>
        )}
        {requirement.can_withdraw && requirement.pending_change_request_id && onWithdrawReview && (
          <Button
            variant="secondary"
            size={buttonSize}
            disabled={isMutating}
            onClick={() => onWithdrawReview(requirement.pending_change_request_id as string)}
          >
            <Undo2 className="size-3" />
            {t("requirement_approval.withdraw_review")}
          </Button>
        )}
      </span>
    </div>
  );
};
