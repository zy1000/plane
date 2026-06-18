"use client";

import { useState } from "react";
import { Modal, Pagination } from "antd";
import useSWR from "swr";
import { ClipboardList, FileSearch, Package, Repeat } from "lucide-react";
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { getDate, renderFormattedDate } from "@plane/utils";
import { getReleaseStatusDetails as getReleaseStatusMeta } from "@/components/releases/release-status-config";
import { ProjectStatisticService, type TProjectOverviewStatisticResponse } from "@/services/project";

const projectStatisticService = new ProjectStatisticService();
const MODAL_PAGE_SIZE = 20;

export type OverviewProgressSection = "cycle" | "release" | "plan" | "review";

type Props = {
  open: boolean;
  onClose: () => void;
  section: OverviewProgressSection;
  workspaceSlug: string;
  projectId: string;
};

const CYCLE_STATUS_NORMALIZE_MAP: Record<string, string> = {
  未开始: "not_started",
  进行中: "in_progress",
  测试中: "testing",
  已退回: "returned",
  已延期: "delayed",
  已完成: "completed",
  已取消: "cancelled",
  testing: "testing",
  current: "in_progress",
  upcoming: "not_started",
  draft: "not_started",
};

function normalizeCycleStatusValue(status?: string): string {
  return status ? (CYCLE_STATUS_NORMALIZE_MAP[status] ?? status.toLowerCase()) : "not_started";
}

const LEGACY_STATUS_CLASS_MAP: Record<string, string> = {
  "bg-indigo-50": "bg-accent-subtle",
  "text-blue-500": "text-accent-primary",
  "bg-amber-50": "bg-warning-subtle",
  "text-amber-500": "text-warning-primary",
  "bg-red-50": "bg-danger-subtle",
  "text-red-600": "text-danger-primary",
  "bg-green-50": "bg-success-subtle",
  "text-green-600": "text-success-primary",
};

const getStatisticStatusTagClassName = (textColor?: string) =>
  [
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs",
    textColor ? (LEGACY_STATUS_CLASS_MAP[textColor] ?? textColor) : "",
  ]
    .filter(Boolean)
    .join(" ");

function formatStatisticTableDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  const start = startDate ? getDate(startDate) : null;
  const end = endDate ? getDate(endDate) : null;
  const fullStart = start ? renderFormattedDate(start, "yyyy/MM/dd") : "-";
  const fullEnd = end ? renderFormattedDate(end, "yyyy/MM/dd") : "-";
  return `${fullStart} ~ ${fullEnd}`;
}

const SECTION_CONFIG: Record<
  OverviewProgressSection,
  {
    title: string;
    icon: typeof Repeat;
    nameLabel: string;
    emptyLabel: string;
    pageParamKey: string;
    dataKey: keyof TProjectOverviewStatisticResponse;
    getNavigateUrl: (itemId: string, workspaceSlug: string, projectId: string) => string;
  }
> = {
  cycle: {
    title: "迭代",
    icon: Repeat,
    nameLabel: "迭代",
    emptyLabel: "暂无迭代数据",
    pageParamKey: "page",
    dataKey: "cycles",
    getNavigateUrl: (itemId, workspaceSlug, projectId) =>
      `/${workspaceSlug}/projects/${projectId}/cycles/${itemId}/overview`,
  },
  release: {
    title: "发布",
    icon: Package,
    nameLabel: "发布",
    emptyLabel: "暂无发布数据",
    pageParamKey: "release_page",
    dataKey: "releases",
    getNavigateUrl: (itemId, workspaceSlug, projectId) =>
      `/${workspaceSlug}/projects/${projectId}/releases/${itemId}/overview`,
  },
  plan: {
    title: "测试计划",
    icon: ClipboardList,
    nameLabel: "测试计划",
    emptyLabel: "暂无测试计划数据",
    pageParamKey: "plan_page",
    dataKey: "test_plans",
    getNavigateUrl: (itemId, workspaceSlug, projectId) =>
      `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${itemId}`,
  },
  review: {
    title: "评审",
    icon: FileSearch,
    nameLabel: "评审",
    emptyLabel: "暂无评审数据",
    pageParamKey: "review_page",
    dataKey: "case_reviews",
    getNavigateUrl: (itemId, workspaceSlug, projectId) =>
      `/${workspaceSlug}/projects/${projectId}/testhub/caseManagementReviewDetail?review_id=${itemId}`,
  },
};

