"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Pagination } from "antd";
import { Search } from "lucide-react";
import { PriorityIcon, type TIssuePriorities } from "@plane/propel/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { getUserAvatarFallbackBackgroundColor } from "@/helpers/user-avatar.helper";
import { useMember } from "@/hooks/store/use-member";
import type { TReportCaseRow, TReportPassRate } from "@/services/qa/report.service";
import { EXECUTION_RESULT_META, type TExecutionResultKey } from "./execution-result";

const PRIORITY_META: Record<number, { label: string; icon: TIssuePriorities }> = {
  0: { label: "低", icon: "low" },
  1: { label: "中", icon: "medium" },
  2: { label: "高", icon: "high" },
};

/** 定宽列；名称、所属计划两列不给宽度，平分剩余空间（计划名是长编码，定宽 250 会截掉一半） */
const COLUMN_WIDTHS: Record<string, number> = {
  code: 150,
  priority: 84,
  result: 112,
  module: 128,
  assignee: 132,
  defect: 84,
};
const COLUMN_COUNT = 8;

const getWidthStyle = (key: string): CSSProperties | undefined =>
  COLUMN_WIDTHS[key] ? { width: COLUMN_WIDTHS[key], minWidth: COLUMN_WIDTHS[key] } : undefined;

const HEAD_CLASS = "h-10 border-b border-subtle px-4 py-0 align-middle text-12 font-medium text-secondary";
const CELL_CLASS = "h-11 border-b border-subtle px-4 py-0";

const Head = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <TableHead className={cn(HEAD_CLASS, className)} style={style}>
    {children}
  </TableHead>
);

type TResultFilter = TExecutionResultKey | "";

type Props = {
  rows: TReportCaseRow[];
  count: number;
  loading: boolean;
  /** 概览里的五态计数，用来给筛选分段按钮标数字 */
  passRate: TReportPassRate | null | undefined;
  onQueryChange: (query: { page: number; pageSize: number; result?: string; name?: string }) => void;
};

const AssigneeCell = ({ id, name }: { id: string | null; name: string | null }) => {
  const { getUserDetails } = useMember();
  if (!id && !name) return <span className="text-placeholder">-</span>;
  const user = id ? getUserDetails(id) : undefined;
  const displayName = user?.display_name || name || "";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar
        src={getFileURL(user?.avatar_url ?? "")}
        name={displayName}
        size="sm"
        fallbackBackgroundColor={getUserAvatarFallbackBackgroundColor(user)}
      />
      <span className="truncate" title={displayName}>
        {displayName}
      </span>
    </span>
  );
};

const ResultPill = ({ result }: { result: string }) => {
  const meta = EXECUTION_RESULT_META.find((m) => m.key === result);
  if (!meta) return <span className="text-placeholder">{result || "-"}</span>;
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-12 font-medium", meta.pillClass)}>
      <span className={cn("size-[7px] rounded-full", meta.dotClass)} />
      {meta.label}
    </span>
  );
};

