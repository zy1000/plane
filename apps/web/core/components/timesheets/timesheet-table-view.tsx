/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import {
  Beaker,
  Bug,
  ClipboardCheck,
  Clock,
  FolderOpen,
  Layers,
  ListTodo,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@plane/utils";
import { getCategoryIconName, TIMESHEET_CATEGORY_KEY } from "@/constants/timesheet-category";
import { useProject } from "@/hooks/store/use-project";
import { TimesheetCellPopover } from "./timesheet-cell-popover";
import { TimesheetRowAddModal } from "./timesheet-row-add-modal";
import { formatDateKey, isDateEditable, type TTimesheetRow } from "@/hooks/store/use-timesheet-page";
import type { useTimesheetPage } from "@/hooks/store/use-timesheet-page";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";

const WEEK_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TASK_COLUMN_WIDTH_CLASS = "w-[320px] min-w-[320px] max-w-[320px]";

function formatHours(hours: number): string {
  if (hours === 0) return "—";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDayHeader(date: Date): { dayLabel: string; dateLabel: string } {
  const day = WEEK_DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  const dateLabel = formatDateKey(date).replace(/-/g, "/");
  return { dayLabel: day, dateLabel };
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Clock,
  Layers,
  ClipboardCheck,
  Beaker,
  Target,
  ListTodo,
  Bug,
};

// 工作项子类别 → 行首图标（仅影响视觉区分，不影响数据）。
const ISSUE_CATEGORY_STYLE: Record<string, { color: string; icon: LucideIcon }> = {
  [TIMESHEET_CATEGORY_KEY.REQUIREMENT]: { color: "#0ea5e9", icon: Target },
  [TIMESHEET_CATEGORY_KEY.TASK]: { color: "#14b8a6", icon: ListTodo },
  [TIMESHEET_CATEGORY_KEY.BUG]: { color: "#ef4444", icon: Bug },
};

function getRowKindMeta(row: TTimesheetRow) {
  const fallbackLabel = row.categoryName ?? "项目";
  const iconName = getCategoryIconName(row.categoryKey);
  const Icon = ICON_BY_NAME[iconName] ?? Clock;

  if (row.type === "issue") {
    const style = row.categoryKey ? ISSUE_CATEGORY_STYLE[row.categoryKey] : undefined;
    return {
      icon: style?.icon ?? Layers,
      label: row.categoryName ?? "工作项工时",
      color: style?.color,
    };
  }
  if (row.type === "test_case") {
    return { icon: ClipboardCheck, label: row.categoryName ?? "测试工时", color: "#f59e0b" };
  }
  if (row.categoryKey === TIMESHEET_CATEGORY_KEY.SAMPLE) {
    return { icon: Beaker, label: fallbackLabel, color: "#a855f7" };
  }
  if (row.categoryKey === TIMESHEET_CATEGORY_KEY.PROJECT) {
    return { icon: FolderOpen, label: fallbackLabel, color: "#3b82f6" };
  }
  return { icon: Icon, label: fallbackLabel, color: "#64748b" };
}

type TTimesheetTableViewProps = {
  timesheetPage: ReturnType<typeof useTimesheetPage>;
  workspaceSlug: string;
  currentUserId?: string;
};

export const TimesheetTableView = observer(function TimesheetTableView({
  timesheetPage,
  workspaceSlug,
  currentUserId,
}: TTimesheetTableViewProps) {
  const {
    rows,
    weekDays,
    getCellHours,
    getDayTotalHours,
    getTimesheetsForCell,
    getTimesheetsForDate,
    createTimesheet,
    deleteTimesheet,
    addRow,
    removeRow,
    totalWeekHours,
    isLoading,
    isWeekFullyReadOnly,
  } = timesheetPage;

  const { getProjectById } = useProject();
  const [addModalOpen, setAddModalOpen] = useState(false);

  const today = formatDateKey(new Date());

  const getRowProjectLabel = (projectId: string): string => {
    const project = getProjectById(projectId);
    return project?.identifier || project?.name || "";
  };

  const getRowDisplayName = (row: (typeof rows)[0]): string => {
    if (row.type === "project") {
      const project = getProjectById(row.projectId);
      const projectLabel = project?.name || row.projectName || "项目";
      const categoryLabel = row.categoryName || "项目工时";
      return `${projectLabel} · ${categoryLabel}`;
    }
    return row.displayName;
  };

  return (
    <div className="flex flex-col h-full w-full">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[720px]">
          {/* 表头 */}
          <thead>
            <tr className="border-b border-subtle bg-layer-2">
              <th
                className={`sticky left-0 z-10 bg-layer-2 px-4 py-2.5 text-left text-sm font-semibold text-tertiary border-r border-subtle ${TASK_COLUMN_WIDTH_CLASS}`}
              >
                任务
              </th>
              {weekDays.map((date) => {
                const key = formatDateKey(date);
                const { dayLabel, dateLabel } = formatDayHeader(date);
                const isToday = key === today;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const editable = isDateEditable(key);
                return (
                  <th
                    key={key}
                    className={cn(
                      "px-2 py-2.5 text-center text-sm font-semibold border-r border-subtle min-w-[88px]",
                      !editable ? "bg-layer-1/60 text-placeholder" : isToday ? "bg-accent-primary/5 text-accent-primary" : isWeekend ? "bg-layer-1 text-tertiary" : "text-tertiary"
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={cn("font-semibold text-sm", !editable ? "text-placeholder" : isToday && "text-accent-primary")}>{dayLabel}</span>
                      <span className={cn("text-sm", !editable ? "text-placeholder" : isToday ? "text-accent-primary" : "text-tertiary")}>{dateLabel}</span>
                    </div>
                  </th>
                );
              })}
              <th className="px-3 py-2.5 text-center text-sm font-semibold text-tertiary min-w-[72px]">
                合计
              </th>
            </tr>
          </thead>

          {/* 任务行 */}
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-sm text-tertiary"
                >
                  {isLoading ? "加载中…" : '暂无任务行，点击下方"+ 添加任务"按钮开始记录工时'}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const rowWeekHours = weekDays.reduce((sum, date) => {
                return sum + getCellHours(row, formatDateKey(date));
              }, 0);
              const rowKind = getRowKindMeta(row);
              const projectLabel = getRowProjectLabel(row.projectId);
              const displayName = getRowDisplayName(row);

              return (
                <tr key={row.id} className="group border-b border-subtle hover:bg-layer-1/40 transition-colors">
                  {/* 任务名称列 */}
                  <td
                    className={cn(
                      "sticky left-0 z-10 bg-surface-1 group-hover:bg-layer-1/40 px-4 py-2 border-r border-subtle",
                      TASK_COLUMN_WIDTH_CLASS
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center self-center">
                          {row.type === "issue" ? (
                            <WorkItemTypeIcon
                              typeName={row.issueTypeName}
                              className="h-5 w-5"
                              size={20}
                              plain
                              title={row.issueTypeName ?? "工作项工时"}
                            />
                          ) : (
                            <span
                              className="inline-flex size-full items-center justify-center"
                              style={{ color: rowKind.color }}
                              aria-label={rowKind.label}
                              title={rowKind.label}
                            >
                              <rowKind.icon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                        {projectLabel ? (
                          <span className="shrink-0 rounded bg-layer-1 px-1.5 py-0.5 text-xs font-mono font-medium text-tertiary">
                            {projectLabel}
                          </span>
                        ) : null}
                        <span className="text-sm text-primary truncate" title={displayName}>
                          {displayName}
                        </span>
                      </div>
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {rowWeekHours <= 0 ? (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="pointer-events-none flex h-5 w-5 items-center justify-center rounded text-tertiary opacity-0 transition-all hover:text-red-400 hover:bg-red-50 group-hover:pointer-events-auto group-hover:opacity-100 cursor-pointer"
                            aria-label="移除任务行"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  {/* 日期单元格 */}
                  {weekDays.map((date) => {
                    const key = formatDateKey(date);
                    const cellHours = getCellHours(row, key);
                    const cellTimesheets = getTimesheetsForCell(row, key);
                    const dayTimesheets = getTimesheetsForDate(key);
                    const isToday = key === today;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const editable = isDateEditable(key);
                    return (
                      <td
                        key={key}
                        className={cn(
                          "px-1 py-1.5 text-center border-r border-subtle",
                          !editable ? "bg-layer-1/60" : isToday ? "bg-accent-primary/5" : isWeekend ? "bg-layer-1/50" : ""
                        )}
                      >
                        <TimesheetCellPopover
                          date={key}
                          existingTimesheets={cellTimesheets}
                          dayTimesheets={dayTimesheets}
                          currentUserId={currentUserId}
                          issueId={row.type === "issue" ? row.issueId : undefined}
                          testCaseId={row.type === "test_case" ? row.testCaseId : undefined}
                          categoryId={row.categoryId}
                          hours={cellHours}
                          readOnly={!editable}
                          onCreate={(data) => createTimesheet(row.projectId, data)}
                          onDelete={deleteTimesheet}
                        >
                          <div
                            className={cn(
                              "flex items-center justify-center h-8 w-full rounded text-sm font-semibold transition-colors select-none",
                              !editable
                                ? cellHours > 0 ? "text-tertiary" : "text-placeholder"
                                : cellHours > 0
                                  ? "text-accent-primary bg-accent-primary/10 hover:bg-accent-primary/20 cursor-pointer"
                                  : "text-tertiary hover:bg-layer-1 hover:text-secondary cursor-pointer"
                            )}
                          >
                            {cellHours > 0 ? formatHours(cellHours) : !editable ? "—" : <Plus className="h-3.5 w-3.5 opacity-40 group-hover:opacity-80" />}
                          </div>
                        </TimesheetCellPopover>
                      </td>
                    );
                  })}

                  {/* 行合计 */}
                  <td className="px-3 py-2 text-center">
                    <span className={cn("text-sm font-semibold", rowWeekHours > 0 ? "text-primary" : "text-tertiary")}>
                      {formatHours(rowWeekHours)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* 底部：添加按钮行 + 合计行 */}
          <tfoot>
            <tr className="border-b border-subtle">
              <td className={cn("sticky left-0 z-10 bg-surface-1 px-4 py-2 border-r border-subtle", TASK_COLUMN_WIDTH_CLASS)} colSpan={1}>
                {!isWeekFullyReadOnly && (
                  <button
                    onClick={() => setAddModalOpen(true)}
                    className="flex items-center gap-1.5 text-sm text-tertiary hover:text-accent-primary transition-colors group cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 group-hover:text-accent-primary" />
                    <span>添加任务</span>
                  </button>
                )}
              </td>
              {weekDays.map((date) => (
                <td key={formatDateKey(date)} className="border-r border-subtle" />
              ))}
              <td />
            </tr>
            <tr className="bg-layer-2">
              <td className={cn("sticky left-0 z-10 bg-layer-2 px-4 py-2.5 border-r border-subtle", TASK_COLUMN_WIDTH_CLASS)}>
                <span className="text-sm font-semibold text-tertiary">合计</span>
              </td>
              {weekDays.map((date) => {
                const key = formatDateKey(date);
                const dayHours = getDayTotalHours(key);
                const isToday = key === today;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <td
                    key={key}
                    className={cn(
                      "px-2 py-2.5 text-center border-r border-subtle",
                      isToday ? "bg-accent-primary/5" : isWeekend ? "bg-layer-1/50" : ""
                    )}
                  >
                    <span className={cn("text-sm font-semibold", dayHours > 0 ? "text-primary" : "text-tertiary")}>
                      {formatHours(dayHours)}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-center">
                <span className={cn("text-sm font-semibold", totalWeekHours > 0 ? "text-primary" : "text-tertiary")}>
                  {formatHours(totalWeekHours)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <TimesheetRowAddModal
        open={addModalOpen}
        workspaceSlug={workspaceSlug}
        onAdd={addRow}
        onClose={() => setAddModalOpen(false)}
      />
    </div>
  );
});
