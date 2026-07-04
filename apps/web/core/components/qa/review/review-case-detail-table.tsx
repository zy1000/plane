/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Tag } from "antd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { ReviewCaseListItem } from "@/services/qa/review.service";
import type { TReviewCaseDisplayProperties } from "./review-case-display-filters";

type TReviewEnums = Record<string, Record<string, { color: string; label: string }>>;

type TReviewCaseDetailTableProps = {
  canEditReview?: boolean;
  displayProperties: TReviewCaseDisplayProperties;
  loading?: boolean;
  onCancel: (record: ReviewCaseListItem) => void;
  onOpenCase: (record: ReviewCaseListItem) => void;
  onReview: (record: ReviewCaseListItem) => void;
  onRowSelectChange: (selectedKeysOnCurrentPage: string[]) => void;
  reviewCases: ReviewCaseListItem[];
  reviewEnums: TReviewEnums;
  selectedCaseIds: string[];
};

type THeadProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const COLUMN_WIDTHS: Record<string, number> = {
  code: 150,
  name: 260,
  repository: 160,
  module: 150,
  priority: 100,
  assignees: 220,
  result: 120,
  created_by: 160,
  actions: 140,
};

const priorityLabelMap: Record<number, string> = { 0: "低", 1: "中", 2: "高" };

const ReviewCaseTableHead = ({ children, className, style }: THeadProps) => (
  <TableHead
    className={cn(
      "h-12 border-r border-b border-subtle px-page-x py-0 align-middle text-13 font-medium text-secondary",
      className
    )}
    style={style}
  >
    {children}
  </TableHead>
);

const getWidthStyle = (key: string): CSSProperties => ({
  width: COLUMN_WIDTHS[key],
  minWidth: COLUMN_WIDTHS[key],
});

const renderReviewTag = (value: string | undefined, reviewEnums: TReviewEnums) => {
  const rawColor = reviewEnums?.CaseReviewThrough_Result?.[value || ""]?.color || "default";
  const color = rawColor === "gray" ? "default" : rawColor;
  return <Tag color={color}>{value || "-"}</Tag>;
};

