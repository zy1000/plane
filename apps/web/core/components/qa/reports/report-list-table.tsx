"use client";

import type { CSSProperties, ReactNode } from "react";
import { Tag, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { formatCNDateTime } from "@/components/qa/cases/util";
import type { TReportListItem, TReportPassRate } from "@/services/qa/report.service";

type Props = {
  reports: TReportListItem[];
  loading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onOpen: (record: TReportListItem) => void;
  onEdit: (record: TReportListItem) => void;
  onDelete: (record: TReportListItem) => void;
};

const REPORT_TYPE_COLOR: Record<string, string> = {
  计划报告: "blue",
  对外报告: "gold",
};

/** 定宽列；报告名称、计划名称两列不给宽度，平分剩余空间，所以空态和窄屏都不会撑出横向滚动 */
const COLUMN_WIDTHS: Record<string, number> = {
  report_type: 100,
  module_name: 130,
  pass_rate: 170,
  created_by: 130,
  created_at: 160,
  actions: 80,
};
const COLUMN_COUNT = 8;

const getWidthStyle = (key: string): CSSProperties | undefined =>
  COLUMN_WIDTHS[key] ? { width: COLUMN_WIDTHS[key], minWidth: COLUMN_WIDTHS[key] } : undefined;

const HEAD_CLASS = "h-12 border-r border-b border-subtle px-4 py-0 align-middle text-13 font-medium text-secondary";
const CELL_CLASS = "h-12 border-r border-b border-subtle px-4 py-0";

const Head = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <TableHead className={cn(HEAD_CLASS, className)} style={style}>
    {children}
  </TableHead>
);

const PASS_RATE_KEYS = ["成功", "失败", "阻塞", "无效", "未执行"] as const;
const PASS_RATE_COLOR: Record<string, string> = {
  成功: "#52c41a",
  失败: "#ff4d4f",
  阻塞: "#faad14",
  无效: "#3b5999",
  未执行: "#bfbfbf",
};
const PASS_RATE_TOOLTIP_STYLE: CSSProperties = {
  color: "#1f2937",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
};

const PassRateCell = ({ passRate }: { passRate?: TReportPassRate | null }) => {
  const counts = PASS_RATE_KEYS.map((key) => ({ key, count: Number(passRate?.[key] || 0) }));
  const totalCount = counts.reduce((sum, { count }) => sum + count, 0);
  const passed = counts[0].count;
  const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

  const tooltipContent = (
    <div className="flex min-w-28 flex-col gap-1">
      {counts.map(({ key, count }) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PASS_RATE_COLOR[key] }} />
          <span className="text-[#1f2937]">{key}</span>
          <span className="ml-auto text-[#6b7280]">{count}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      <Tooltip mouseEnterDelay={0.25} title={tooltipContent} color="#fff" styles={{ body: PASS_RATE_TOOLTIP_STYLE }}>
        <div className="min-w-24 flex-1">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full border border-subtle bg-surface-2">
            {counts.map(({ key, count }) => (
              <div
                key={key}
                className="h-full"
                style={{
                  width: `${totalCount > 0 ? (count / totalCount) * 100 : 0}%`,
                  backgroundColor: PASS_RATE_COLOR[key],
                }}
              />
            ))}
          </div>
        </div>
      </Tooltip>
      <span className="w-9 shrink-0 text-right text-xs text-primary">{percent}%</span>
    </div>
  );
};

/** 测试报告列表：与用例评审页同款的 propel 表格 */
export const ReportListTable = ({
  reports,
  loading = false,
  canEdit = true,
  canDelete = true,
  onOpen,
  onEdit,
  onDelete,
}: Props) => (
  <Table
    // 定宽列合计 770，再给名称 / 计划名称两列各留至少 135；容器比这窄时才在表格内横向滚动
    className="min-w-[max(100%,1040px)] table-fixed border-separate border-spacing-0 border-t border-l border-subtle"
    wrapperClassName="h-full overflow-auto"
  >
    <TableHeader className="sticky top-0 z-[2] bg-layer-1">
      <TableRow>
        <Head>报告名称</Head>
        <Head style={getWidthStyle("report_type")}>报告类型</Head>
        <Head style={getWidthStyle("module_name")}>所属模块</Head>
        <Head>计划名称</Head>
        <Head style={getWidthStyle("pass_rate")}>通过率</Head>
        <Head style={getWidthStyle("created_by")}>创建人</Head>
        <Head style={getWidthStyle("created_at")}>创建时间</Head>
        <Head className="sticky right-0 z-[3] border-l bg-layer-1" style={getWidthStyle("actions")}>
          操作
        </Head>
      </TableRow>
    </TableHeader>

    <TableBody>
      {loading ? (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="h-24 border-r border-b border-subtle text-center">
            <span className="text-secondary">加载中...</span>
          </TableCell>
        </TableRow>
      ) : reports.length === 0 ? (
        <TableRow>
          <TableCell colSpan={COLUMN_COUNT} className="h-24 border-r border-b border-subtle text-center">
            <span className="text-secondary">暂无测试报告</span>
          </TableCell>
        </TableRow>
      ) : (
        reports.map((record) => {
          const planNames = Array.isArray(record.plan_names) ? record.plan_names.join("、") : "";
          const creator = record.created_by_detail;
          return (
            <TableRow key={record.id} className="group h-12 bg-surface-1 transition-colors hover:bg-surface-2">
              <TableCell className={CELL_CLASS}>
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-primary hover:text-accent-primary hover:underline"
                  title={record.name || ""}
                  onClick={() => onOpen(record)}
                >
                  {record.name || "-"}
                </button>
              </TableCell>
              <TableCell className={CELL_CLASS} style={getWidthStyle("report_type")}>
                <Tag color={REPORT_TYPE_COLOR[record.report_type] || "default"}>{record.report_type || "-"}</Tag>
              </TableCell>
              <TableCell className={CELL_CLASS} style={getWidthStyle("module_name")}>
                <span className="block truncate text-secondary" title={record.module_name || ""}>
                  {record.module_name || ""}
                </span>
              </TableCell>
              <TableCell className={CELL_CLASS}>
                {planNames ? (
                  <span className="block truncate text-secondary" title={planNames}>
                    {planNames}
                  </span>
                ) : (
                  <span className="text-placeholder">-</span>
                )}
              </TableCell>
              <TableCell className={CELL_CLASS} style={getWidthStyle("pass_rate")}>
                <PassRateCell passRate={record.pass_rate} />
              </TableCell>
              <TableCell className={CELL_CLASS} style={getWidthStyle("created_by")}>
                {creator?.id ? (
                  <MemberDropdown
                    multiple
                    value={[creator.id]}
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
              <TableCell className={cn(CELL_CLASS, "text-secondary")} style={getWidthStyle("created_at")}>
                {formatCNDateTime(record.created_at)}
              </TableCell>
              <TableCell
                className="sticky right-0 z-[1] h-12 border-r border-b border-l border-subtle bg-surface-1 px-4 py-0 group-hover:bg-surface-2"
                style={getWidthStyle("actions")}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canEdit}
                    onClick={() => onEdit(record)}
                    aria-label="编辑报告"
                  >
                    <EditOutlined />
                  </button>
                  <button
                    type="button"
                    className="text-red-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canDelete}
                    onClick={() => onDelete(record)}
                    aria-label="删除报告"
                  >
                    <DeleteOutlined />
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
