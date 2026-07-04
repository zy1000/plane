/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { CSSProperties, ReactNode } from "react";
import { Tag, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { formatCNDateTime } from "@/components/qa/cases/util";
import type { TReviewDisplayProperties } from "./reviews-display-filters";

export type TReviewTableRecord = {
  id: string;
  assignees?: string[];
  case_count?: number;
  created_at?: string;
  ended_at?: string | null;
  mode?: string;
  module_id?: string | null;
  module_name?: string;
  name: string;
  pass_rate?: Record<string, number>;
  started_at?: string | null;
  state?: string;
};

type TReviewEnums = Record<string, Record<string, { label: string; color: string }>>;

type TReviewsTableProps = {
  canDelete?: boolean;
  canEdit?: boolean;
  displayProperties: TReviewDisplayProperties;
  loading?: boolean;
  onDelete: (record: TReviewTableRecord) => void;
  onEdit: (record: TReviewTableRecord) => void;
  onOpen: (record: TReviewTableRecord) => void;
  reviewEnums: TReviewEnums;
  reviews: TReviewTableRecord[];
};

type THeadProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const COLUMN_WIDTHS: Record<string, number> = {
  name: 240,
  case_count: 100,
  state: 120,
  pass_rate: 190,
  mode: 140,
  assignees: 220,
  module_name: 180,
  period: 220,
  created_at: 190,
  actions: 110,
};

const COLOR_HEX_MAP: Record<string, string> = {
  green: "#52c41a",
  red: "#ff4d4f",
  gold: "#faad14",
  blue: "#1677ff",
  gray: "#bfbfbf",
  default: "#d9d9d9",
};

const PASS_RATE_TOOLTIP_STYLE: CSSProperties = {
  color: "#1f2937",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
};

const ReviewTableHead = ({ children, className, style }: THeadProps) => (
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

const dateOnly = (value?: string | number | Date | null) => {
  if (!value) return "-";
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReviewPeriod = (startedAt?: string | null, endedAt?: string | null) => {
  const startDate = dateOnly(startedAt);
  const endDate = dateOnly(endedAt);
  const hasStartDate = startDate !== "-";
  const hasEndDate = endDate !== "-";

  if (!hasStartDate && !hasEndDate) return "";
  return `${hasStartDate ? startDate : "~"} - ${hasEndDate ? endDate : "~"}`;
};

const renderEnumTag = (value: string | undefined, enumMap: TReviewEnums[string] | undefined) => {
  const rawColor = enumMap?.[value || ""]?.color || "default";
  const color = rawColor === "gray" ? "default" : rawColor;
  return <Tag color={color}>{value || "-"}</Tag>;
};

const PassRateCell = ({
  caseCount,
  passRate,
  reviewEnums,
}: {
  caseCount?: number;
  passRate?: Record<string, number>;
  reviewEnums: TReviewEnums;
}) => {
  const enums = reviewEnums?.CaseReviewThrough_Result || {};
  const orderKeys = Object.keys(enums);
  const totalCount =
    typeof caseCount === "number"
      ? caseCount || 0
      : Object.values(passRate || {}).reduce((sum: number, value) => sum + Number(value || 0), 0);
  const passKey = orderKeys.find((key) => enums[key]?.color === "green") || "通过";
  const passed = Number(passRate?.[passKey] || 0);
  const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

  const segments = orderKeys.map((key) => {
    const count = Number(passRate?.[key] || 0);
    const enumColor = enums[key]?.color || "default";
    const color = COLOR_HEX_MAP[enumColor] || enumColor;
    const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return { key, count, color, widthPct };
  });

  const tooltipContent = (
    <div className="flex min-w-28 flex-col gap-1">
      {orderKeys.map((key) => {
        const enumColor = enums[key]?.color || "default";
        const color = COLOR_HEX_MAP[enumColor] || enumColor;
        return (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[#1f2937]">{key}</span>
            <span className="ml-auto text-[#6b7280]">{Number(passRate?.[key] || 0)}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <Tooltip mouseEnterDelay={0.25} title={tooltipContent} color="#fff" overlayInnerStyle={PASS_RATE_TOOLTIP_STYLE}>
        <div className="min-w-28 flex-1">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full border border-subtle bg-surface-2">
            {segments.map((segment, index) => (
              <div
                key={`${segment.key}-${index}`}
                className="h-full"
                style={{ width: `${segment.widthPct}%`, backgroundColor: segment.color }}
              />
            ))}
          </div>
        </div>
      </Tooltip>
      <span className="w-9 shrink-0 text-right text-xs text-primary">{percent}%</span>
    </div>
  );
};

export const ReviewsTable = ({
  canDelete = true,
  canEdit = true,
  displayProperties,
  loading = false,
  onDelete,
  onEdit,
  onOpen,
  reviewEnums,
  reviews,
}: TReviewsTableProps) => {
  const isColumnVisible = (key: keyof TReviewDisplayProperties) => displayProperties?.[key] ?? true;
  const visibleColumnCount =
    Object.keys(displayProperties).filter((key) => displayProperties[key as keyof TReviewDisplayProperties]).length + 1;

  return (
    <Table
      className="min-w-full table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
      wrapperClassName="h-full overflow-auto testhub-reviews-table-scroll scrollbar-always-visible"
    >
      <TableHeader className="sticky top-0 z-[2] bg-layer-1">
        <TableRow>
          {isColumnVisible("name") && (
            <ReviewTableHead style={getWidthStyle("name")}>评审名称</ReviewTableHead>
          )}
          {isColumnVisible("case_count") && (
            <ReviewTableHead style={getWidthStyle("case_count")}>用例数</ReviewTableHead>
          )}
          {isColumnVisible("state") && <ReviewTableHead style={getWidthStyle("state")}>状态</ReviewTableHead>}
          {isColumnVisible("pass_rate") && (
            <ReviewTableHead style={getWidthStyle("pass_rate")}>通过率</ReviewTableHead>
          )}
          {isColumnVisible("mode") && <ReviewTableHead style={getWidthStyle("mode")}>评审模式</ReviewTableHead>}
          {isColumnVisible("assignees") && (
            <ReviewTableHead style={getWidthStyle("assignees")}>评审人</ReviewTableHead>
          )}
          {isColumnVisible("module_name") && (
            <ReviewTableHead style={getWidthStyle("module_name")}>所属模块</ReviewTableHead>
          )}
          {isColumnVisible("period") && <ReviewTableHead style={getWidthStyle("period")}>评审周期</ReviewTableHead>}
          {isColumnVisible("created_at") && (
            <ReviewTableHead style={getWidthStyle("created_at")}>创建时间</ReviewTableHead>
          )}
          <ReviewTableHead className="sticky right-0 z-[3] border-l bg-layer-1" style={getWidthStyle("actions")}>
            操作
          </ReviewTableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={visibleColumnCount} className="h-24 border-r border-b border-subtle text-center">
              <span className="text-secondary">加载中...</span>
            </TableCell>
          </TableRow>
        ) : reviews.length === 0 ? (
          <TableRow>
            <TableCell colSpan={visibleColumnCount} className="h-24 border-r border-b border-subtle text-center">
              <span className="text-secondary">暂无数据</span>
            </TableCell>
          </TableRow>
        ) : (
          reviews.map((record) => (
            <TableRow key={record.id} className="group h-12 bg-surface-1 transition-colors hover:bg-surface-2">
              {isColumnVisible("name") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("name")}
                >
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-primary hover:text-accent-primary hover:underline"
                    title={record.name || ""}
                    onClick={() => onOpen(record)}
                  >
                    {record.name || "-"}
                  </button>
                </TableCell>
              )}
              {isColumnVisible("case_count") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("case_count")}
                >
                  {record.case_count ?? 0}
                </TableCell>
              )}
              {isColumnVisible("state") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("state")}
                >
                  {renderEnumTag(record.state, reviewEnums?.CaseReview_State)}
                </TableCell>
              )}
              {isColumnVisible("pass_rate") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("pass_rate")}
                >
                  <PassRateCell caseCount={record.case_count} passRate={record.pass_rate} reviewEnums={reviewEnums} />
                </TableCell>
              )}
              {isColumnVisible("mode") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("mode")}
                >
                  {renderEnumTag(record.mode, reviewEnums?.CaseReview_ReviewMode)}
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
                      placeholder=""
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
              {isColumnVisible("module_name") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("module_name")}
                >
                  <span className="block truncate" title={record.module_name || ""}>
                    {record.module_name || ""}
                  </span>
                </TableCell>
              )}
              {isColumnVisible("period") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("period")}
                >
                  {formatReviewPeriod(record.started_at, record.ended_at)}
                </TableCell>
              )}
              {isColumnVisible("created_at") && (
                <TableCell
                  className="h-12 border-r border-b border-subtle px-page-x py-0"
                  style={getWidthStyle("created_at")}
                >
                  {formatCNDateTime(record.created_at)}
                </TableCell>
              )}
              <TableCell
                className="sticky right-0 z-[1] h-12 border-r border-b border-l border-subtle bg-surface-1 px-page-x py-0 group-hover:bg-surface-2"
                style={getWidthStyle("actions")}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canEdit}
                    onClick={() => onEdit(record)}
                    aria-label="编辑评审"
                  >
                    <EditOutlined />
                  </button>
                  <button
                    type="button"
                    className="text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canDelete}
                    onClick={() => onDelete(record)}
                    aria-label="删除评审"
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};
