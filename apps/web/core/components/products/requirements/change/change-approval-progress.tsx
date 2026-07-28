/** 收进变更摘要栏的审批详情：默认只露出进度，按需弹出完整轨迹。 */
import { Fragment } from "react";
import { Popover, Transition } from "@headlessui/react";
import { CheckCircle2, ChevronDown, Clock3, XCircle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementChangeApproval } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";

const STATE_ICON = {
  approved: { Icon: CheckCircle2, className: "text-success-primary" },
  rejected: { Icon: XCircle, className: "text-danger-primary" },
  pending: { Icon: Clock3, className: "text-warning-primary" },
} as const;

export function ChangeApprovalProgress({
  approvals,
  summary,
}: {
  approvals: TRequirementChangeApproval[];
  summary?: string;
}) {
  const { t } = useTranslation();
  const approvedCount = approvals.filter((approval) => approval.action === "approved").length;

  return (
    <Popover className="relative shrink-0">
      {({ open }) => (
        <>
          <Popover.Button className="flex h-8 max-w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong">
            <span className="hidden -space-x-1.5 sm:flex">
              {approvals.slice(0, 3).map((approval) => (
                <Avatar
                  key={approval.id}
                  size="sm"
                  name={approval.approver_detail?.display_name ?? ""}
                  src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
                />
              ))}
            </span>
            <span className="font-medium">{t("workspace_products.requirements.change.groups.approval")}</span>
            <span className="text-primary tabular-nums">
              {t("workspace_products.requirements.change.approved_progress", {
                approved: approvedCount,
                total: approvals.length,
              })}
            </span>
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 text-tertiary transition-transform", open && "rotate-180")}
            />
          </Popover.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="translate-y-1 opacity-0"
            enterTo="translate-y-0 opacity-100"
            leave="transition ease-in duration-100"
            leaveFrom="translate-y-0 opacity-100"
            leaveTo="translate-y-1 opacity-0"
          >
            <Popover.Panel className="absolute right-0 z-30 mt-2 w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-lg sm:w-96">
              <div className="border-b border-subtle px-4 py-3">
                <h2 className="text-14 font-semibold text-primary">
                  {t("workspace_products.requirements.change.groups.approval")}
                </h2>
                {summary && <p className="mt-0.5 text-12 text-tertiary">{summary}</p>}
              </div>

              {approvals.length > 0 ? (
                <div className="max-h-80 divide-y divide-subtle overflow-y-auto">
                  {approvals.map((approval) => {
                    const state = approval.action ?? "pending";
                    const { Icon, className } = STATE_ICON[state];
                    return (
                      <div key={approval.id} className="flex items-start gap-2.5 px-4 py-3">
                        <Icon className={cn("mt-1 size-4 shrink-0", className)} aria-hidden />
                        <Avatar
                          size="base"
                          name={approval.approver_detail?.display_name ?? ""}
                          src={getFileURL(approval.approver_detail?.avatar_url ?? "")}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-13 font-medium text-primary">
                              {approval.approver_detail?.display_name}
                            </span>
                            <span className={cn("shrink-0 text-12 font-medium", className)}>
                              {t(`workspace_products.requirements.change.approval_state.${state}`)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-12 text-tertiary">
                            {approval.acted_at
                              ? `${renderFormattedDate(approval.acted_at, "MM-dd")} ${renderFormattedTime(approval.acted_at)}`
                              : t("workspace_products.requirements.change.approval_waiting")}
                          </p>
                          {approval.comment && (
                            <p className="mt-1 text-12 leading-5 text-secondary">“{approval.comment}”</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="px-4 py-5 text-13 text-tertiary">
                  {t("workspace_products.requirements.change.approval_empty")}
                </p>
              )}
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
}
