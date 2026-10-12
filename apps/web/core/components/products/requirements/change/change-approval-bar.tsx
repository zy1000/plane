/**
 * 底部固定审批条。整宽 sticky，不做右侧审批栏 —— 明细网格列多，右侧栏会抢宽度。
 *
 * 按当前用户角色分派操作区：审批人（未表态）看到完整操作区、发起人看到「撤回审批」、
 * 其他人只看到左侧进度；变更单已是终态则整条不渲染。
 */
import { useLayoutEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementChangeApproval, TRequirementChangeRequestDetail } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { approvalRuleLabel } from "./styles";

const MAX_COMMENT_LENGTH = 2000;

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
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  /** 收起时一行；聚焦或已有内容时展开（至少 4 行、最多 8 行后框内滚动） */
  const isCommentExpanded = isCommentFocused || comment.length > 0;

  // 先归零再量 scrollHeight，删字时才能缩回；上下限交给 min-h / max-h
  useLayoutEffect(() => {
    const textarea = commentRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`;
  }, [comment, isCommentExpanded]);

  if (changeRequest.status !== "pending") return null;

  const rule = approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count);
  const canApprove = changeRequest.can_approve;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-[2] shrink-0 border-t border-subtle bg-surface-1 px-4 py-3 md:px-6",
        // 审批人：宽屏一行「进度 | 意见框 | 操作」底边对齐、意见框向上长高；窄屏意见框独占第一行
        canApprove
          ? "grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4 gap-y-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
          : "flex flex-wrap items-center gap-3",
        isCommentExpanded && "shadow-[0_-10px_24px_-14px_rgba(20,30,40,0.18)]"
      )}
    >
      <div className={cn("flex h-8 min-w-0 items-center gap-3", canApprove && "col-start-1 row-start-2 lg:row-start-1")}>
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

      {canApprove ? (
        <>
          <div className="relative col-span-2 row-start-1 min-w-0 lg:col-span-1 lg:col-start-2">
            <label htmlFor="change-approval-comment" className="sr-only">
              {t("workspace_products.requirements.change.bar.comment_label")}
            </label>
            <textarea
              id="change-approval-comment"
              ref={commentRef}
              rows={1}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              onFocus={() => setIsCommentFocused(true)}
              onBlur={() => setIsCommentFocused(false)}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder={t("workspace_products.requirements.change.bar.comment_placeholder")}
              className={cn(
                "focus:border-accent-strong focus:ring-accent-strong/10 block w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-[5px] text-13 leading-5 text-primary outline-none placeholder:text-placeholder focus:ring-2",
                // 4 行 / 8 行 = 边框 2 + 上内边距 5 + 行高 20×N + 底部留给字数的 24
                isCommentExpanded ? "max-h-[191px] min-h-[111px] overflow-y-auto pb-6" : "overflow-hidden"
              )}
            />
            {isCommentExpanded && (
              <span className="pointer-events-none absolute right-4 bottom-1 bg-surface-1 pl-1 text-12 text-placeholder tabular-nums">
                {comment.length} / {MAX_COMMENT_LENGTH}
              </span>
            )}
          </div>
          <div className="col-start-2 row-start-2 flex h-8 items-center justify-end gap-2 lg:col-start-3 lg:row-start-1">
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-13 text-secondary">
              <input
                type="checkbox"
                checked={revert}
                onChange={(event) => setRevert(event.target.checked)}
                className="size-3.5 cursor-pointer accent-accent-primary"
              />
              {t("workspace_products.requirements.change.bar.revert")}
            </label>
            <Button
              variant="error-outline"
              size="xl"
              className="px-4"
              disabled={isMutating}
              onClick={() => onReject(comment, revert)}
            >
              {t("workspace_products.requirements.change.bar.reject")}
            </Button>
            <Button
              variant="primary"
              size="xl"
              className="bg-success-primary px-4 text-on-color hover:bg-success-primary hover:opacity-90"
              loading={isMutating}
              onClick={() => onApprove(comment)}
            >
              {t("workspace_products.requirements.change.bar.approve")}
            </Button>
          </div>
        </>
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