function getCycleStatusDetails(status?: string) {
  const normalizedStatus = normalizeCycleStatusValue(status);
  const statusDetails =
    CYCLE_STATUS.find((item) => item.value === normalizedStatus) ?? CYCLE_STATUS[CYCLE_STATUS.length - 1];
  if (normalizedStatus === "in_progress") return { ...statusDetails, textColor: "text-[#F59E0B]" };
  if (normalizedStatus === "not_started") return { ...statusDetails, textColor: "text-secondary" };
  return statusDetails;
}

function getModuleStatusDetails(status?: string) {
  const statusDetails = getReleaseStatusMeta(status);
  if (statusDetails.value === "in-progress") return { ...statusDetails, textColor: "text-[#F59E0B]" };
  return statusDetails;
}

function getQaStatusDetails(status?: string) {
  if (status === "进行中") return { textColor: "text-[#F59E0B]" };
  if (status === "已完成") return { textColor: "text-green-600" };
  return { textColor: "text-secondary" };
}

export function OverviewProgressListModal({ open, onClose, section, workspaceSlug, projectId }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);

  const config = SECTION_CONFIG[section];
  const Icon = config.icon;

  const { data, isLoading } = useSWR<TProjectOverviewStatisticResponse>(
    open ? `overview-progress-modal-${section}-${workspaceSlug}-${projectId}-${page}` : null,
    () =>
      projectStatisticService.getOverviewStatistic(workspaceSlug, projectId, {
        [config.pageParamKey]: page,
        page_size: MODAL_PAGE_SIZE,
        include_all_statuses: true,
      }),
    { keepPreviousData: true }
  );

  const sectionData = data?.[config.dataKey] as { count: number; data: Array<{ id: string; name: string; start_date: string | null; end_date: string | null; status: string; owner: { display_name: string } | null }> } | undefined;
  const totalCount = sectionData?.count ?? 0;
  const items = sectionData?.data ?? [];

  const handleClose = () => {
    setPage(1);
    onClose();
  };

  const renderStatusCell = (item: (typeof items)[number]) => {
    if (section === "cycle") {
      const details = getCycleStatusDetails(item.status);
      return (
        <span className={getStatisticStatusTagClassName(details.textColor)}>{t(details.i18n_title)}</span>
      );
    }
    if (section === "release") {
      const details = getModuleStatusDetails(item.status);
      return <span className={getStatisticStatusTagClassName(details.textColor)}>{details.label}</span>;
    }
    const details = getQaStatusDetails(item.status);
    return <span className={getStatisticStatusTagClassName(details.textColor)}>{item.status ?? "-"}</span>;
  };

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <Icon className="h-4 w-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">{config.title}</span>
          <span className="text-sm text-placeholder">共 {totalCount} 个</span>
        </div>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={1200}
      destroyOnClose
      styles={{ body: { padding: 0, overflow: "hidden" } }}
    >
      <div className="flex h-[78vh] max-h-[78vh] flex-col bg-surface-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
          <Table className="table-fixed" wrapperClassName="overflow-visible">
            <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
              <TableRow>
                <TableHead className="h-8 w-[22%] text-left text-xs font-medium text-primary">{config.nameLabel}</TableHead>
                <TableHead className="h-8 w-[38%] text-left text-xs font-medium tabular-nums text-primary">日期</TableHead>
                <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">状态</TableHead>
                <TableHead className="h-8 w-[28%] pl-20 text-left text-xs font-medium text-primary">负责人</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">{config.emptyLabel}</div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="transition-colors hover:bg-layer-1">
                    <TableCell className="min-w-0 truncate text-sm text-primary" title={item.name}>
                      <a
                        href={config.getNavigateUrl(item.id, workspaceSlug, projectId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-left !text-primary visited:!text-primary hover:!text-primary hover:underline active:!text-primary"
                      >
                        {item.name}
                      </a>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-sm text-primary">
                      {formatStatisticTableDateRange(item.start_date, item.end_date)}
                    </TableCell>
                    <TableCell className="-ml-1 pl-0 text-left">{renderStatusCell(item)}</TableCell>
                    <TableCell
                      className="min-w-0 truncate pl-20 text-sm text-primary"
                      title={item.owner?.display_name ?? "-"}
                    >
                      {item.owner?.display_name ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {totalCount > MODAL_PAGE_SIZE && (
          <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-3">
            <span className="text-xs text-placeholder">共 {totalCount} 条</span>
            <Pagination
              current={page}
              pageSize={MODAL_PAGE_SIZE}
              total={totalCount}
              onChange={setPage}
              size="small"
              showSizeChanger={false}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
