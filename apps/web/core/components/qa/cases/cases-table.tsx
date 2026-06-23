/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { Tag } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Checkbox } from "@plane/ui";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TCaseDisplayProperties } from "@/components/qa/cases/cases-display-filters";

type TModule = {
  name?: string;
};

type TLabel =
  | {
      id?: string;
      name?: string;
    }
  | string;

export type TCaseTableRecord = {
  id: string;
  assignee?: {
    id?: string;
  };
  code?: string;
  labels?: TLabel[];
  latest_execution_plan_id?: string | null;
  latest_execution_result?: string;
  module?: TModule;
  name: string;
  priority?: number;
  review?: string;
  type?: number;
  updated_at?: string;
};

type TResizableHeadProps = {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  onResize?: (width: number) => void;
  style?: CSSProperties;
};

type TCasesTableProps = {
  cases: TCaseTableRecord[];
  columnWidths: Record<string, number>;
  displayProperties: TCaseDisplayProperties;
  onDelete: (record: TCaseTableRecord) => void;
  onEdit: (record: TCaseTableRecord) => void;
  onRowSelectChange: (selectedKeysOnCurrentPage: string[]) => void;
  onViewCase: (record: TCaseTableRecord) => void;
  renderLastExecutionResult: (record: TCaseTableRecord) => ReactNode;
  renderPriorityTag: (value?: number) => ReactNode;
  renderReviewTag: (value?: string) => ReactNode;
  renderTypeTag: (value?: number) => ReactNode;
  renderUpdatedAt: (value?: string) => ReactNode;
  selectedCaseIds: string[];
  setColumnWidth: (key: string, width: number) => void;
};

const ResizableHead = ({
  children,
  className,
  minWidth = 80,
  onResize,
  style,
}: TResizableHeadProps) => {
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
        "relative h-12 border-b border-r border-subtle px-page-x py-0 text-13 font-medium text-secondary align-middle",
        className
      )}
      style={style}
    >
      {children}
      {onResize && (
        <div
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
          onMouseDown={handleMouseDown}
          role="presentation"
        />
      )}
    </TableHead>
  );
};