/** 执行明细：全站同款 propel 表格 + 按执行结果筛选的分段按钮 */
export const ReportCaseTable = ({ rows, count, loading, passRate, onQueryChange }: Props) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  /** 已经发给后端的关键字；输入框清空后失焦时据此决定要不要重新拉 */
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [result, setResult] = useState<TResultFilter>("");

  // 报告切换时后端总数会变，回到第一页
  useEffect(() => {
    setPage(1);
  }, [count]);

  const totalAll = EXECUTION_RESULT_META.reduce((sum, m) => sum + Number(passRate?.[m.key] || 0), 0);

  const emit = (next: { page?: number; pageSize?: number; result?: TResultFilter; name?: string }) => {
    const nextPage = next.page ?? page;
    const nextSize = next.pageSize ?? pageSize;
    const nextResult = next.result ?? result;
    const nextName = (next.name ?? keyword).trim();
    setAppliedKeyword(nextName);
    onQueryChange({
      page: nextPage,
      pageSize: nextSize,
      result: nextResult || undefined,
      name: nextName || undefined,
    });
  };

  const handleResult = (next: TResultFilter) => {
    if (next === result) return;
    setResult(next);
    setPage(1);
    emit({ result: next, page: 1 });
  };

  const handleSearch = () => {
    setPage(1);
    emit({ page: 1 });
  };

  const handlePagination = (p: number, s?: number) => {
    const nextSize = s || pageSize;
    setPage(p);
    setPageSize(nextSize);
    emit({ page: p, pageSize: nextSize });
  };

  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  return (
    <div className="flex flex-col">
      {/* 工具条：结果筛选 + 搜索 */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3">
        <div className="flex gap-0.5 rounded-[7px] bg-layer-1 p-[3px]">
          <SegmentButton active={result === ""} onClick={() => handleResult("")}>
            全部 <b className="text-12 font-medium text-tertiary">{totalAll}</b>
          </SegmentButton>
          {EXECUTION_RESULT_META.map((m) => (
            <SegmentButton key={m.key} active={result === m.key} onClick={() => handleResult(m.key)}>
              <span className={cn("size-[7px] rounded-full", m.dotClass)} />
              {m.label}
              <b className="text-12 font-medium text-tertiary">{Number(passRate?.[m.key] || 0)}</b>
            </SegmentButton>
          ))}
        </div>
        <div className="flex-1" />
        <label className="flex h-8 w-60 items-center gap-2 rounded-md border border-strong bg-surface-1 px-2.5 text-13 focus-within:border-accent-strong">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-primary outline-none placeholder:text-placeholder"
            placeholder="搜索编号 / 名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            onBlur={() => {
              if (!keyword.trim() && appliedKeyword) {
                setPage(1);
                emit({ page: 1, name: "" });
              }
            }}
          />
        </label>
      </div>

      <Table
        className="min-w-[max(100%,1040px)] table-fixed border-separate border-spacing-0"
        wrapperClassName="overflow-auto"
      >
        <TableHeader className="bg-layer-1">
          <TableRow>
            <Head className="pl-5" style={getWidthStyle("code")}>
              编号
            </Head>
            <Head>名称</Head>
            <Head style={getWidthStyle("priority")}>等级</Head>
            <Head style={getWidthStyle("result")}>执行结果</Head>
            <Head style={getWidthStyle("module")}>所属模块</Head>
            <Head style={getWidthStyle("assignee")}>执行人</Head>
            <Head className="text-right" style={getWidthStyle("defect")}>
              缺陷
            </Head>
            <Head>所属计划</Head>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="h-24 border-b border-subtle text-center">
                <span className="text-secondary">加载中...</span>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="h-24 border-b border-subtle text-center">
                <span className="text-secondary">{result || keyword ? "没有符合条件的用例" : "暂无执行明细"}</span>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const priority = r.priority === null || r.priority === undefined ? undefined : PRIORITY_META[r.priority];
              return (
                <TableRow key={r.id} className="h-11 bg-surface-1 transition-colors hover:bg-surface-2">
                  <TableCell
                    className={cn(CELL_CLASS, "pl-5 font-mono text-13 tracking-wide text-secondary")}
                    style={getWidthStyle("code")}
                  >
                    <span className="block truncate" title={r.code || ""}>
                      {r.code || "-"}
                    </span>
                  </TableCell>
                  <TableCell className={CELL_CLASS}>
                    <span className="block truncate text-primary" title={r.name || ""}>
                      {r.name || "-"}
                    </span>
                  </TableCell>
                  <TableCell className={CELL_CLASS} style={getWidthStyle("priority")}>
                    {priority ? (
                      <span className="inline-flex items-center gap-1.5 text-secondary">
                        <PriorityIcon priority={priority.icon} size={14} />
                        {priority.label}
                      </span>
                    ) : (
                      <span className="text-placeholder">-</span>
                    )}
                  </TableCell>
                  <TableCell className={CELL_CLASS} style={getWidthStyle("result")}>
                    <ResultPill result={r.result} />
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, "text-secondary")} style={getWidthStyle("module")}>
                    <span className="block truncate" title={r.module || ""}>
                      {r.module || "-"}
                    </span>
                  </TableCell>
                  <TableCell className={CELL_CLASS} style={getWidthStyle("assignee")}>
                    <AssigneeCell id={r.assignee_id} name={r.assignee_name} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      CELL_CLASS,
                      "text-right tabular-nums",
                      r.defect_count ? "font-semibold text-danger-primary" : "text-tertiary"
                    )}
                    style={getWidthStyle("defect")}
                  >
                    {r.defect_count || 0}
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, "text-secondary")}>
                    <span className="block truncate" title={r.plan_name || ""}>
                      {r.plan_name || "-"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="flex h-12 items-center gap-3 px-5 text-13 text-tertiary">
        <span>
          第 {from}–{to} 条，共 {count} 条
        </span>
        <div className="flex-1" />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={count}
          showSizeChanger
          pageSizeOptions={["10", "20", "50", "100"]}
          size="small"
          locale={{ items_per_page: "条 / 页" }}
          // 改每页条数时 rc-pagination 会先 onShowSizeChange（旧页码）再 onChange（钳过的页码），只接后者
          onChange={handlePagination}
        />
      </div>
    </div>
  );
};

const SegmentButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 text-13 transition-colors",
      active ? "bg-surface-1 font-medium text-primary shadow-sm" : "text-secondary hover:text-primary"
    )}
  >
    {children}
  </button>
);
