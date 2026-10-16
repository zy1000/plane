/**
 * 「变更记录」Tab 的表格。
 *
 * 变更项计数与审批进度都直接读变更单上的冗余字段与 approvals 数组，不额外发请求 ——
 * 明细可能上千行，列表页不能 COUNT 变更项。
 */
import type { ReactNode } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { TRequirementChangeRequest, TRequirementChangeStatus } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { BaselinePagination } from "../baseline/baseline-pagination";
import { ChangeStatusSegment } from "./change-status-segment";
import { CHANGE_STATUS_PILL } from "./styles";
import type { TChangeStatusCounts } from "./use-change-request-status-counts";

/** 进度条填充色跟着单子的状态走，和状态药丸同一套语义色 */
const PROGRESS_FILL: Record<TRequirementChangeStatus, string> = {
  pending: "bg-warning-primary",
  approved: "bg-success-primary",
  rejected: "bg-danger-primary",
  cancelled: "bg-layer-3-hover",
};

/** 涉及需求列最多直接摆出的标题数，其余折成 +N */
const VISIBLE_REQUIREMENTS = 2;

/** 已结束的单整条填满；审批中按「通过人数 / 需要通过的人数」 */
const progressPercent = (changeRequest: TRequirementChangeRequest) => {
  const { status, approval_type: approvalType, required_count: requiredCount } = changeRequest;
  if (status === "approved" || status === "rejected") return 100;
  const needed =
    approvalType === "any" ? 1 : approvalType === "n_of_m" ? (requiredCount ?? 1) : changeRequest.total_count;
  if (!needed) return 0;
  return Math.min(100, Math.round((changeRequest.approved_count / needed) * 100));
};

