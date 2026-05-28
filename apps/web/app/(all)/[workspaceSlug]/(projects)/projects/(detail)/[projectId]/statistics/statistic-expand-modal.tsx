"use client";

import { useState } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Pagination } from "antd";
import { Modal } from "antd";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ClipboardList,
  FileSearch,
  Package,
  Repeat,
} from "lucide-react";
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { getDate, renderFormattedDate } from "@plane/utils";
import { getReleaseStatusDetails as getReleaseStatusMeta } from "@/components/releases/release-status-config";
import { ProjectStatisticService, type TProjectStatisticResponse } from "@/services/project";

const projectStatisticService = new ProjectStatisticService();

const MODAL_PAGE_SIZE = 20;

export type StatisticSectionType = "cycle" | "release" | "plan" | "review";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  section: StatisticSectionType;
  workspaceSlug: string;
  projectId: string;
};

const CYCLE_STATUS_NORMALIZE_MAP: Record<string, string> = {
  未开始: "not_started",
  进行中: "in_progress",
  已延期: "delayed",
  已完成: "completed",
  已取消: "cancelled",
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
  StatisticSectionType,
  {
    title: string;
    icon: typeof Repeat;
    pageParamKey: string;
    dataKey: keyof TProjectStatisticResponse;
    columns: Array<{ key: string; label: string; width: string }>;
  }
> = {
  cycle: {
    title: "进行中的迭代",
    icon: Repeat,
    pageParamKey: "page",
    dataKey: "cycles",
    columns: [
      { key: "name", label: "迭代", width: "w-[28%]" },
      { key: "date", label: "日期", width: "w-[22%]" },
      { key: "status", label: "状态", width: "w-[14%]" },
      { key: "count", label: "工作项", width: "w-[14%]" },
      { key: "owner", label: "负责人", width: "w-[22%]" },
    ],
  },
  release: {
    title: "进行中的发布",
    icon: Package,
    pageParamKey: "release_page",
    dataKey: "releases",
    columns: [
      { key: "name", label: "发布", width: "w-[28%]" },
      { key: "date", label: "日期", width: "w-[22%]" },
      { key: "status", label: "状态", width: "w-[14%]" },
      { key: "count", label: "工作项", width: "w-[14%]" },
      { key: "owner", label: "负责人", width: "w-[22%]" },
    ],
  },
  plan: {
    title: "进行中的测试计划",
    icon: ClipboardList,
    pageParamKey: "plan_page",
    dataKey: "test_plans",
    columns: [
      { key: "name", label: "测试计划", width: "w-[28%]" },
      { key: "date", label: "日期", width: "w-[22%]" },
      { key: "status", label: "状态", width: "w-[14%]" },
      { key: "count", label: "用例", width: "w-[14%]" },
      { key: "owner", label: "负责人", width: "w-[22%]" },
    ],
  },
  review: {
    title: "进行中的评审",
    icon: FileSearch,
    pageParamKey: "review_page",
    dataKey: "case_reviews",
    columns: [
      { key: "name", label: "评审", width: "w-[28%]" },
      { key: "date", label: "日期", width: "w-[22%]" },
      { key: "status", label: "状态", width: "w-[14%]" },
      { key: "type", label: "类型", width: "w-[14%]" },
      { key: "owner", label: "负责人", width: "w-[22%]" },
    ],
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

function getNavigateUrl(
  section: StatisticSectionType,
  itemId: string,
  workspaceSlug: string,
  projectId: string
): string {
  const base = `/${workspaceSlug}/projects/${projectId}`;
  switch (section) {
    case "cycle":
      return `${base}/cycles/${itemId}`;
    case "release":
      return `${base}/releases/${itemId}/overview`;
    case "plan":
      return `${base}/testhub/plan-cases?planId=${itemId}`;
    case "review":
      return `${base}/testhub/caseManagementReviewDetail?review_id=${itemId}`;
  }
}

export function StatisticExpandModal({ isOpen, onClose, section, workspaceSlug, projectId }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [page, setPage] = useState(1);

  const config = SECTION_CONFIG[section];
  const Icon = config.icon;

  const { data, isLoading } = useSWR<TProjectStatisticResponse>(
    isOpen ? `statistic-modal-${section}-${workspaceSlug}-${projectId}-${page}` : null,
    () =>
      projectStatisticService.getStatistic(workspaceSlug, projectId, {
        [config.pageParamKey]: page,
        page_size: MODAL_PAGE_SIZE,
      }),
    { keepPreviousData: true }
  );

  const sectionData = data?.[config.dataKey] as { count: number; data: any[] } | undefined;
  const totalCount = sectionData?.count ?? 0;
  const items = sectionData?.data ?? [];

  const handleClose = () => {
    setPage(1);
    onClose();
  };

  const renderStatusCell = (item: any) => {
    if (section === "cycle") {
      const details = getCycleStatusDetails(item.status);
      return (
        <span className={getStatisticStatusTagClassName(details.textColor)}>
          {t(details.i18n_title)}
        </span>
      );
    }
    if (section === "release") {
      const details = getModuleStatusDetails(item.status);
      return (
        <span className={getStatisticStatusTagClassName(details.textColor)}>
          {details.label}
        </span>
      );
    }
    const details = getQaStatusDetails(item.status);
    return (
      <span className={getStatisticStatusTagClassName(details.textColor)}>
        {item.status ?? "-"}
      </span>
    );
  };

  const renderLastColumn = (item: any) => {
    if (section === "review") return <span className="text-sm">用例评审</span>;
    return <span className="text-sm">{item.work_item_count ?? item.case_count ?? 0}</span>;
  };

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-3 pr-2">
          <Icon className="h-4 w-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">{config.title}</span>
          <span className="text-sm font-normal text-placeholder">共 {totalCount} 个</span>
        </div>
      }
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      closable
      closeIcon={
        <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
          <CloseOutlined className="text-base text-inherit" />
          <span>退出全屏</span>
        </span>
      }
      centered={false}
      width="100%"
      style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
      className="[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto"
      classNames={{ wrapper: "!p-0", header: "!mb-0 border-b border-subtle" }}
      styles={{
        content: {
          height: "100vh",
          maxHeight: "100vh",
          borderRadius: 0,
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          margin: 0,
        },
        header: {
          flexShrink: 0,
          margin: 0,
          borderRadius: 0,
          padding: "16px 20px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
          <Table wrapperClassName="overflow-visible">
            <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
              <TableRow>
                {config.columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={`h-8 ${col.width} text-left text-xs font-medium text-placeholder${col.key === "owner" ? " pl-6" : ""}`}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={config.columns.length}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={config.columns.length}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">暂无数据</div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item: any) => {
                  return (
                    <TableRow key={item.id} className="transition-colors hover:bg-layer-1">
                      <TableCell
                        className="max-w-[280px] truncate text-sm text-primary"
                        title={item.name}
                      >
                        <button
                          type="button"
                          className="truncate hover:underline text-left"
                          onClick={() => router.push(getNavigateUrl(section, item.id, workspaceSlug, projectId))}
                        >
                          {item.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-primary">
                        {formatStatisticTableDateRange(item.start_date, item.end_date)}
                      </TableCell>
                      <TableCell className="pl-0 -ml-1 text-left">{renderStatusCell(item)}</TableCell>
                      <TableCell className="text-sm text-primary">
                        {renderLastColumn(item)}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate pl-6 text-sm text-primary" title={item.owner?.display_name ?? "-"}>
                        {item.owner?.display_name ?? "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
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
