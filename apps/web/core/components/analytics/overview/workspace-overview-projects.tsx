/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import type { Column, ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ProjectIcon } from "@plane/propel/icons";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useAppRouter } from "@/hooks/use-app-router";
import { DataTable } from "../insight-table/data-table";
import { TableLoader } from "../insight-table/loader";
import type { TWorkspaceOverviewHealthLevel, TWorkspaceOverviewRow } from "./use-workspace-overview";

const HEALTH_BADGE_CLASSES: Record<TWorkspaceOverviewHealthLevel, string> = {
  healthy: "bg-success-subtle text-success-primary",
  watch: "bg-warning-subtle text-warning-primary",
  risk: "bg-danger-subtle text-danger-primary",
};

const HEALTH_PROGRESS_CLASSES: Record<TWorkspaceOverviewHealthLevel, string> = {
  healthy: "bg-success-primary",
  watch: "bg-warning-primary",
  risk: "bg-danger-primary",
};

const ATTENTION_LOADER_KEYS = ["attention-loader-1", "attention-loader-2", "attention-loader-3", "attention-loader-4"];

const SortIcon = ({ state }: { state: false | "asc" | "desc" }) => {
  if (state === "asc") return <ArrowUp className="h-3 w-3" />;
  if (state === "desc") return <ArrowDown className="h-3 w-3" />;
  return <ArrowUpDown className="h-3 w-3 opacity-60" />;
};

const SortHeader = <TValue,>({
  column,
  label,
  align = "left",
}: {
  column: Column<TWorkspaceOverviewRow, TValue>;
  label: string;
  align?: "left" | "right";
}) => (
  <button
    type="button"
    className={cn(
      "inline-flex w-full cursor-pointer items-center gap-1 text-12 font-medium text-secondary hover:text-primary",
      align === "right" ? "justify-end" : "justify-start"
    )}
    onClick={column.getToggleSortingHandler()}
  >
    <span>{label}</span>
    <SortIcon state={column.getIsSorted()} />
  </button>
);

const HealthBadge = ({ row }: { row: TWorkspaceOverviewRow }) => (
  <span
    title={row.health.description}
    className={cn(
      "inline-flex h-6 items-center rounded px-2 text-11 font-medium",
      HEALTH_BADGE_CLASSES[row.health.level]
    )}
  >
    {row.health.label}
  </span>
);

const CompletionBar = ({ row }: { row: TWorkspaceOverviewRow }) => {
  const percentage = Math.min(Math.max(row.completionRate, 0), 100);

  return (
    <div className="flex min-w-[120px] items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-layer-2">
        <div
          className={cn("h-full rounded-full", HEALTH_PROGRESS_CLASSES[row.health.level])}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-10 text-right text-13 text-primary tabular-nums">{percentage}%</span>
    </div>
  );
};

const ProjectCell = ({
  row,
  onOpenProject,
}: {
  row: TWorkspaceOverviewRow;
  onOpenProject: (projectId: string) => void;
}) => (
  <button
    type="button"
    className="flex max-w-[320px] cursor-pointer items-center gap-2 text-left hover:text-accent-primary"
    onClick={() => onOpenProject(row.projectId)}
  >
    <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-layer-1">
      {row.logoProps ? <Logo logo={row.logoProps} size={16} /> : <ProjectIcon className="h-4 w-4" />}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-13 font-medium text-primary">{row.projectName}</span>
      {row.projectIdentifier ? (
        <span className="block truncate text-11 text-placeholder">{row.projectIdentifier}</span>
      ) : null}
    </span>
  </button>
);

const AttentionReason = ({ row }: { row: TWorkspaceOverviewRow }) => {
  if (row.totalOverdue > 0) {
    return <span>{row.totalOverdue} 项延期</span>;
  }

  if (row.openWorkItems > 0) {
    return <span>{row.openWorkItems} 个未完成工作项</span>;
  }

  return <span>完成率 {row.completionRate}%</span>;
};

