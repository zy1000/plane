import { useState } from "react";
import { Check, Clock3, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringApproval, TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring.approval";

const MARK: Record<"approved" | "rejected" | "waiting", string> = {
  approved: "bg-success-primary",
  rejected: "bg-danger-primary",
  waiting: "bg-layer-3",
};

const STATUS_TEXT: Record<"approved" | "rejected" | "waiting", string> = {
  approved: "text-success-primary",
  rejected: "text-danger-primary",
  waiting: "text-tertiary",
};

const approvalState = (approval: TReviewTailoringApproval) => approval.action ?? "waiting";

/**
 * 签批中时标题下的一块面板：谁要签、签了没、规则是什么、通过之后会发生什么。
 *
 * 原来是钉在页面最底下的一条，签批人只看得到色点。现在每个人一行（头像 + 姓名 + 状态 + 意见），
 * 右侧按身份分派：本轮未表态的签批人看到意见框与通过 / 驳回，提交人看到撤回，其他人没有按钮。
 * 非签批中不渲染。
 */
export const ApprovalPanel = ({
  detail,
  stats,
  currentUserId,
  isMutating,
  onApprove,
  onReject,
  onWithdraw,
}: {
  detail: TReviewTailoringDetail;
  stats: TTailoringStats;
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
  const rule =
    detail.approval_type === "all"
      ? t(`${I18N}.rule_all`)
      : detail.approval_type === "n_of_m"
        ? t(`${I18N}.rule_n_of_m`, { count: detail.required_count ?? 1 })
        : t(`${I18N}.rule_any`);

  return (
    <div className="mx-6 mb-4 grid grid-cols-1 gap-x-7 gap-y-4 rounded-xl border border-warning-subtle bg-warning-subtle px-4.5 py-4 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5 text-14 font-semibold text-primary">
          <Clock3 className="size-4 text-warning-primary" />
          {t(`${I18N}.round`, { count: detail.round })}
          <span className="text-13 font-normal text-tertiary tabular-nums">
            · {rule} · {t(`${I18N}.progress`, { approved: approvedCount, total: detail.approvals.length })}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2.5">
          {detail.approvals.map((approval) => {
            const state = approvalState(approval);
            const isMe = approval.approver === currentUserId;
            return (
              <div key={approval.id} className="flex min-w-0 items-center gap-2">
                <span className="relative shrink-0">
                  <Avatar
                    size="lg"
                    name={approval.approver_detail?.display_name ?? ""}
                    src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
                  />
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-(--background-color-warning-subtle)",
                      MARK[state]
                    )}
                  />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-13 text-primary">{approval.approver_detail?.display_name}</span>
                  <span className={cn("block max-w-60 truncate text-12", STATUS_TEXT[state])} title={approval.comment || undefined}>
                    {t(`${I18N}.status_${state}`)}
                    {isMe && state === "waiting" && ` · ${t(`${I18N}.you`)}`}
                    {approval.comment && ` · ${approval.comment}`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {canAct && (
        <div className="flex w-full flex-col gap-2.5 md:w-90">
          <textarea
            id="review-tailoring-approval-comment"
            rows={2}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t(`${I18N}.comment_placeholder`)}
            className="w-full resize-none rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-13 leading-relaxed text-primary outline-none placeholder:text-placeholder focus:border-accent-strong focus:ring-3 focus:ring-accent-primary/15"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="error-outline"
              size="xl"
              disabled={isMutating}
              onClick={() => onReject(comment.trim())}
            >
              {t(`${I18N}.reject`)}
            </Button>
            <Button
              variant="primary"
              size="xl"
              prependIcon={<Check />}
              disabled={isMutating}
              onClick={() => onApprove(comment.trim())}
            >
              {t(`${I18N}.approve`)}
            </Button>
          </div>
        </div>
      )}

      {!canAct && isSubmitter && (
        <div className="flex items-start justify-end">
          <Button variant="secondary" size="xl" disabled={isMutating} onClick={onWithdraw}>
            {t(`${I18N}.withdraw`)}
          </Button>
        </div>
      )}

      <p className="col-span-full flex items-center gap-1.5 border-t border-warning-subtle pt-2.5 text-12 text-tertiary tabular-nums">
        <Info className="size-3.5 shrink-0" />
        {t(`${I18N}.note`, { created: stats.toCreate, deleted: stats.toDelete })}
      </p>
    </div>
  );
};
