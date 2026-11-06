/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { PriorityIcon } from "@plane/propel/icons";
import type { TIssuePriorities } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TUserWorkRow, TUserWorkStatus } from "@/types/user-work";
import type { TWorkGroup } from "./work-groups";
import {
  WORK_TYPE_ICON,
  WORK_TYPE_ICON_CLASS,
  formatActedAt,
  formatDay,
  formatDayFull,
  overdueDays,
  resolveProcessedAction,
  resolveStatus,
  rowContext,
  workTypeLabel,
} from "./work-types";
import type { TPillTone } from "./work-types";

type TTranslate = (key: string, params?: Record<string, string | number>) => string;

export type TWorkColumn = {
  key: string;
  label: string;
  /** CSS grid 轨道，如 "150px" / "minmax(0,1fr)" */
  track: string;
  render: (row: TUserWorkRow) => ReactNode;
};

// ─────────────────────────── 单元格 ───────────────────────────

const PILL_TONE_CLASS: Record<TPillTone, string> = {
  neutral: "bg-layer-1 text-secondary",
  blue: "bg-[#eff4ff] text-[#175cd3]",
  amber: "bg-warning-subtle text-warning-primary",
  green: "bg-success-subtle text-success-primary",
  red: "bg-danger-subtle text-danger-primary",
  purple: "bg-[#f4f1fd] text-[#6941c6]",
};

export function WorkPill({ label, tone, color }: { label: string; tone: TPillTone; color?: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2 text-12 font-medium whitespace-nowrap",
        PILL_TONE_CLASS[tone]
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current opacity-90" style={color ? { backgroundColor: color } : undefined} />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function CodeCell({ row }: { row: TUserWorkRow }) {
  const { t } = useTranslation();
  const Icon = WORK_TYPE_ICON[row.type];
  return (
    <span className="flex min-w-0 items-center gap-2 text-13 text-secondary tabular-nums" title={workTypeLabel(t, row.type)}>
      <Icon className={cn("size-4 shrink-0", WORK_TYPE_ICON_CLASS[row.type])} />
      <span className="truncate">{row.code || "—"}</span>
    </span>
  );
}

export function TitleCell({ row, withContext = true }: { row: TUserWorkRow; withContext?: boolean }) {
  const { t } = useTranslation();
  const context = withContext ? rowContext(t, row) : null;
  const isUrgent = row.priority === "urgent" || row.priority === "high";
  return (
    <span className="flex min-w-0 items-baseline gap-2.5" title={row.title}>
      <span className="min-w-0 shrink truncate text-14 text-primary" style={{ flex: "0 1 auto" }}>
        {row.title || "—"}
      </span>
      {isUrgent && (row.type === "work_item" || row.type === "defect") && (
        <span className="shrink-0 rounded-sm bg-danger-subtle px-1.5 py-px text-11 font-medium text-danger-primary">
          {row.priority === "urgent" ? "紧急" : "高"}
        </span>
      )}
      {context && (
        <span className="min-w-0 truncate text-12 text-tertiary" style={{ flex: "0 4 auto" }}>
          {context}
        </span>
      )}
    </span>
  );
}

export function OwnerCell({ row }: { row: TUserWorkRow }) {
  if (!row.owner) return <span className="text-placeholder">—</span>;
  const initial = (row.owner.identifier || row.owner.name || "?").slice(0, 1).toUpperCase();
  return (
    <span className="flex min-w-0 items-center gap-2 text-13 text-secondary" title={row.owner.name}>
      <span className="grid size-[18px] shrink-0 place-items-center rounded bg-layer-1 text-10 font-semibold text-secondary">
        {initial}
      </span>
      <span className="truncate">{row.owner.name}</span>
    </span>
  );
}

export function StatusCell({ row, status }: { row: TUserWorkRow; status?: TUserWorkStatus | null }) {
  const { t } = useTranslation();
  const resolved = resolveStatus(t, row, status === undefined ? row.status : status);
  if (resolved.label === "—") return <span className="text-placeholder">—</span>;
  return <WorkPill label={resolved.label} tone={resolved.tone} color={resolved.color} />;
}

export function TodoCell({ row }: { row: TUserWorkRow }) {
  const { t } = useTranslation();
  if (!row.action) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="font-medium text-primary">{t(`profile.work.actions.${row.action.key}`)}</span>
      <span className="text-12 text-tertiary">{t(`profile.work.roles.${row.action.role}`)}</span>
    </span>
  );
}