export const WorkspaceOverviewAttention = ({
  rows,
  isLoading,
  workspaceSlug,
}: {
  rows: TWorkspaceOverviewRow[];
  isLoading: boolean;
  workspaceSlug: string;
}) => {
  const router = useAppRouter();
  const openProject = useCallback(
    (projectId: string) => router.push(`/${workspaceSlug}/projects/${projectId}/overview`),
    [router, workspaceSlug]
  );

  return (
    <section className="rounded-md border border-subtle bg-surface-1">
      <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
        <CircleAlert className="h-4 w-4 text-warning-primary" />
        <h2 className="text-15 font-semibold text-primary">需重点关注的项目</h2>
      </div>
      <div className="min-h-[244px] p-3">
        {isLoading ? (
          <div className="space-y-3">
            {ATTENTION_LOADER_KEYS.map((key) => (
              <Loader key={key} className="rounded-md border border-subtle p-3">
                <Loader.Item height="16px" width="60%" />
                <Loader.Item height="12px" width="40%" />
              </Loader>
            ))}
          </div>
        ) : rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <button
                key={row.projectId}
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-layer-1"
                onClick={() => openProject(row.projectId)}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-13 font-medium text-primary">{row.projectName}</span>
                    <HealthBadge row={row} />
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1 text-12 text-secondary">
                    {row.health.level === "risk" ? (
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-danger-primary" />
                    ) : (
                      <CircleAlert className="h-3.5 w-3.5 flex-shrink-0 text-warning-primary" />
                    )}
                    <span className="truncate">
                      <AttentionReason row={row} />
                      {row.projectLeadName ? ` · 负责人：${row.projectLeadName}` : ""}
                    </span>
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
              </button>
            ))}
          </div>
        ) : (
          <div className="grid h-[220px] place-items-center rounded-md border border-dashed border-subtle">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-6 w-6 text-success-primary" />
              <div>
                <p className="text-13 font-medium text-primary">暂无需关注项目</p>
                <p className="mt-1 text-12 text-secondary">当前项目没有明显延期或进度风险。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export const WorkspaceOverviewProjectsTable = ({
  rows,
  isLoading,
  workspaceSlug,
}: {
  rows: TWorkspaceOverviewRow[];
  isLoading: boolean;
  workspaceSlug: string;
}) => {
  const router = useAppRouter();
  const [searchToolbarMount, setSearchToolbarMount] = useState<HTMLDivElement | null>(null);
  const openProject = useCallback(
    (projectId: string) => router.push(`/${workspaceSlug}/projects/${projectId}/overview`),
    [router, workspaceSlug]
  );

  const columns: ColumnDef<TWorkspaceOverviewRow>[] = useMemo(
    () => [
      {
        accessorKey: "projectSearchValue",
        header: ({ column }) => <SortHeader column={column} label="项目" />,
        cell: ({ row }) => <ProjectCell row={row.original} onOpenProject={openProject} />,
      },
      {
        accessorKey: "healthRank",
        header: ({ column }) => <SortHeader column={column} label="健康状态" />,
        cell: ({ row }) => <HealthBadge row={row.original} />,
      },
      {
        accessorKey: "completionRate",
        header: ({ column }) => <SortHeader column={column} label="完成率" align="right" />,
        cell: ({ row }) => <CompletionBar row={row.original} />,
      },
      {
        accessorKey: "openWorkItems",
        header: ({ column }) => <SortHeader column={column} label="未完成" align="right" />,
        cell: ({ row }) => <div className="text-right text-13 tabular-nums">{row.original.openWorkItems}</div>,
      },
      {
        accessorKey: "totalOverdue",
        header: ({ column }) => <SortHeader column={column} label="延期" align="right" />,
        cell: ({ row }) => (
          <div
            className={cn(
              "text-right text-13 tabular-nums",
              row.original.totalOverdue > 0 ? "font-medium text-danger-primary" : "text-secondary"
            )}
          >
            {row.original.totalOverdue}
          </div>
        ),
      },
      {
        accessorKey: "memberCount",
        header: ({ column }) => <SortHeader column={column} label="成员" align="right" />,
        cell: ({ row }) => <div className="text-right text-13 tabular-nums">{row.original.memberCount}</div>,
      },
      {
        accessorKey: "cycleCount",
        header: ({ column }) => <SortHeader column={column} label="迭代" align="right" />,
        cell: ({ row }) => <div className="text-right text-13 tabular-nums">{row.original.cycleCount}</div>,
      },
      {
        accessorKey: "moduleCount",
        header: ({ column }) => <SortHeader column={column} label="模块" align="right" />,
        cell: ({ row }) => <div className="text-right text-13 tabular-nums">{row.original.moduleCount}</div>,
      },
    ],
    [openProject]
  );

  return (
    <section className="rounded-md border border-subtle bg-surface-1 p-4">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-15 font-semibold text-primary">全部项目健康表</h2>
        <div ref={setSearchToolbarMount} />
      </div>
      {isLoading ? (
        <TableLoader columns={columns} rows={8} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder={`${rows.length} 个项目`}
          searchToolbarMount={searchToolbarMount}
          enablePagination
          pageSize={12}
        />
      )}
    </section>
  );
};
