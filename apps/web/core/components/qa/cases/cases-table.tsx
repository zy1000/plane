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
import type { TCaseDisplayProperties, TCaseDisplayPropertyKey } from "@/components/qa/cases/cases-display-filters";

const SELECT_HOST_ORDER: TCaseDisplayPropertyKey[] = [
  "code",
  "name",
  "review",
  "type",
  "priority",
  "module",
  "last_execution_result",
  "assignee",
  "labels",
  "updated_at",
];

const SELECT_HOST_PAD_CLASS = "pl-10 pr-page-x";

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
  hostSelect?: boolean;
  minWidth?: number;
  onResize?: (width: number) => void;
  style?: CSSProperties;
};

type TCasesTableProps = {
  canDelete?: boolean;
  canEdit?: boolean;
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

const ResizableHead = ({ children, className, hostSelect = false, minWidth = 80, onResize, style }: TResizableHeadProps) => {
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
        "relative h-12 border-r border-b border-subtle py-0 align-middle text-13 font-medium text-secondary",
        hostSelect ? `group/header ${SELECT_HOST_PAD_CLASS}` : "px-page-x",
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

export const CasesTable = ({
  canDelete = true,
  canEdit = true,
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
  const selectHost = SELECT_HOST_ORDER.find((key) => isColumnVisible(key)) ?? null;
  const hostCellClass = (key: TCaseDisplayPropertyKey) =>
    cn(
      "relative h-12 border-r border-b border-subtle py-0",
      selectHost === key ? SELECT_HOST_PAD_CLASS : "px-page-x"
    );

  const renderHoverSelect = ({
    checked,
    forceVisible = false,
    hoverGroup,
    indeterminate,
    onCheckedChange,
  }: {
    checked: boolean;
    forceVisible?: boolean;
    hoverGroup: "header" | "row";
    indeterminate?: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <div
      className="absolute inset-y-0 left-1 z-[1] grid w-3.5 place-items-center"
      onClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        className="size-3.5 !outline-none"
        iconClassName="size-3"
        checked={checked}
        indeterminate={indeterminate}
        onChange={(event) => onCheckedChange(event.target.checked)}
        containerClassName={cn(
          "pointer-events-none opacity-0 transition-opacity",
          hoverGroup === "header"
            ? "group-hover/header:pointer-events-auto group-hover/header:opacity-100"
            : "group-hover:pointer-events-auto group-hover:opacity-100",
          (forceVisible || checked) && "pointer-events-auto opacity-100"
        )}
      />
    </div>
  );

  const renderHeaderSelect = (key: TCaseDisplayPropertyKey) =>
    selectHost === key
      ? renderHoverSelect({
          checked: allSelectedOnCurrentPage,
          forceVisible: selectedOnCurrentPage.length > 0,
          hoverGroup: "header",
          indeterminate: isIndeterminate,
          onCheckedChange: handleSelectAllOnPage,
        })
      : null;

  const renderRowSelect = (key: TCaseDisplayPropertyKey, recordId: string) =>
    selectHost === key
      ? renderHoverSelect({
          checked: selectedKeySet.has(recordId),
          hoverGroup: "row",
          onCheckedChange: (checked) => handleSelectRow(recordId, checked),
        })
      : null;

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
      className="min-w-full table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
      wrapperClassName="h-full overflow-auto testhub-cases-table-scroll scrollbar-always-visible"
    >
      <TableHeader className="sticky top-0 z-[2] bg-layer-1">
        <TableRow>
          {isColumnVisible("code") && (
            <ResizableHead
              hostSelect={selectHost === "code"}
              style={getWidthStyle("code", 160)}
              onResize={(width) => setColumnWidth("code", width)}
            >
              用例编号
              {renderHeaderSelect("code")}
            </ResizableHead>
          )}

          {isColumnVisible("name") && (
            <ResizableHead
              hostSelect={selectHost === "name"}
              style={getWidthStyle("name", 340)}
              onResize={(width) => setColumnWidth("name", width)}
            >
              名称
              {renderHeaderSelect("name")}
            </ResizableHead>
          )}

          {isColumnVisible("review") && (
            <ResizableHead
              hostSelect={selectHost === "review"}
              style={getWidthStyle("review", 100)}
              onResize={(width) => setColumnWidth("review", width)}
            >
              评审
              {renderHeaderSelect("review")}
            </ResizableHead>
          )}

          {isColumnVisible("type") && (
            <ResizableHead
              hostSelect={selectHost === "type"}
              style={getWidthStyle("type", 110)}
              onResize={(width) => setColumnWidth("type", width)}
            >
              类型
              {renderHeaderSelect("type")}
            </ResizableHead>
          )}

          {isColumnVisible("priority") && (
            <ResizableHead
              hostSelect={selectHost === "priority"}
              style={getWidthStyle("priority", 100)}
              onResize={(width) => setColumnWidth("priority", width)}
            >
              优先级
              {renderHeaderSelect("priority")}
            </ResizableHead>
          )}

          {isColumnVisible("module") && (
            <ResizableHead
              hostSelect={selectHost === "module"}
              style={getWidthStyle("module", 120)}
              onResize={(width) => setColumnWidth("module", width)}
            >
              模块
              {renderHeaderSelect("module")}
            </ResizableHead>
          )}

          {isColumnVisible("last_execution_result") && (
            <ResizableHead
              hostSelect={selectHost === "last_execution_result"}
              style={getWidthStyle("last_execution_result", 140)}
              onResize={(width) => setColumnWidth("last_execution_result", width)}
            >
              最近执行结果
              {renderHeaderSelect("last_execution_result")}
            </ResizableHead>
          )}

          {isColumnVisible("assignee") && (
            <ResizableHead
              hostSelect={selectHost === "assignee"}
              style={getWidthStyle("assignee", 150)}
              onResize={(width) => setColumnWidth("assignee", width)}
            >
              维护人
              {renderHeaderSelect("assignee")}
            </ResizableHead>
          )}

          {isColumnVisible("labels") && (
            <ResizableHead
              hostSelect={selectHost === "labels"}
              style={getWidthStyle("labels", 130)}
              onResize={(width) => setColumnWidth("labels", width)}
            >
              标签
              {renderHeaderSelect("labels")}
            </ResizableHead>
          )}

          {isColumnVisible("updated_at") && (
            <ResizableHead
              hostSelect={selectHost === "updated_at"}
              style={getWidthStyle("updated_at", 180)}
              onResize={(width) => setColumnWidth("updated_at", width)}
            >
              更新时间
              {renderHeaderSelect("updated_at")}
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
              {isColumnVisible("code") && (
                <TableCell className={hostCellClass("code")} style={getWidthStyle("code", 160)}>
                  {renderRowSelect("code", recordId)}
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, codeWidth - (selectHost === "code" ? 48 : 20)) }}
                    title={record.code || ""}
                    onClick={() => onViewCase(record)}
                  >
                    {record.code || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("name") && (
                <TableCell className={hostCellClass("name")} style={getWidthStyle("name", 340)}>
                  {renderRowSelect("name", recordId)}
                  <button
                    type="button"
                    className="block truncate text-left hover:text-accent-primary hover:underline"
                    style={{ maxWidth: Math.max(40, nameWidth - (selectHost === "name" ? 48 : 20)) }}
                    title={record.name || ""}
                    onClick={() => onViewCase(record)}
                  >
                    {record.name || "-"}
                  </button>
                </TableCell>
              )}

              {isColumnVisible("review") && (
                <TableCell className={hostCellClass("review")} style={getWidthStyle("review", 100)}>
                  {renderRowSelect("review", recordId)}
                  {renderReviewTag(record.review)}
                </TableCell>
              )}
              {isColumnVisible("type") && (
                <TableCell className={hostCellClass("type")} style={getWidthStyle("type", 110)}>
                  {renderRowSelect("type", recordId)}
                  {renderTypeTag(record.type)}
                </TableCell>
              )}
              {isColumnVisible("priority") && (
                <TableCell className={hostCellClass("priority")} style={getWidthStyle("priority", 100)}>
                  {renderRowSelect("priority", recordId)}
                  {renderPriorityTag(record.priority)}
                </TableCell>
              )}
              {isColumnVisible("module") && (
                <TableCell className={hostCellClass("module")} style={getWidthStyle("module", 120)}>
                  {renderRowSelect("module", recordId)}
                  {record.module?.name || "-"}
                </TableCell>
              )}
              {isColumnVisible("last_execution_result") && (
                <TableCell
                  className={hostCellClass("last_execution_result")}
                  style={getWidthStyle("last_execution_result", 140)}
                >
                  {renderRowSelect("last_execution_result", recordId)}
                  {renderLastExecutionResult(record)}
                </TableCell>
              )}

              {isColumnVisible("assignee") && (
                <TableCell className={hostCellClass("assignee")} style={getWidthStyle("assignee", 150)}>
                  {renderRowSelect("assignee", recordId)}
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
                <TableCell className={hostCellClass("labels")} style={getWidthStyle("labels", 130)}>
                  {renderRowSelect("labels", recordId)}
                  {renderLabels(record.labels)}
                </TableCell>
              )}
              {isColumnVisible("updated_at") && (
                <TableCell className={hostCellClass("updated_at")} style={getWidthStyle("updated_at", 180)}>
                  {renderRowSelect("updated_at", recordId)}
                  {renderUpdatedAt(record.updated_at)}
                </TableCell>
              )}

              <TableCell
                className="sticky right-0 z-[1] h-12 border-r border-b border-l border-subtle bg-surface-1 px-page-x py-0 group-hover:bg-surface-2"
                style={getWidthStyle("actions", 110)}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canEdit}
                    onClick={() => onEdit(record)}
                    aria-label="编辑用例"
                  >
                    <EditOutlined />
                  </button>
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canDelete}
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
