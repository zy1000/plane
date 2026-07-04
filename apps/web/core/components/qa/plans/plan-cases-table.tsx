/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Button, Popconfirm } from "antd";
import { Checkbox } from "@plane/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TPlanCaseItem } from "@/services/qa/plan.service";
import type { TPlanCaseDisplayProperties } from "./plan-case-display-filters";

type TResizableHeadProps = {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  onResize?: (width: number) => void;
  style?: CSSProperties;
};

type TPlanCasesTableProps = {
  bulkAssigneeUpdating?: boolean;
  cases: TPlanCaseItem[];
  columnWidths: Record<string, number>;
  currentUserId?: string;
  displayProperties: TPlanCaseDisplayProperties;
  onAssigneeChange: (planCaseId: string, assignee: string | null) => void;
  onCancelRelation: (planCaseId: string) => void;
  onOpenCase: (caseId?: string) => void;
  onRowSelectChange: (selectedKeysOnCurrentPage: string[]) => void;
  onViewExecution: (record: TPlanCaseItem) => void;
  projectId?: string;
  renderPriorityTag: (value?: number | null) => ReactNode;
  renderResultTag: (value?: string) => ReactNode;
  renderTypeTag: (value?: number | null) => ReactNode;
  renderUpdatedAt: (value?: string | null) => ReactNode;
  selectedPlanCaseIds: string[];
  setColumnWidth: (key: string, width: number) => void;
  updatingAssigneePlanCaseId?: string | null;
};

