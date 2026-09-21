/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, UIEvent } from "react";
import { Popconfirm } from "antd";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TPlanCaseItem } from "@/services/qa/plan.service";
import type { TPlanCaseDisplayProperties, TPlanCaseDisplayPropertyKey } from "./plan-case-display-filters";
import { isPlanCaseReviewable } from "./use-plan-case-review";

type TPlanCasesTableProps = {
  bulkAssigneeUpdating?: boolean;
  canReview?: boolean;
  cases: TPlanCaseItem[];
  columnWidths: Record<string, number>;
  currentUserId?: string;
  displayProperties: TPlanCaseDisplayProperties;
  onAssigneeChange: (planCaseId: string, assignee: string | null) => void;
  onCancelRelation: (planCaseId: string) => void;
  onOpenCase: (caseId?: string) => void;
  onReview: (record: TPlanCaseItem) => void;
  onRowSelectChange: (selectedKeysOnCurrentPage: string[]) => void;
  onViewExecution: (record: TPlanCaseItem) => void;
  projectId?: string;
  renderPriorityTag: (value?: number | null) => ReactNode;
  renderResultTag: (value?: string) => ReactNode;
  renderReviewStatusTag: (value?: string) => ReactNode;
  renderTypeTag: (value?: number | null) => ReactNode;
  renderUpdatedAt: (value?: string | null) => ReactNode;
  selectedPlanCaseIds: string[];
  setColumnWidth: (key: string, width: number) => void;
};

type TColumnDef = {
  key: TPlanCaseDisplayPropertyKey;
  label: string;
  width: number;
};

/** 勾选列与操作列固定在两端，中间的属性列随内容横向滚动 */
const SELECT_COLUMN_WIDTH = 44;
const ACTIONS_COLUMN_WIDTH = 150;
/** 左端冻结的属性列，顺序与 COLUMN_DEFS 一致 */
const FROZEN_LEFT_KEYS: TPlanCaseDisplayPropertyKey[] = ["code", "name"];

const COLUMN_DEFS: TColumnDef[] = [
  { key: "code", label: "编号", width: 150 },
  { key: "name", label: "用例名称", width: 300 },
  { key: "repository", label: "用例库", width: 150 },
  { key: "priority", label: "优先级", width: 92 },
  { key: "type", label: "类型", width: 110 },
  { key: "module", label: "模块", width: 120 },
  { key: "assignee", label: "执行人", width: 160 },
  { key: "result", label: "执行结果", width: 110 },
  { key: "review_status", label: "复核状态", width: 110 },
  { key: "updated_at", label: "更新时间", width: 170 },
];

const CELL_CLASS = "flex h-full min-w-0 items-center border-r border-b border-subtle px-3";
const MIN_COLUMN_WIDTH = 80;

const ResizeHandle = ({ onResize }: { onResize: (width: number) => void }) => {
  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = (event.currentTarget.parentElement?.getBoundingClientRect().width ?? MIN_COLUMN_WIDTH) as number;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      onResize(Math.round(Math.max(MIN_COLUMN_WIDTH, startWidth + delta)));
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize"
      onMouseDown={handleMouseDown}
      role="presentation"
    />
  );
};