export const ReviewCaseDetailTable = ({
  canEditReview = true,
  displayProperties,
  loading = false,
  onCancel,
  onOpenCase,
  onReview,
  onRowSelectChange,
  reviewCases,
  reviewEnums,
  selectedCaseIds,
}: TReviewCaseDetailTableProps) => {
  const selectedKeySet = useMemo(() => new Set(selectedCaseIds.map((id) => String(id))), [selectedCaseIds]);
  const currentPageIds = useMemo(() => reviewCases.map((item) => String(item.id)), [reviewCases]);
  const selectedOnCurrentPage = useMemo(
    () => currentPageIds.filter((id) => selectedKeySet.has(id)),
    [currentPageIds, selectedKeySet]
  );

  const allSelectedOnCurrentPage = currentPageIds.length > 0 && selectedOnCurrentPage.length === currentPageIds.length;
  const isIndeterminate = selectedOnCurrentPage.length > 0 && !allSelectedOnCurrentPage;
  const isColumnVisible = (key: keyof TReviewCaseDisplayProperties) => displayProperties?.[key] ?? true;
  const visibleColumnCount =
    Object.keys(displayProperties).filter((key) => displayProperties[key as keyof TReviewCaseDisplayProperties])
      .length + 2;

  const handleSelectAllOnPage = (checked: boolean) => {
    onRowSelectChange(checked ? currentPageIds : []);
  };

  const handleSelectRow = (caseId: string, checked: boolean) => {
    const nextSelected = checked
      ? Array.from(new Set([...selectedOnCurrentPage, caseId]))
      : selectedOnCurrentPage.filter((id) => id !== caseId);
    onRowSelectChange(nextSelected);
  };

  return (
    <Table
      className="min-w-full table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
      wrapperClassName="h-full overflow-auto testhub-review-detail-table-scroll hide-vertical-scrollbar"
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

          {isColumnVisible("code") && <ReviewCaseTableHead style={getWidthStyle("code")}>用例编号</ReviewCaseTableHead>}
          {isColumnVisible("name") && <ReviewCaseTableHead style={getWidthStyle("name")}>用例名称</ReviewCaseTableHead>}
          {isColumnVisible("repository") && (
            <ReviewCaseTableHead style={getWidthStyle("repository")}>用例库</ReviewCaseTableHead>
          )}
          {isColumnVisible("module") && <ReviewCaseTableHead style={getWidthStyle("module")}>模块</ReviewCaseTableHead>}
          {isColumnVisible("priority") && (
            <ReviewCaseTableHead style={getWidthStyle("priority")}>用例等级</ReviewCaseTableHead>
          )}
          {isColumnVisible("assignees") && (
            <ReviewCaseTableHead style={getWidthStyle("assignees")}>评审人</ReviewCaseTableHead>
          )}
          {isColumnVisible("result") && (
            <ReviewCaseTableHead style={getWidthStyle("result")}>评审结果</ReviewCaseTableHead>
          )}
          {isColumnVisible("created_by") && (
            <ReviewCaseTableHead style={getWidthStyle("created_by")}>创建人</ReviewCaseTableHead>
          )}
          <ReviewCaseTableHead className="sticky right-0 z-[3] border-l bg-layer-1" style={getWidthStyle("actions")}>
            操作
          </ReviewCaseTableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={visibleColumnCount} className="h-24 border-r border-b border-subtle text-center">
              <span className="text-secondary">加载中...</span>
            </TableCell>
          </TableRow>
        ) : reviewCases.length === 0 ? (
          <TableRow>
            <TableCell colSpan={visibleColumnCount} className="h-24 border-r border-b border-subtle text-center">
              <span className="text-secondary">暂无数据</span>
            </TableCell>
          </TableRow>
        ) : (
          reviewCases.map((record) => {
            const recordId = String(record.id);

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
                    style={getWidthStyle("code")}
                  >
                    <button
                      type="button"
                      className="block max-w-full truncate text-left text-primary hover:text-accent-primary hover:underline"
                      title={record.code || ""}
                      onClick={() => onOpenCase(record)}
                    >
                      {record.code || "-"}
                    </button>
                  </TableCell>
                )}

                {isColumnVisible("name") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("name")}
                  >
                    <button
                      type="button"
                      className="block max-w-full truncate text-left text-primary hover:text-accent-primary hover:underline"
                      title={record.name || ""}
                      onClick={() => onOpenCase(record)}
                    >
                      {record.name || "-"}
                    </button>
                  </TableCell>
                )}

                {isColumnVisible("repository") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("repository")}
                  >
                    <span className="block truncate" title={record.repository || ""}>
                      {record.repository || "-"}
                    </span>
                  </TableCell>
                )}

                {isColumnVisible("module") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("module")}
                  >
                    <span className="block truncate" title={record.module || ""}>
                      {record.module || "-"}
                    </span>
                  </TableCell>
                )}

                {isColumnVisible("priority") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("priority")}
                  >
                    {priorityLabelMap[record.priority] ?? "-"}
                  </TableCell>
                )}

                {isColumnVisible("assignees") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("assignees")}
                  >
                    {Array.isArray(record.assignees) && record.assignees.length > 0 ? (
                      <MemberDropdown
                        multiple
                        value={record.assignees}
                        onChange={() => {}}
                        disabled
                        placeholder="未知用户"
                        className="w-full text-sm"
                        buttonContainerClassName="w-full text-left p-0 cursor-default"
                        buttonVariant="transparent-with-text"
                        buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                        showUserDetails
                        optionsClassName="z-[60]"
                      />
                    ) : (
                      <span className="text-placeholder">-</span>
                    )}
                  </TableCell>
                )}

                {isColumnVisible("result") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("result")}
                  >
                    {renderReviewTag(record.result, reviewEnums)}
                  </TableCell>
                )}

                {isColumnVisible("created_by") && (
                  <TableCell
                    className="h-12 border-r border-b border-subtle px-page-x py-0"
                    style={getWidthStyle("created_by")}
                  >
                    {record.created_by ? (
                      <MemberDropdown
                        multiple={false}
                        value={record.created_by}
                        onChange={() => {}}
                        disabled
                        placeholder="未知用户"
                        className="w-full text-sm"
                        buttonContainerClassName="w-full text-left p-0 cursor-default"
                        buttonVariant="transparent-with-text"
                        buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
                        showUserDetails
                        optionsClassName="z-[60]"
                      />
                    ) : (
                      <span className="text-placeholder">-</span>
                    )}
                  </TableCell>
                )}

                <TableCell
                  className="sticky right-0 z-[1] h-12 border-r border-b border-l border-subtle bg-surface-1 px-page-x py-0 group-hover:bg-surface-2"
                  style={getWidthStyle("actions")}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-accent-primary transition-colors hover:text-accent-primary-hover"
                      onClick={() => onReview(record)}
                    >
                      评审
                    </button>
                    <button
                      type="button"
                      className="text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canEditReview}
                      onClick={() => onCancel(record)}
                    >
                      取关
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};
