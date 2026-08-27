"use client";

import { useState } from "react";
import { Modal, Pagination } from "antd";
import useSWR from "swr";
import { AlertTriangle, CircleCheck, Clock, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { generateWorkItemLink, getDate, renderFormattedDate } from "@plane/utils";
import {
  ProjectStatisticService,
  type TProjectOverviewWorkItem,
  type TProjectOverviewWorkItemMetric,
  type TProjectOverviewWorkItemResponse,
} from "@/services/project";

const projectStatisticService = new ProjectStatisticService();
const MODAL_PAGE_SIZE = 20;

export type OverviewWorkItemMetric = TProjectOverviewWorkItemMetric;

type Props = {
  open: boolean;
  onClose: () => void;
  metric: OverviewWorkItemMetric;
  workspaceSlug: string;
  projectId: string;
};

const METRIC_CONFIG: Record<
  OverviewWorkItemMetric,
  {
    title: string;
    icon: typeof CircleCheck;
    iconClassName: string;
    emptyLabel: string;
    dateLabel: string;
    getDateValue: (item: TProjectOverviewWorkItem) => string | null;
  }
> = {
  completed: {
    title: "已完成工作项",
    icon: CircleCheck,
    iconClassName: "text-success-primary",
    emptyLabel: "暂无已完成工作项",
    dateLabel: "完成时间",
    getDateValue: (item) => item.completed_at,
  },
  in_progress: {
    title: "进行中工作项",
    icon: Loader2,
    iconClassName: "text-accent-primary",
    emptyLabel: "暂无进行中工作项",
    dateLabel: "目标日期",
    getDateValue: (item) => item.target_date,
  },
  overdue: {
    title: "延期工作项",
    icon: AlertTriangle,
    iconClassName: "text-danger-primary",
    emptyLabel: "暂无延期工作项",
    dateLabel: "目标日期",
    getDateValue: (item) => item.target_date,
  },
  due_soon: {
    title: "临期工作项",
    icon: Clock,
    iconClassName: "text-warning-primary",
    emptyLabel: "暂无临期工作项",
    dateLabel: "目标日期",
    getDateValue: (item) => item.target_date,
  },
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

function formatDate(value: string | null) {
  return value ? renderFormattedDate(getDate(value), "yyyy/MM/dd") : "-";
}

function StateCell({ item }: { item: TProjectOverviewWorkItem }) {
  if (!item.state) return <span className="text-placeholder">-</span>;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-layer-1 px-2 py-1 text-11 text-secondary">
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.state.color }} />
      <span className="truncate">{item.state.name}</span>
    </span>
  );
}

function AssigneeCell({ item }: { item: TProjectOverviewWorkItem }) {
  const assigneeNames = item.assignees.map((assignee) => assignee.display_name || assignee.id).filter(Boolean);
  const displayValue = assigneeNames.length ? assigneeNames.join(", ") : "-";

  return (
    <span className="block truncate text-sm text-primary" title={displayValue}>
      {displayValue}
    </span>
  );
}

export function OverviewWorkItemListModal({ open, onClose, metric, workspaceSlug, projectId }: Props) {
  const [page, setPage] = useState(1);
  const config = METRIC_CONFIG[metric];
  const Icon = config.icon;

  const { data, isLoading } = useSWR<TProjectOverviewWorkItemResponse>(
    open ? `overview-work-item-modal-${metric}-${workspaceSlug}-${projectId}-${page}` : null,
    () =>
      projectStatisticService.getOverviewWorkItems(workspaceSlug, projectId, {
        metric,
        page,
        page_size: MODAL_PAGE_SIZE,
      }),
    { keepPreviousData: true }
  );

  const totalCount = data?.count ?? 0;
  const items = data?.data ?? [];

  const handleClose = () => {
    setPage(1);
    onClose();
  };

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <Icon className={`h-4 w-4 shrink-0 ${config.iconClassName}`} />
          <span className="text-base font-medium text-primary">{config.title}</span>
          <span className="text-sm text-placeholder">共 {totalCount} 条</span>
        </div>
      }
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={1200}
      destroyOnHidden
      styles={{ body: { padding: 0, overflow: "hidden" } }}
    >
      <div className="flex h-[78vh] max-h-[78vh] flex-col bg-surface-1">
        <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-auto px-4 pb-3">
          <Table className="min-w-[920px] table-fixed" wrapperClassName="overflow-visible">
            <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
              <TableRow>
                <TableHead className="h-8 w-[34%] text-left text-xs font-medium text-primary">工作项</TableHead>
                <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">类型</TableHead>
                <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-primary">状态</TableHead>
                <TableHead className="h-8 w-[10%] text-left text-xs font-medium text-primary">优先级</TableHead>
                <TableHead className="h-8 w-[16%] text-left text-xs font-medium text-primary">负责人</TableHead>
                <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-primary tabular-nums">
                  {config.dateLabel}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="grid h-14 place-items-center text-sm text-placeholder">{config.emptyLabel}</div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="transition-colors hover:bg-layer-1">
                    <TableCell className="min-w-0 text-sm text-primary">
                      <a
                        href={generateWorkItemLink({
                          workspaceSlug,
                          projectId: item.project_id,
                          issueId: item.id,
                          projectIdentifier: item.project_identifier,
                          sequenceId: item.sequence_id,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate !text-primary visited:!text-primary hover:!text-primary hover:underline active:!text-primary"
                        title={item.name}
                      >
                        <span className="mr-2 text-secondary">
                          {item.project_identifier}-{item.sequence_id}
                        </span>
                        {item.name}
                      </a>
                    </TableCell>
                    <TableCell className="truncate text-sm text-primary" title={item.type?.name ?? "-"}>
                      {item.type?.name ?? "-"}
                    </TableCell>
                    <TableCell>
                      <StateCell item={item} />
                    </TableCell>
                    <TableCell className="text-sm text-primary">
                      {PRIORITY_LABELS[item.priority] ?? item.priority ?? "-"}
                    </TableCell>
                    <TableCell className="min-w-0">
                      <AssigneeCell item={item} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-primary tabular-nums">
                      {formatDate(config.getDateValue(item))}
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