export const PlanCasesTable = ({
  bulkAssigneeUpdating = false,
  canReview = false,
  cases,
  columnWidths,
  currentUserId,
  displayProperties,
  onAssigneeChange,
  onCancelRelation,
  onOpenCase,
  onReview,
  onRowSelectChange,
  onViewExecution,
  projectId,
  renderPriorityTag,
  renderResultTag,
  renderReviewStatusTag,
  renderTypeTag,
  renderUpdatedAt,
  selectedPlanCaseIds,
  setColumnWidth,
}: TPlanCasesTableProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<{ atStart: boolean; atEnd: boolean }>({ atStart: true, atEnd: true });

  const selectedKeySet = useMemo(() => new Set(selectedPlanCaseIds.map((id) => String(id))), [selectedPlanCaseIds]);
  const currentPageIds = useMemo(() => cases.map((item) => String(item.id)), [cases]);
  const selectedOnCurrentPage = useMemo(
    () => currentPageIds.filter((id) => selectedKeySet.has(id)),
    [currentPageIds, selectedKeySet]
  );

  const allSelectedOnCurrentPage = currentPageIds.length > 0 && selectedOnCurrentPage.length === currentPageIds.length;
  const isIndeterminate = selectedOnCurrentPage.length > 0 && !allSelectedOnCurrentPage;

  const getColumnWidth = (key: string, fallback: number) => columnWidths[key] ?? fallback;

  const visibleColumns = useMemo(
    () => COLUMN_DEFS.filter((column) => displayProperties?.[column.key] ?? true),
    [displayProperties]
  );

  /** 名称列（或最后一个可见属性列）吃掉多余宽度，操作列保持固定，大屏不会在右侧留白 */
  const flexibleColumnKey = useMemo(() => {
    if (visibleColumns.some((column) => column.key === "name")) return "name";
    return visibleColumns[visibleColumns.length - 1]?.key;
  }, [visibleColumns]);

  const gridTemplateColumns = useMemo(
    () =>
      [
        `${SELECT_COLUMN_WIDTH}px`,
        ...visibleColumns.map((column) => {
          const width = getColumnWidth(column.key, column.width);
          return column.key === flexibleColumnKey ? `minmax(${width}px, 1fr)` : `${width}px`;
        }),
        `${getColumnWidth("actions", ACTIONS_COLUMN_WIDTH)}px`,
      ].join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns, columnWidths, flexibleColumnKey]
  );

  /** 冻结列的 left 偏移量：勾选列固定 0，其后依次累加前面冻结列的宽度 */
  const frozenLeftOffsets = useMemo(() => {
    const offsets: Record<string, number> = { select: 0 };
    let offset = SELECT_COLUMN_WIDTH;
    FROZEN_LEFT_KEYS.forEach((key) => {
      if (!visibleColumns.some((column) => column.key === key)) return;
      offsets[key] = offset;
      const definition = COLUMN_DEFS.find((column) => column.key === key);
      offset += getColumnWidth(key, definition?.width ?? MIN_COLUMN_WIDTH);
    });
    return offsets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, columnWidths]);

  const lastFrozenLeftKey = useMemo(() => {
    const frozenVisible = FROZEN_LEFT_KEYS.filter((key) => visibleColumns.some((column) => column.key === key));
    return frozenVisible.length > 0 ? frozenVisible[frozenVisible.length - 1] : "select";
  }, [visibleColumns]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const atStart = element.scrollLeft <= 1;
    const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 1;
    if (atStart !== scrollState.atStart || atEnd !== scrollState.atEnd) setScrollState({ atStart, atEnd });
  };

  const getFrozenLeftStyle = (key: string): CSSProperties | undefined => {
    const left = frozenLeftOffsets[key];
    if (left === undefined) return undefined;
    return {
      left,
      ...(key === lastFrozenLeftKey && !scrollState.atStart
        ? { boxShadow: "8px 0 8px -6px rgb(20 24 32 / 0.14)" }
        : {}),
    };
  };

  const frozenRightStyle: CSSProperties = scrollState.atEnd
    ? {}
    : { boxShadow: "-8px 0 8px -6px rgb(20 24 32 / 0.14)" };

  const handleSelectAllOnPage = (checked: boolean) => {
    onRowSelectChange(checked ? currentPageIds : []);
  };

  const handleSelectRow = (planCaseId: string, checked: boolean) => {
    const nextSelected = checked
      ? Array.from(new Set([...selectedOnCurrentPage, planCaseId]))
      : selectedOnCurrentPage.filter((id) => id !== planCaseId);
    onRowSelectChange(nextSelected);
  };

  const isFrozenLeft = (key: string) => frozenLeftOffsets[key] !== undefined;

  const renderCellContent = (column: TColumnDef, record: TPlanCaseItem) => {
    const recordId = String(record.id);
    const caseId = record.case?.id ? String(record.case.id) : undefined;

    switch (column.key) {
      case "code":
        return (
          <button
            type="button"
            className="truncate text-left text-13 text-secondary transition-colors hover:text-accent-primary hover:underline"
            title={record.case?.code || ""}
            onClick={() => onOpenCase(caseId)}
          >
            {record.case?.code || ""}
          </button>
        );
      case "name":
        return (
          <button
            type="button"
            className="truncate text-left text-13 text-primary transition-colors hover:text-accent-primary hover:underline"
            title={record.case?.name || ""}
            onClick={() => onOpenCase(caseId)}
          >
            {record.case?.name || ""}
          </button>
        );
      case "repository":
        return (
          <span className="truncate text-13 text-secondary" title={record.case?.repository_name || ""}>
            {record.case?.repository_name || ""}
          </span>
        );
      case "module":
        return (
          <span className="truncate text-13 text-secondary" title={record.case?.module || ""}>
            {record.case?.module || ""}
          </span>
        );
      case "assignee":
        return (
          <MemberDropdown
            multiple={false}
            value={record?.assignee ? String(record.assignee) : null}
            onChange={(value) => onAssigneeChange(recordId, value ? String(value) : null)}
            disabled={bulkAssigneeUpdating}
            projectId={projectId}
            placeholder="未分配"
            className="w-full text-13"
            buttonContainerClassName="w-full text-left p-0"
            buttonVariant="transparent-with-text"
            buttonClassName="text-13 p-0 hover:bg-transparent hover:bg-inherit"
            showUserDetails
            optionsClassName="z-[80]"
          />
        );
      case "type":
        return renderTypeTag(record.case?.type);
      case "priority":
        return renderPriorityTag(record.case?.priority);
      case "result":
        return renderResultTag(record.result);
      case "review_status":
        return renderReviewStatusTag(record.review_status);
      case "updated_at":
        return <span className="truncate text-13 text-secondary tabular-nums">{renderUpdatedAt(record.case?.updated_at)}</span>;
      default:
        return null;
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="testhub-plan-cases-table-scroll max-h-full overflow-auto"
    >
      <div className="min-w-max w-full">
        {/* 表头 */}
        <div
          className="sticky top-0 z-[4] grid h-9 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary"
          style={{ gridTemplateColumns }}
        >
          <div
            className={cn(CELL_CLASS, "sticky z-[5] justify-center border-b-0 bg-layer-1 px-0")}
            style={getFrozenLeftStyle("select")}
          >
            <Checkbox
              checked={allSelectedOnCurrentPage}
              indeterminate={isIndeterminate}
              onChange={(event) => handleSelectAllOnPage(event.target.checked)}
            />
          </div>

          {visibleColumns.map((column) => (
            <div
              key={column.key}
              className={cn(
                CELL_CLASS,
                "relative border-b-0",
                isFrozenLeft(column.key) && "sticky z-[5] bg-layer-1"
              )}
              style={getFrozenLeftStyle(column.key)}
            >
              <span className="truncate">{column.label}</span>
              <ResizeHandle onResize={(width) => setColumnWidth(column.key, width)} />
            </div>
          ))}

          <div
            className={cn(CELL_CLASS, "sticky right-0 z-[5] border-r-0 border-b-0 border-l border-subtle bg-layer-1")}
            style={frozenRightStyle}
          >
            操作
          </div>
        </div>

        {/* 行 */}
        {cases.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-13 text-placeholder">暂无计划用例</div>
        ) : (
          cases.map((record) => {
            const recordId = String(record.id);
            const assigneeId = record?.assignee ? String(record.assignee) : null;
            const isAssignedToCurrentUser = Boolean(currentUserId) && assigneeId === String(currentUserId);
            const actionLabel = isAssignedToCurrentUser ? "执行" : "查看";
            // 复核对象是执行结果，未执行的用例没有可复核的内容
            const isReviewable = isPlanCaseReviewable(record.result);

            return (
              <div
                key={recordId}
                className="group grid h-[50px] bg-surface-1 transition-colors hover:bg-surface-2"
                style={{ gridTemplateColumns }}
              >
                <div
                  className={cn(CELL_CLASS, "sticky z-[2] justify-center bg-inherit px-0")}
                  style={getFrozenLeftStyle("select")}
                >
                  <Checkbox
                    checked={selectedKeySet.has(recordId)}
                    onChange={(event) => handleSelectRow(recordId, event.target.checked)}
                  />
                </div>

                {visibleColumns.map((column) => (
                  <div
                    key={column.key}
                    className={cn(CELL_CLASS, isFrozenLeft(column.key) && "sticky z-[2] bg-inherit")}
                    style={getFrozenLeftStyle(column.key)}
                  >
                    {renderCellContent(column, record)}
                  </div>
                ))}

                <div
                  className={cn(CELL_CLASS, "sticky right-0 z-[2] gap-3 border-r-0 border-l border-subtle bg-inherit")}
                  style={frozenRightStyle}
                >
                  <button
                    type="button"
                    className="text-13 text-accent-primary transition-colors hover:text-accent-primary-hover"
                    onClick={() => onViewExecution(record)}
                  >
                    {actionLabel}
                  </button>
                  {canReview && (
                    <button
                      type="button"
                      disabled={!isReviewable}
                      title={isReviewable ? undefined : "用例未执行，暂无可复核的结果"}
                      className={cn(
                        "text-13 transition-colors",
                        isReviewable
                          ? "text-accent-primary hover:text-accent-primary-hover"
                          : "cursor-not-allowed text-placeholder"
                      )}
                      onClick={() => isReviewable && onReview(record)}
                    >
                      复核
                    </button>
                  )}
                  <Popconfirm
                    title="确定取关该用例？"
                    onConfirm={() => onCancelRelation(recordId)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <button type="button" className="text-13 text-danger-primary transition-colors hover:opacity-80">
                      取关
                    </button>
                  </Popconfirm>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
