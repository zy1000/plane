/** 「审批进度」卡片：审批人横向排列，每人一个小盒（头像 / 名字 / 状态 / 时间 / 意见）。 */
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementChangeApproval } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";

const STATE_ICON = {
  approved: { Icon: CheckCircle2, className: "text-success-primary" },
  rejected: { Icon: XCircle, className: "text-danger-primary" },
  pending: { Icon: Clock, className: "text-tertiary" },
} as const;

export function ChangeApprovalProgress({ approvals }: { approvals: TRequirementChangeApproval[] }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {approvals.map((approval) => {
        const state = approval.action ?? "pending";
        const { Icon, className } = STATE_ICON[state];
        return (
          <div key={approval.id} className="rounded-md border border-subtle px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <Avatar
                size="base"
                name={approval.approver_detail?.display_name ?? ""}
                src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-13 font-medium text-primary">
                    {approval.approver_detail?.display_name}
                  </span>
                  <span className={`flex shrink-0 items-center gap-1 text-12 ${className}`}>
                    <Icon className="size-3.5" />
                    {t(`workspace_products.requirements.change.approval_state.${state}`)}
                  </span>
                </div>
                {approval.acted_at && (
                  <p className="mt-0.5 text-11 text-tertiary">
                    {renderFormattedDate(approval.acted_at, "MM-dd HH:mm")}
                  </p>
                )}
                {approval.comment && (
                  <p className="mt-1 text-12 italic text-secondary">“{approval.comment}”</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