export const CasesTable = ({
  cases,
  columnWidths,
  displayProperties,
  onDelete,
  onEdit,
  onRowSelectChange,
  onViewCase,
  renderLastExecutionResult,
  renderPriorityTag,
  renderReviewTag,
  renderTypeTag,
  renderUpdatedAt,
  selectedCaseIds,
  setColumnWidth,
}: TCasesTableProps) => {
  const selectedKeySet = useMemo(() => new Set(selectedCaseIds.map((id) => String(id))), [selectedCaseIds]);
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

  const handleSelectRow = (caseId: string, checked: boolean) => {
    const nextSelected = checked
      ? Array.from(new Set([...selectedOnCurrentPage, caseId]))
      : selectedOnCurrentPage.filter((id) => id !== caseId);
    onRowSelectChange(nextSelected);
  };

  const getWidthStyle = (key: string, fallback: number): CSSProperties => ({
    width: columnWidths[key] ?? fallback,
    minWidth: columnWidths[key] ?? fallback,
  });

  const isColumnVisible = (key: keyof TCaseDisplayProperties) => displayProperties?.[key] ?? true;

  const renderLabels = (labels?: TLabel[]) => {
    if (!labels || labels.length === 0) return <span className="text-placeholder">-</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {labels.map((label, index) => {
          const text = typeof label === "string" ? label : label?.name || "-";
          const key = typeof label === "string" ? `${label}-${index}` : `${(label?.id || index).toString()}-${index}`;
          return (
            <Tag key={key} color="blue">
              {text}
            </Tag>
          );
        })}
      </div>
    );
  };

  return (
    <Table
      className="min-w-full table-fixed border-separate border-spacing-0 border-l border-t border-subtle"
      wrapperClassName="h-full overflow-auto testhub-cases-table-scroll scrollbar-always-visible"
    >
      <TableHeader className="sticky top-0 z-[2] bg-layer-1">
        <TableRow>
          <TableHead className="h-12 w-10 min-w-10 border-b border-r border-subtle px-0 py-0">
            <div className="flex h-12 w-full items-center justify-center">
              <Checkbox
                checked={allSelectedOnCurrentPage}
                indeterminate={isIndeterminate}
                onChange={(event) => handleSelectAllOnPage(event.target.checked)}
              />
            </div>
          </TableHead>

          {isColumnVisible("code") && (
            <ResizableHead style={getWidthStyle("code", 160)} onResize={(width) => setColumnWidth("code", width)}>
              用例编号
            </ResizableHead>
          )}

          {isColumnVisible("name") && (
            <ResizableHead style={getWidthStyle("name", 340)} onResize={(width) => setColumnWidth("name", width)}>
              名称
            </ResizableHead>
          )}

          {isColumnVisible("review") && (
            <ResizableHead style={getWidthStyle("review", 100)} onResize={(width) => setColumnWidth("review", width)}>
              评审
            </ResizableHead>
          )}

          {isColumnVisible("type") && (
            <ResizableHead style={getWidthStyle("type", 110)} onResize={(width) => setColumnWidth("type", width)}>
              类型
            </ResizableHead>
          )}

          {isColumnVisible("priority") && (
            <ResizableHead style={getWidthStyle("priority", 100)} onResize={(width) => setColumnWidth("priority", width)}>
              优先级
            </ResizableHead>
          )}

          {isColumnVisible("module") && (
            <ResizableHead style={getWidthStyle("module", 120)} onResize={(width) => setColumnWidth("module", width)}>
              模块
            </ResizableHead>
          )}

          {isColumnVisible("last_execution_result") && (
            <ResizableHead
              style={getWidthStyle("last_execution_result", 140)}
              onResize={(width) => setColumnWidth("last_execution_result", width)}
            >
              最近执行结果
            </ResizableHead>
          )}

          {isColumnVisible("assignee") && (
            <ResizableHead style={getWidthStyle("assignee", 150)} onResize={(width) => setColumnWidth("assignee", width)}>
              维护人
            </ResizableHead>
          )}

          {isColumnVisible("labels") && (
            <ResizableHead style={getWidthStyle("labels", 130)} onResize={(width) => setColumnWidth("labels", width)}>
              标签
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

          <ResizableHead className="sticky right-0 z-[3] border-l bg-layer-1" style={getWidthStyle("actions", 110)}>
            操作
          </ResizableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {cases.map((record) => {
          const recordId = String(record.id);
          const codeWidth = columnWidths.code ?? 160;
          const nameWidth = columnWidths.name ?? 340;

          return (
            <TableRow key={recordId} className="group h-12 bg-surface-1 transition-colors hover:bg-surface-2">
              <TableCell className="h-12 w-10 min-w-10 border-b border-r border-subtle px-0 py-0">
                <div className="flex h-12 w-full items-center justify-center">
                  <Checkbox
                    checked={selectedKeySet.has(recordId)}
                    onChange={(event) => handleSelectRow(recordId, event.target.checked)}
                  />
                </div>
              </TableCell>

              {isColumnVisible("code") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("code", 160)}>
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, codeWidth - 20) }}
                    title={record.code || ""}
                    onClick={() => onViewCase(record)}
                  >
                    {record.code || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("name") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("name", 340)}>
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, nameWidth - 20) }}
                    title={record.name || ""}
                    onClick={() => onViewCase(record)}
                  >
                    {record.name || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("review") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("review", 100)}>
                  {renderReviewTag(record.review)}
                </TableCell>
              )}
              {isColumnVisible("type") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("type", 110)}>
                  {renderTypeTag(record.type)}
                </TableCell>
              )}
              {isColumnVisible("priority") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("priority", 100)}>
                  {renderPriorityTag(record.priority)}
                </TableCell>
              )}
              {isColumnVisible("module") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("module", 120)}>
                  {record.module?.name || "-"}
                </TableCell>
              )}
              {isColumnVisible("last_execution_result") && (
                <TableCell
                  className="h-12 border-b border-r border-subtle px-page-x py-0"
                  style={getWidthStyle("last_execution_result", 140)}
                >
                  {renderLastExecutionResult(record)}
                </TableCell>
              )}

              {isColumnVisible("assignee") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("assignee", 150)}>
                  {record.assignee?.id ? (
                    <MemberDropdown
                      multiple={false}
                      value={record.assignee.id}
                      onChange={() => {}}
                      disabled
                      placeholder=""
                      className="w-full text-sm"
                      buttonContainerClassName="w-full text-left p-0 cursor-default"
                      buttonVariant="transparent-with-text"
                      buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                      showUserDetails
                      optionsClassName="z-[60]"
                    />
                  ) : (
                    "-"
                  )}
                </TableCell>
              )}

              {isColumnVisible("labels") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("labels", 130)}>
                  {renderLabels(record.labels)}
                </TableCell>
              )}
              {isColumnVisible("updated_at") && (
                <TableCell className="h-12 border-b border-r border-subtle px-page-x py-0" style={getWidthStyle("updated_at", 180)}>
                  {renderUpdatedAt(record.updated_at)}
                </TableCell>
              )}

              <TableCell
                className="sticky right-0 z-[1] h-12 border-b border-l border-r border-subtle bg-surface-1 px-page-x py-0 group-hover:bg-surface-2"
                style={getWidthStyle("actions", 110)}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-secondary transition-colors hover:text-primary"
                    onClick={() => onEdit(record)}
                    aria-label="编辑用例"
                  >
                    <EditOutlined />
                  </button>
                  <button
                    type="button"
                    className="text-red-500 transition-colors hover:text-red-600"
                    onClick={() => onDelete(record)}
                    aria-label="删除用例"
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