const ResizableHead = ({ children, className, minWidth = 80, onResize, style }: TResizableHeadProps) => {
  const thRef = useRef<HTMLTableCellElement>(null);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onResize || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = thRef.current?.getBoundingClientRect().width ?? 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      onResize(Math.round(Math.max(minWidth, startWidth + delta)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <TableHead
      ref={thRef}
      className={cn(
        "relative h-12 border-r border-b border-subtle px-page-x py-0 align-middle text-13 font-medium text-secondary",
        className
      )}
      style={style}
    >
      {children}
      {onResize && (
        <div
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
          onMouseDown={handleMouseDown}
          role="presentation"
        />
      )}
    </TableHead>
  );
};

export const PlanCasesTable = ({
  bulkAssigneeUpdating = false,
  cases,
  columnWidths,
  currentUserId,
  displayProperties,
  onAssigneeChange,
  onCancelRelation,
  onOpenCase,
  onRowSelectChange,
  onViewExecution,
  projectId,
  renderPriorityTag,
  renderResultTag,
  renderTypeTag,
  renderUpdatedAt,
  selectedPlanCaseIds,
  setColumnWidth,
  updatingAssigneePlanCaseId,
}: TPlanCasesTableProps) => {
  const selectedKeySet = useMemo(
    () => new Set(selectedPlanCaseIds.map((id) => String(id))),
    [selectedPlanCaseIds]
  );
  const currentPageIds = useMemo(() => cases.map((item) => String(item.id)), [cases]);
  const selectedOnCurrentPage = useMemo(
    () => currentPageIds.filter((id) => selectedKeySet.has(id)),
    [currentPageIds, selectedKeySet]
  );

  const allSelectedOnCurrentPage = currentPageIds.length > 0 && selectedOnCurrentPage.length === currentPageIds.length;
  const isIndeterminate = selectedOnCurrentPage.length > 0 && !allSelectedOnCurrentPage;

  const handleSelectAllOnPage = (checked: boolean) => {
    onRowSelectChange(checked ? currentPageIds : []);
  };

  const handleSelectRow = (planCaseId: string, checked: boolean) => {
    const nextSelected = checked
      ? Array.from(new Set([...selectedOnCurrentPage, planCaseId]))
      : selectedOnCurrentPage.filter((id) => id !== planCaseId);
    onRowSelectChange(nextSelected);
  };

  const getWidthStyle = (key: string, fallback: number): CSSProperties => ({
    width: columnWidths[key] ?? fallback,
    minWidth: columnWidths[key] ?? fallback,
  });

  const isColumnVisible = (key: keyof TPlanCaseDisplayProperties) => displayProperties?.[key] ?? true;

  const visibleContentColumnCount = Object.entries(displayProperties).filter(([, isVisible]) => isVisible).length;
  const emptyColSpan = visibleContentColumnCount + 2;

  return (
    <Table
      className="min-w-full table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
      wrapperClassName="h-full overflow-auto testhub-plan-cases-table-scroll scrollbar-always-visible"
    >
      <TableHeader className="sticky top-0 z-[2] bg-layer-1">
        <TableRow>
          <TableHead className="h-12 w-10 min-w-10 border-r border-b border-subtle px-0 py-0">
            <div className="flex h-12 w-full items-center justify-center">
              <Checkbox
                checked={allSelectedOnCurrentPage}
                indeterminate={isIndeterminate}
                onChange={(event) => handleSelectAllOnPage(event.target.checked)}
              />
            </div>
          </TableHead>

          {isColumnVisible("code") && (
            <ResizableHead style={getWidthStyle("code", 150)} onResize={(width) => setColumnWidth("code", width)}>
              用例编号
            </ResizableHead>
          )}

          {isColumnVisible("name") && (
            <ResizableHead style={getWidthStyle("name", 260)} onResize={(width) => setColumnWidth("name", width)}>
              用例名称
            </ResizableHead>
          )}

          {isColumnVisible("repository") && (
            <ResizableHead
              style={getWidthStyle("repository", 150)}
              onResize={(width) => setColumnWidth("repository", width)}
            >
              用例库
            </ResizableHead>
          )}

          {isColumnVisible("module") && (
            <ResizableHead style={getWidthStyle("module", 140)} onResize={(width) => setColumnWidth("module", width)}>
              模块
            </ResizableHead>
          )}

          {isColumnVisible("assignee") && (
            <ResizableHead
              style={getWidthStyle("assignee", 170)}
              onResize={(width) => setColumnWidth("assignee", width)}
            >
              执行人
            </ResizableHead>
          )}

          {isColumnVisible("type") && (
            <ResizableHead style={getWidthStyle("type", 100)} onResize={(width) => setColumnWidth("type", width)}>
              类型
            </ResizableHead>
          )}

          {isColumnVisible("priority") && (
            <ResizableHead
              style={getWidthStyle("priority", 100)}
              onResize={(width) => setColumnWidth("priority", width)}
            >
              优先级
            </ResizableHead>
          )}

          {isColumnVisible("result") && (
            <ResizableHead style={getWidthStyle("result", 120)} onResize={(width) => setColumnWidth("result", width)}>
              执行结果
            </ResizableHead>
          )}

          {isColumnVisible("updated_at") && (
            <ResizableHead
              style={getWidthStyle("updated_at", 180)}
              onResize={(width) => setColumnWidth("updated_at", width)}
            >
              更新时间
            </ResizableHead>
          )}

          <ResizableHead className="sticky right-0 z-[3] border-l bg-layer-1" style={getWidthStyle("actions", 140)}>
            操作
          </ResizableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {cases.length === 0 && (
          <TableRow>
            <TableCell colSpan={emptyColSpan} className="h-32 border-r border-b border-subtle text-center text-secondary">
              暂无计划用例
            </TableCell>
          </TableRow>
        )}

        {cases.map((record) => {
          const recordId = String(record.id);
          const caseId = record.case?.id ? String(record.case.id) : undefined;
          const isAssignedToCurrentUser =
            Boolean(record?.assignee) && Boolean(currentUserId) && String(record.assignee) === String(currentUserId);
          const actionLabel = isAssignedToCurrentUser ? "执行" : "查看";

          return (
            <TableRow key={recordId} className="group h-12 bg-surface-1 transition-colors hover:bg-surface-2">
              <TableCell className="h-12 w-10 min-w-10 border-r border-b border-subtle px-0 py-0">
                <div className="flex h-12 w-full items-center justify-center">
                  <Checkbox
                    checked={selectedKeySet.has(recordId)}
                    onChange={(event) => handleSelectRow(recordId, event.target.checked)}
                  />
                </div>
              </TableCell>

              {isColumnVisible("code") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("code", 150)}
                >
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, (columnWidths.code ?? 150) - 20) }}
                    title={record.case?.code || ""}
                    onClick={() => onOpenCase(caseId)}
                  >
                    {record.case?.code || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("name") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("name", 260)}
                >
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, (columnWidths.name ?? 260) - 20) }}
                    title={record.case?.name || ""}
                    onClick={() => onOpenCase(caseId)}
                  >
                    {record.case?.name || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("repository") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("repository", 150)}
                >
                  <span
                    className="block truncate"
                    style={{ maxWidth: Math.max(40, (columnWidths.repository ?? 150) - 20) }}
                    title={record.case?.repository_name || ""}
                  >
                    {record.case?.repository_name || "-"}
                  </span>
                </TableCell>
              )}

              {isColumnVisible("module") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("module", 140)}
                >
                  <span
                    className="block truncate"
                    style={{ maxWidth: Math.max(40, (columnWidths.module ?? 140) - 20) }}
                    title={record.case?.module || ""}
                  >
                    {record.case?.module || "-"}
                  </span>
                </TableCell>
              )}

              {isColumnVisible("assignee") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("assignee", 170)}
                >
                  <MemberDropdown
                    multiple={false}
                    value={record?.assignee ?? null}
                    onChange={(value) => onAssigneeChange(recordId, value ? String(value) : null)}
                    disabled={bulkAssigneeUpdating || updatingAssigneePlanCaseId === recordId}
                    projectId={projectId}
                    placeholder="请选择执行人"
                    className="w-full text-sm"
                    buttonContainerClassName="w-full text-left p-0"
                    buttonVariant="transparent-with-text"
                    buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                    showUserDetails
                    optionsClassName="z-[80]"
                  />
                </TableCell>
              )}

              {isColumnVisible("type") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("type", 100)}
                >
                  {renderTypeTag(record.case?.type)}
                </TableCell>
              )}

              {isColumnVisible("priority") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("priority", 100)}
                >
                  {renderPriorityTag(record.case?.priority)}
                </TableCell>
              )}

              {isColumnVisible("result") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("result", 120)}
                >
                  {renderResultTag(record.result)}
                </TableCell>
              )}

              {isColumnVisible("updated_at") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("updated_at", 180)}
                >
                  {renderUpdatedAt(record.case?.updated_at)}
                </TableCell>
              )}

              <TableCell
                className="sticky right-0 z-[1] h-12 border-r border-b border-l border-subtle bg-surface-1 px-page-x py-0 group-hover:bg-surface-2"
                style={getWidthStyle("actions", 140)}
              >
                <div className="flex items-center gap-2">
                  <Button size="small" type="link" className="px-0" onClick={() => onViewExecution(record)}>
                    {actionLabel}
                  </Button>
                  <Popconfirm
                    title="确定取关该用例？"
                    onConfirm={() => onCancelRelation(recordId)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button size="small" type="link" danger className="px-0">
                      取关
                    </Button>
                  </Popconfirm>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
