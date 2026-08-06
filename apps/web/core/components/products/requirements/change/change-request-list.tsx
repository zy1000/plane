/**
 * 「变更记录」Tab 的表格。
 *
 * 变更项计数与审批进度都直接读变更单上的冗余字段与 approvals 数组，不额外发请求 ——
 * 明细可能上千行，列表页不能 COUNT 变更项。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementChangeApproval, TRequirementChangeRequest } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { CHANGE_STATUS_PILL, PILL_BASE } from "./styles";

const PER_PAGE_OPTIONS = [10, 20, 50];

const approvalDotClass = (approval: TRequirementChangeApproval) => {
  if (approval.action === "approved") return "bg-success-primary";
  if (approval.action === "rejected") return "bg-danger-primary";
  return "bg-layer-3";
};

function ApprovalProgress({ changeRequest }: { changeRequest: TRequirementChangeRequest }) {
  const { t } = useTranslation();
  const { approvals, approved_count: approvedCount, rejected_count: rejectedCount, total_count: totalCount } =
    changeRequest;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {approvals.map((approval) => (
          <span key={approval.id} className={cn("size-2 rounded-full", approvalDotClass(approval))} aria-hidden />
        ))}
      </span>
      <span className="text-secondary">
        {rejectedCount > 0
          ? t("workspace_products.requirements.change.rejected_progress", { count: rejectedCount })
          : t("workspace_products.requirements.change.approved_progress", {
              approved: approvedCount,
              total: totalCount,
            })}
      </span>
    </span>
  );
}

type TProps = {
  changeRequests: TRequirementChangeRequest[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onRetry: () => void;
  onOpen: (changeRequest: TRequirementChangeRequest) => void;
};

export function ChangeRequestList(props: TProps) {
  const {
    changeRequests,
    totalCount,
    isLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    onPerPageChange,
    onCursorChange,
    onRetry,
    onOpen,
  } = props;
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="p-4">
        <Loader className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Loader.Item key={index} height="48px" />
          ))}
        </Loader>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">
            {t("workspace_products.requirements.change.error_title")}
          </p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!changeRequests.length) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center text-13 text-tertiary">
        {t("workspace_products.requirements.change.empty")}
      </div>
    );
  }

  const currentPage = Number(prevCursor?.split(":")[1] ?? -1) + 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-layer-1 text-11 font-medium text-secondary">
            <tr className="border-b border-subtle">
              <th className="min-w-64 px-4 py-2.5">
                {t("workspace_products.requirements.change.columns.change_request")}
              </th>
              <th className="w-40 px-3 py-2.5">{t("workspace_products.requirements.change.columns.submitter")}</th>
              <th className="w-24 px-3 py-2.5">{t("workspace_products.requirements.change.columns.items")}</th>
              <th className="w-44 px-3 py-2.5">{t("workspace_products.requirements.change.columns.progress")}</th>
              <th className="w-24 px-3 py-2.5">{t("workspace_products.requirements.change.columns.status")}</th>
              <th className="w-32 px-3 py-2.5">
                {t("workspace_products.requirements.change.columns.submitted_at")}
              </th>
            </tr>
          </thead>
          <tbody>
            {changeRequests.map((changeRequest) => (
              <tr
                key={changeRequest.id}
                // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- An interactive table row cannot be replaced by a button without invalid table markup.
                role="button"
                tabIndex={0}
                onClick={() => onOpen(changeRequest)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
                  event.preventDefault();
                  onOpen(changeRequest);
                }}
                className="cursor-pointer border-b border-subtle/70 text-12 hover:bg-accent-subtle/30"
              >
                <td className="px-4 py-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-medium text-accent-primary">CR-{changeRequest.sequence_id}</span>
                    <span className="truncate text-primary">
                      {changeRequest.reason || t("workspace_products.requirements.change.untitled")}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      size="sm"
                      name={changeRequest.created_by_detail?.display_name ?? ""}
                      src={getFileURL(changeRequest.created_by_detail?.avatar_url ?? "")}
                    />
                    <span className="truncate">{changeRequest.created_by_detail?.display_name}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-secondary tabular-nums">
                  {t("workspace_products.requirements.change.requirement_count", { count: changeRequest.requirement_count })}
                </td>
                <td className="px-3 py-3">
                  <ApprovalProgress changeRequest={changeRequest} />
                </td>
                <td className="px-3 py-3">
                  <span className={cn(PILL_BASE, CHANGE_STATUS_PILL[changeRequest.status])}>
                    {t(`workspace_products.requirements.change.statuses.${changeRequest.status}`)}
                  </span>
                </td>
                <td className="px-3 py-3 text-11 text-tertiary">
                  {`${renderFormattedDate(changeRequest.created_at, "MM-dd")} ${renderFormattedTime(changeRequest.created_at)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex shrink-0 items-center justify-between border-t border-subtle px-4 py-2.5 text-11 text-secondary">
        <span>{t("workspace_products.requirements.change.total", { count: totalCount })}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!prevPageResults}
            onClick={() => onCursorChange(prevCursor)}
            className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
            aria-label={t("requirement_grid.pagination.previous_page")}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums">{Math.max(currentPage, 1)}</span>
          <button
            type="button"
            disabled={!nextPageResults}
            onClick={() => onCursorChange(nextCursor)}
            className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
            aria-label={t("requirement_grid.pagination.next_page")}
          >
            <ChevronRight className="size-3.5" />
          </button>
          <select
            value={perPage}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            className="h-7 rounded border border-subtle bg-surface-1 px-1.5 outline-none"
            aria-label={t("requirement_grid.pagination.per_page")}
          >
            {PER_PAGE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t("workspace_products.requirements.change.per_page_value", { count: value })}
              </option>
            ))}
          </select>
        </div>
      </footer>
    </div>
  );
}
