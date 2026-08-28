/**
 * 「评审中 / 删除待审」时压在标题下的提示条，与 RequirementModifiedBanner 同一位置、同一外形。
 *
 * 评审中的行内容只读，但只把控件禁掉用户会以为是没权限。这里把「为什么改不了」说出来，
 * 并给两个出口：看变更单、撤回评审。两个动作都由调用方注入 —— 变更单页与撤回逻辑长在
 * 列表页上，项目侧 / 范围抽屉拿不到就只出说明。
 */
import { Lock, Trash2, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirement } from "@plane/types";
import { BANNER_GHOST_BUTTON } from "./requirement-modified-banner";

export const RequirementInReviewBanner = ({
  requirement,
  isMutating,
  onOpenChangeRequest,
  onWithdrawReview,
}: {
  requirement: TRequirement;
  isMutating?: boolean;
  onOpenChangeRequest?: (changeRequestId: string) => void;
  onWithdrawReview?: (changeRequestId: string) => void;
}) => {
  const { t } = useTranslation();
  const state = requirement.approval_state;
  if (state !== "in_review" && state !== "pending_deletion") return null;
  const changeRequestId = requirement.pending_change_request_id;
  const isDeletion = state === "pending_deletion";
  const Icon = isDeletion ? Trash2 : Lock;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-warning-subtle bg-warning-subtle/30 px-3 py-2">
      <Icon className="size-3.5 shrink-0 text-warning-primary" />
      <span className="min-w-0 flex-1 text-body-xs-medium text-primary">
        {t(isDeletion ? "requirement_detail.in_review_banner.deletion_title" : "requirement_detail.in_review_banner.title")}
      </span>
      {changeRequestId && (onOpenChangeRequest || (onWithdrawReview && requirement.can_withdraw)) && (
        <div className="flex shrink-0 items-center gap-1">
          {onOpenChangeRequest && (
            <button type="button" onClick={() => onOpenChangeRequest(changeRequestId)} className={BANNER_GHOST_BUTTON}>
              {t("requirement_approval.view_change_request")}
            </button>
          )}
          {onWithdrawReview && requirement.can_withdraw && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => onWithdrawReview(changeRequestId)}
              className={BANNER_GHOST_BUTTON}
            >
              <Undo2 className="size-3.5" />
              {t("requirement_approval.withdraw_review")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