export function DueCell({ row }: { row: TUserWorkRow }) {
  const { t } = useTranslation();
  if (!row.due_date) return <span className="text-placeholder">—</span>;
  const bucket = row.due_bucket;
  const days = bucket === "overdue" ? overdueDays(row.due_date) : 0;
  return (
    <span
      className={cn("flex items-center gap-2 text-13 tabular-nums whitespace-nowrap", bucket === "overdue" ? "font-medium text-danger-primary" : "text-secondary")}
      title={formatDayFull(row.due_date)}
    >
      <span>{formatDay(row.due_date)}</span>
      {bucket === "overdue" && days > 0 && (
        <span className="rounded-sm bg-danger-subtle px-1.5 py-px text-11 font-medium text-danger-primary">
          {t("profile.work.due.overdue_days", { days })}
        </span>
      )}
      {bucket === "today" && (
        <span className="rounded-sm bg-warning-subtle px-1.5 py-px text-11 font-medium text-warning-primary">
          {t("profile.work.due.today")}
        </span>
      )}
      {bucket === "week" && (
        <span className="rounded-sm bg-[#eff4ff] px-1.5 py-px text-11 font-medium text-[#175cd3]">
          {t("profile.work.due.this_week")}
        </span>
      )}
    </span>
  );
}

export function DateCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-placeholder">—</span>;
  return (
    <span className="text-13 text-secondary tabular-nums whitespace-nowrap" title={formatDayFull(value)}>
      {formatDay(value)}
    </span>
  );
}

export function ActedAtCell({ row }: { row: TUserWorkRow }) {
  return (
    <span className="text-13 text-secondary tabular-nums whitespace-nowrap" title={row.acted_at ?? undefined}>
      {formatActedAt(row.acted_at) || "—"}
    </span>
  );
}

export function ProcessedActionCell({ row }: { row: TUserWorkRow }) {
  const { t } = useTranslation();
  const resolved = resolveProcessedAction(t, row);
  if (!resolved) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <WorkPill label={resolved.label} tone={resolved.tone} />
      {resolved.detail && <span className="truncate text-12 text-tertiary">{resolved.detail}</span>}
    </span>
  );
}

export function PriorityCell({ row }: { row: TUserWorkRow }) {
  if (!row.priority || row.priority === "none") return <span className="text-placeholder">—</span>;
  return (
    <span className="flex items-center">
      <PriorityIcon priority={row.priority as TIssuePriorities} size={14} withContainer />
    </span>
  );
}

export function TextCell({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-placeholder">—</span>;
  return (
    <span className="truncate text-13 text-secondary" title={value}>
      {value}
    </span>
  );
}

export function TransitionCell({ row }: { row: TUserWorkRow }) {
  const from = row.meta?.from_state;
  const to = row.meta?.to_state;
  if (!from && !to) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-13 text-secondary whitespace-nowrap">
      <span className="truncate">{from?.name ?? "—"}</span>
      <span className="text-placeholder">→</span>
      <span className="truncate text-primary">{to?.name ?? "—"}</span>
    </span>
  );
}

// ─────────────────────────── 列定义 ───────────────────────────

/**
 * 三个视图的列：全部类型混排时用统一列；只看某一类时换成这一类的专属列
 * （评审活动多「所属评审 / 阶段」、审批多「流转 / 申请人」……）。
 */