function ApprovalProgress({ changeRequest }: { changeRequest: TRequirementChangeRequest }) {
  const { t } = useTranslation();
  const {
    approval_type: approvalType,
    approved_count: approvedCount,
    rejected_count: rejectedCount,
    total_count: totalCount,
  } = changeRequest;
  // 无需评审的单没有审批行：进度条画不出来、计数会是 0/0，只说明规则就够了
  if (approvalType === "none") {
    return <span className="text-13 text-tertiary">{t("workspace_products.requirements.change.rule.none")}</span>;
  }
  return (
    <span className="flex items-center gap-2.5 text-13 text-secondary">
      <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-layer-3" aria-hidden>
        <span
          className={`block h-full rounded-full ${PROGRESS_FILL[changeRequest.status]}`}
          style={{ width: `${progressPercent(changeRequest)}%` }}
        />
      </span>
      <span className="truncate tabular-nums">
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

function RequirementChips({ changeRequest }: { changeRequest: TRequirementChangeRequest }) {
  const { t } = useTranslation();
  const previews = changeRequest.requirement_previews ?? [];
  // 老数据或预览取不到标题时退回到计数
  if (!previews.length) {
    return (
      <span className="text-13 text-secondary tabular-nums">
        {t("workspace_products.requirements.change.requirement_count", { count: changeRequest.requirement_count })}
      </span>
    );
  }
  const visible = previews.slice(0, VISIBLE_REQUIREMENTS);
  const more = Math.max(changeRequest.requirement_count - visible.length, 0);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {visible.map((preview) => (
        <span
          key={preview.id}
          title={preview.title}
          className="inline-flex h-[22px] max-w-[120px] min-w-0 items-center rounded bg-layer-1 px-[7px] text-12 text-secondary"
        >
          <span className="truncate">{preview.title || t("requirement_detail.untitled")}</span>
        </span>
      ))}
      {more > 0 && <span className="shrink-0 text-12 text-tertiary tabular-nums">+{more}</span>}
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
  statusFilter: TRequirementChangeStatus | undefined;
  statusCounts: TChangeStatusCounts;
  onStatusFilterChange: (value: TRequirementChangeStatus | undefined) => void;
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
    statusFilter,
    statusCounts,
    onStatusFilterChange,
    onPerPageChange,
    onCursorChange,
    onRetry,
    onOpen,
  } = props;
  const { t } = useTranslation();

  // 工具栏常驻：筛到空结果时也要能切回去
  const toolbar = (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-subtle px-6">
      <ChangeStatusSegment value={statusFilter} counts={statusCounts} onChange={onStatusFilterChange} />
    </div>
  );

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="px-6 py-4">
        <Loader className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Loader.Item key={index} height="52px" />
          ))}
        </Loader>
      </div>
    );
  } else if (error) {
    body = (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-14 font-medium text-primary">{t("workspace_products.requirements.change.error_title")}</p>
          <p className="mt-1 text-13 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" size="xl" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  } else if (!changeRequests.length) {
    body = statusFilter ? (
      <div className="grid flex-1 place-items-center px-6 py-16 text-14 text-tertiary">
        {t("workspace_products.requirements.change.filtered_empty")}
      </div>
    ) : (
      <EmptyStateDetailed
        assetKey="changelog"
        title={t("workspace_products.requirements.change.empty_title")}
        description={t("workspace_products.requirements.change.empty_description")}
      />
    );
  } else {
    body = (
      <>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left">
            <thead className="sticky top-0 z-[1] bg-surface-2 text-13 font-medium text-tertiary">
              <tr className="h-10 border-b border-subtle">
                <th className="min-w-72 pr-4 pl-6 font-medium">
                  {t("workspace_products.requirements.change.columns.change_request")}
                </th>
                <th className="w-[300px] px-4 font-medium">
                  {t("workspace_products.requirements.change.columns.requirements")}
                </th>
                <th className="w-36 px-4 font-medium">{t("workspace_products.requirements.change.columns.submitter")}</th>
                <th className="w-44 px-4 font-medium">{t("workspace_products.requirements.change.columns.progress")}</th>
                <th className="w-28 px-4 font-medium">{t("workspace_products.requirements.change.columns.status")}</th>
                <th className="w-32 pr-6 pl-4 font-medium">
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
                  className={`h-[60px] cursor-pointer border-b border-subtle text-14 text-primary transition-colors hover:bg-layer-transparent-hover ${
                    changeRequest.can_approve ? "bg-warning-subtle/40" : ""
                  }`}
                >
                  <td className="pr-4 pl-6">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="min-w-10 shrink-0 font-mono text-13 font-medium text-accent-primary">
                        CR-{changeRequest.sequence_id}
                      </span>
                      {changeRequest.reason ? (
                        <span className="truncate font-medium text-primary">{changeRequest.reason}</span>
                      ) : (
                        <span className="truncate font-medium text-placeholder">
                          {t("workspace_products.requirements.change.untitled")}
                        </span>
                      )}
                      {changeRequest.can_approve && (
                        <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-warning-subtle px-2 text-12 font-medium text-warning-primary">
                          {t("workspace_products.requirements.change.awaiting_my_approval")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4">
                    <RequirementChips changeRequest={changeRequest} />
                  </td>
                  <td className="px-4">
                    <span className="flex min-w-0 items-center gap-2 text-13 text-secondary">
                      <Avatar
                        size={22}
                        name={changeRequest.created_by_detail?.display_name ?? ""}
                        src={getFileURL(changeRequest.created_by_detail?.avatar_url ?? "")}
                      />
                      <span className="truncate">{changeRequest.created_by_detail?.display_name}</span>
                    </span>
                  </td>
                  <td className="px-4">
                    <ApprovalProgress changeRequest={changeRequest} />
                  </td>
                  <td className="px-4">
                    <span
                      className={`inline-flex h-[22px] items-center gap-[5px] rounded-md px-2 text-12 font-medium whitespace-nowrap ${CHANGE_STATUS_PILL[changeRequest.status]}`}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      {t(`workspace_products.requirements.change.statuses.${changeRequest.status}`)}
                    </span>
                  </td>
                  <td className="pr-6 pl-4 text-13 text-tertiary tabular-nums">
                    {`${renderFormattedDate(changeRequest.created_at, "MM-dd")} ${renderFormattedTime(changeRequest.created_at)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BaselinePagination
          label={t("workspace_products.requirements.change.total", { count: totalCount })}
          perPage={perPage}
          nextCursor={nextCursor}
          prevCursor={prevCursor}
          nextPageResults={nextPageResults}
          prevPageResults={prevPageResults}
          onPerPageChange={onPerPageChange}
          onCursorChange={onCursorChange}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      {body}
    </div>
  );
}