export function buildColumns(t: TTranslate, view: "pending" | "processed" | "initiated", type: string | null): TWorkColumn[] {
  const col = (key: string, label: string, track: string, render: (row: TUserWorkRow) => ReactNode): TWorkColumn => ({
    key,
    label,
    track,
    render,
  });
  const c = {
    code: col("code", t("profile.work.columns.code"), "150px", (row) => <CodeCell row={row} />),
    standardCode: col("code", t("profile.work.columns.standard_code"), "120px", (row) => <CodeCell row={row} />),
    title: col("title", t("profile.work.columns.title"), "minmax(0,1fr)", (row) => <TitleCell row={row} />),
    name: col("title", t("profile.work.columns.name"), "minmax(0,1fr)", (row) => <TitleCell row={row} withContext={false} />),
    owner: col("owner", t("profile.work.columns.owner"), "200px", (row) => <OwnerCell row={row} />),
    project: col("owner", t("profile.work.columns.project"), "190px", (row) => <OwnerCell row={row} />),
    status: col("status", t("profile.work.columns.status"), "110px", (row) => <StatusCell row={row} />),
    todo: col("todo", t("profile.work.columns.todo"), "130px", (row) => <TodoCell row={row} />),
    due: col("due", t("profile.work.columns.due_date"), "140px", (row) => <DueCell row={row} />),
    plannedEnd: col("due", t("profile.work.columns.planned_end"), "140px", (row) => <DueCell row={row} />),
    priority: col("priority", t("profile.work.columns.priority"), "72px", (row) => <PriorityCell row={row} />),
    createdAt: col("created", t("profile.work.columns.created_at"), "100px", (row) => <DateCell value={row.created_at} />),
    requestedAt: col("created", t("profile.work.columns.created_at"), "100px", (row) => <DateCell value={row.meta?.requested_at ?? row.created_at} />),
    requester: col("requester", t("profile.work.columns.requester"), "110px", (row) => <TextCell value={row.meta?.requester} />),
    transition: col("transition", t("profile.work.columns.transition"), "190px", (row) => <TransitionCell row={row} />),
    stage: col("stage", t("profile.work.columns.stage"), "90px", (row) => <TextCell value={row.meta?.stage} />),
    product: col("product", t("profile.work.columns.product"), "120px", (row) => <TextCell value={row.meta?.product} />),
    parentReview: col("parent", t("profile.work.columns.parent_review"), "160px", (row) => <TextCell value={row.meta?.parent_title} />),
    plan: col("plan", t("profile.work.columns.plan"), "180px", (row) => <TextCell value={row.meta?.plan_name} />),
    caseReview: col("review", t("profile.work.columns.case_review"), "180px", (row) => <TextCell value={row.meta?.review_name} />),
    action: col("action", t("profile.work.columns.action"), "170px", (row) => <ProcessedActionCell row={row} />),
    actedAt: col("acted", t("profile.work.columns.acted_at"), "120px", (row) => <ActedAtCell row={row} />),
    currentStatus: col("current", t("profile.work.columns.current_status"), "110px", (row) => (
      <StatusCell row={row} status={row.current_status ?? row.status} />
    )),
  };

  if (view === "processed") return [c.code, c.title, c.owner, c.action, c.actedAt, c.currentStatus];
  if (view === "initiated") return [c.code, c.title, c.owner, c.status, c.createdAt];

  switch (type) {
    case "review":
      return [c.standardCode, c.name, c.project, c.stage, c.product, c.status, c.todo, c.plannedEnd];
    case "review_activity":
      return [c.standardCode, c.name, c.parentReview, c.project, c.stage, c.status, c.todo, c.plannedEnd];
    case "issue_approval":
      return [c.code, c.name, c.transition, c.requester, c.project, c.status, c.todo, c.requestedAt];
    case "requirement_change":
      return [c.code, c.name, c.requester, c.owner, c.status, c.todo, c.requestedAt];
    case "tailoring_approval":
      return [c.name, c.requester, c.project, c.status, c.todo, c.requestedAt];
    case "work_item":
    case "defect":
      return [c.code, c.name, c.project, c.status, c.priority, c.todo, c.due];
    case "requirement":
      return [c.code, c.name, c.owner, c.status, c.priority, c.todo, c.due];
    case "case_execution":
    case "plan_review":
      return [c.code, c.name, c.plan, c.project, c.status, c.todo];
    case "case_review":
      return [c.code, c.name, c.caseReview, c.owner, c.status, c.todo];
    default:
      return [c.code, c.title, c.owner, c.status, c.todo, c.due];
  }
}

// ─────────────────────────── 表格 ───────────────────────────

type Props = {
  columns: TWorkColumn[];
  groups: TWorkGroup[];
  onOpen: (row: TUserWorkRow) => void;
  isLoading?: boolean;
  emptyText: string;
  footer?: ReactNode;
};

export function WorkTable({ columns, groups, onOpen, isLoading, emptyText, footer }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const template = columns.map((column) => column.track).join(" ");
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const showGroupHeaders = !(groups.length === 1 && groups[0].label === "");

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          role="row"
          className="sticky top-0 z-[2] grid h-9 items-center border-b border-subtle bg-surface-2 px-4 text-12 font-medium text-tertiary"
          style={{ gridTemplateColumns: template }}
        >
          {columns.map((column) => (
            <span key={column.key} className="truncate pr-3">
              {column.label}
            </span>
          ))}
        </div>

        {isLoading && total === 0 && (
          <Loader className="space-y-2 p-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <Loader.Item key={index} height="36px" width="100%" />
            ))}
          </Loader>
        )}

        {!isLoading && total === 0 && (
          <div className="grid h-48 place-items-center text-14 text-placeholder">{emptyText}</div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <div key={group.key}>
              {showGroupHeaders && (
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(group.key)}
                  className="flex h-10 w-full items-center gap-2 border-b border-subtle bg-surface-1 px-3 text-left hover:bg-layer-transparent-hover"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-4 text-tertiary" />
                  ) : (
                    <ChevronDown className="size-4 text-tertiary" />
                  )}
                  <span
                    className={cn(
                      "text-14 font-semibold",
                      group.tone === "danger" ? "text-danger-primary" : group.tone === "warning" ? "text-warning-primary" : "text-primary"
                    )}
                  >
                    {group.label}
                  </span>
                  {group.sublabel && <span className="text-13 text-tertiary">{group.sublabel}</span>}
                  <span className="rounded-full bg-layer-1 px-2 py-px text-12 text-tertiary tabular-nums">{group.count}</span>
                </button>
              )}
              {!isCollapsed &&
                group.rows.map((row) => (
                  <div
                    key={row.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpen(row);
                      }
                    }}
                    className="grid h-11 cursor-pointer items-center border-b border-subtle/60 px-4 text-14 outline-none transition-colors hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-hover"
                    style={{ gridTemplateColumns: template }}
                  >
                    {columns.map((column) => (
                      <div key={column.key} className="min-w-0 pr-3">
                        {column.render(row)}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
