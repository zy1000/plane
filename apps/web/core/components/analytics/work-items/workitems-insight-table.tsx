/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import type { Column, ColumnDef, Row, RowData, Table } from "@tanstack/react-table";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, UserRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ProjectIcon } from "@plane/propel/icons";
// plane package imports
import type { AnalyticsTableDataMap, WorkItemInsightColumns } from "@plane/types";
// plane web components
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { AnalyticsService } from "@/services/analytics.service";
// plane web components
import { exportCSV } from "../export";
import { DataTable } from "../insight-table/data-table";
import { InsightTable } from "../insight-table";
import { TableLoader } from "../insight-table/loader";
import type { TWorkItemsProjectRow, TWorkItemsStatusKey } from "./use-work-items-analysis";

const analyticsService = new AnalyticsService();

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    export: {
      key: string;
      value: (row: Row<TData>) => string | number;
      label?: string;
      _value?: TValue;
    };
  }
}

type TWorkItemsInsightTableProps = {
  isLoading?: boolean;
  rows?: TWorkItemsProjectRow[];
  workspaceSlug?: string;
};

const STATUS_STYLES: Record<TWorkItemsStatusKey, { dot: string; bar: string; text: string }> = {
  backlog: {
    dot: "bg-warning-primary",
    bar: "bg-warning-primary",
    text: "text-warning-primary",
  },
  unstarted: {
    dot: "bg-layer-3",
    bar: "bg-layer-3",
    text: "text-secondary",
  },
  started: {
    dot: "bg-accent-primary",
    bar: "bg-accent-primary",
    text: "text-accent-primary",
  },
  completed: {
    dot: "bg-success-primary",
    bar: "bg-success-primary",
    text: "text-success-primary",
  },
  cancelled: {
    dot: "bg-danger-primary/80",
    bar: "bg-danger-primary/80",
    text: "text-danger-primary",
  },
};

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
  column: Column<TWorkItemsProjectRow, TValue>;
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

const RatioBar = ({ barClassName, value }: { barClassName: string; value: number }) => {
  const percentage = Math.min(Math.max(value, 0), 100);

  return (
    <div className="flex min-w-[120px] items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-layer-2">
        <div className={cn("h-full rounded-full", barClassName)} style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-10 text-right text-13 text-primary tabular-nums">{percentage}%</span>
    </div>
  );
};

const NumberCell = ({ children, tone }: { children: number; tone?: "default" | "warning" | "success" | "muted" }) => (
  <div
    className={cn("text-right text-13 tabular-nums", {
      "text-primary": !tone || tone === "default",
      "font-medium text-warning-primary": tone === "warning",
      "font-medium text-success-primary": tone === "success",
      "text-secondary": tone === "muted",
    })}
  >
    {children}
  </div>
);

const ProjectCell = ({
  row,
  onOpenProject,
}: {
  row: TWorkItemsProjectRow;
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

const StatusMixCell = ({ row }: { row: TWorkItemsProjectRow }) => (
  <div className="min-w-[190px]">
    <div className="flex h-1.5 overflow-hidden rounded-full bg-layer-2" aria-label={`${row.projectName} 状态构成`}>
      {row.segments.map((segment) =>
        segment.value > 0 ? (
          <div
            key={segment.key}
            className={STATUS_STYLES[segment.key].bar}
            style={{ width: `${segment.ratio}%` }}
            title={`${segment.label}: ${segment.value} (${segment.ratio}%)`}
          />
        ) : null
      )}
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-2 text-11 text-placeholder">
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", STATUS_STYLES[row.dominantStatus].dot)} />
        <span className="truncate">
          主要：
          <span className={cn("font-medium", STATUS_STYLES[row.dominantStatus].text)}>{row.dominantStatusLabel}</span>
        </span>
      </span>
      <span className="flex-shrink-0 tabular-nums">{row.totalWorkItems} 项</span>
    </div>
  </div>
);

const ProjectWorkItemsTable = ({
  isLoading = false,
  rows = [],
  workspaceSlug = "",
}: {
  isLoading?: boolean;
  rows?: TWorkItemsProjectRow[];
  workspaceSlug?: string;
}) => {
  const { t } = useTranslation();
  const router = useAppRouter();
  const openProject = useCallback(
    (projectId: string) => router.push(`/${workspaceSlug}/projects/${projectId}/issues/`),
    [router, workspaceSlug]
  );

  const columns: ColumnDef<TWorkItemsProjectRow>[] = useMemo(
    () => [
      {
        accessorKey: "projectSearchValue",
        header: ({ column }) => <SortHeader column={column} label="项目" />,
        cell: ({ row }) => <ProjectCell row={row.original} onOpenProject={openProject} />,
        meta: {
          export: {
            key: "project",
            label: "项目",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.projectName,
          },
        },
      },
      {
        id: "statusMix",
        accessorFn: (row) => row.totalWorkItems,
        header: ({ column }) => <SortHeader column={column} label="状态构成" />,
        cell: ({ row }) => <StatusMixCell row={row.original} />,
        meta: {
          export: {
            key: "totalWorkItems",
            label: "工作项总数",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.totalWorkItems,
          },
        },
      },
      {
        accessorKey: "activeWorkItems",
        header: ({ column }) => <SortHeader column={column} label="活跃库存" align="right" />,
        cell: ({ row }) => (
          <NumberCell tone={row.original.activeWorkItems > 0 ? "default" : "muted"}>
            {row.original.activeWorkItems}
          </NumberCell>
        ),
        meta: {
          export: {
            key: "activeWorkItems",
            label: "活跃库存",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.activeWorkItems,
          },
        },
      },
      {
        accessorKey: "backlogWorkItems",
        header: ({ column }) => <SortHeader column={column} label="待办" align="right" />,
        cell: ({ row }) => <NumberCell tone="warning">{row.original.backlogWorkItems}</NumberCell>,
        meta: {
          export: {
            key: "backlogWorkItems",
            label: "待办",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.backlogWorkItems,
          },
        },
      },
      {
        accessorKey: "unstartedWorkItems",
        header: ({ column }) => <SortHeader column={column} label="未开始" align="right" />,
        cell: ({ row }) => <NumberCell>{row.original.unstartedWorkItems}</NumberCell>,
        meta: {
          export: {
            key: "unstartedWorkItems",
            label: "未开始",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.unstartedWorkItems,
          },
        },
      },
      {
        accessorKey: "startedWorkItems",
        header: ({ column }) => <SortHeader column={column} label="进行中" align="right" />,
        cell: ({ row }) => <NumberCell>{row.original.startedWorkItems}</NumberCell>,
        meta: {
          export: {
            key: "startedWorkItems",
            label: "进行中",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.startedWorkItems,
          },
        },
      },
      {
        accessorKey: "completedWorkItems",
        header: ({ column }) => <SortHeader column={column} label="已完成" align="right" />,
        cell: ({ row }) => <NumberCell tone="success">{row.original.completedWorkItems}</NumberCell>,
        meta: {
          export: {
            key: "completedWorkItems",
            label: "已完成",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.completedWorkItems,
          },
        },
      },
      {
        accessorKey: "cancelledWorkItems",
        header: ({ column }) => <SortHeader column={column} label="已取消" align="right" />,
        cell: ({ row }) => <NumberCell tone="muted">{row.original.cancelledWorkItems}</NumberCell>,
        meta: {
          export: {
            key: "cancelledWorkItems",
            label: "已取消",
            value: (row: Row<TWorkItemsProjectRow>) => row.original.cancelledWorkItems,
          },
        },
      },
      {
        accessorKey: "completionRate",
        header: ({ column }) => <SortHeader column={column} label="完成率" align="right" />,
        cell: ({ row }) => <RatioBar barClassName="bg-success-primary" value={row.original.completionRate} />,
        meta: {
          export: {
            key: "completionRate",
            label: "完成率",
            value: (row: Row<TWorkItemsProjectRow>) => `${row.original.completionRate}%`,
          },
        },
      },
      {
        accessorKey: "cancelledRate",
        header: ({ column }) => <SortHeader column={column} label="取消率" align="right" />,
        cell: ({ row }) => <RatioBar barClassName="bg-danger-primary/80" value={row.original.cancelledRate} />,
        meta: {
          export: {
            key: "cancelledRate",
            label: "取消率",
            value: (row: Row<TWorkItemsProjectRow>) => `${row.original.cancelledRate}%`,
          },
        },
      },
    ],
    [openProject]
  );

  return (
    <section className="rounded-md border border-subtle bg-surface-1 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-15 font-semibold text-primary">项目状态矩阵</h2>
          <p className="mt-1 text-12 text-secondary">对比各项目工作项在待办、未开始、进行中、完成和取消中的分布。</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[1160px]">
          {isLoading ? (
            <TableLoader columns={columns} rows={8} />
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              searchPlaceholder={`${rows.length} 个项目`}
              actions={(table: Table<TWorkItemsProjectRow>) => (
                <Button
                  variant="secondary"
                  prependIcon={<Download className="h-3.5 w-3.5" />}
                  onClick={() => exportCSV(table.getFilteredRowModel().rows, columns, workspaceSlug)}
                >
                  <div>{t("exporter.csv.short_description")}</div>
                </Button>
              )}
              enablePagination
              pageSize={12}
            />
          )}
        </div>
      </div>
    </section>
  );
};

const LegacyWorkItemsInsightTable = observer(function LegacyWorkItemsInsightTable() {
  // router
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const { t } = useTranslation();
  // store hooks
  const { getProjectById } = useProject();
  const { selectedDuration, selectedProjects, selectedCycle, selectedModule, isPeekView, isEpic } = useAnalytics();
  const { data: workItemsData, isLoading } = useSWR(
    `insights-table-work-items-${workspaceSlug}-${selectedDuration}-${selectedProjects}-${selectedCycle}-${selectedModule}-${isPeekView}-${isEpic}`,
    () =>
      analyticsService.getAdvanceAnalyticsStats<WorkItemInsightColumns[]>(
        workspaceSlug,
        "work-items",
        {
          date_filter: selectedDuration,
          ...(selectedProjects?.length > 0 ? { project_ids: selectedProjects.join(",") } : {}),
          ...(selectedCycle ? { cycle_id: selectedCycle } : {}),
          ...(selectedModule ? { module_id: selectedModule } : {}),
          ...(isEpic ? { epic: true } : {}),
        },
        isPeekView
      )
  );
  // derived values
  const columnsLabels: Record<keyof Omit<WorkItemInsightColumns, "project_id" | "avatar_url" | "assignee_id">, string> =
    useMemo(
      () => ({
        backlog_work_items: t("workspace_projects.state.backlog"),
        started_work_items: t("workspace_projects.state.started"),
        un_started_work_items: t("workspace_projects.state.unstarted"),
        completed_work_items: t("workspace_projects.state.completed"),
        cancelled_work_items: t("workspace_projects.state.cancelled"),
        project__name: t("common.project"),
        display_name: t("common.assignee"),
      }),
      [t]
    );
  const columns: ColumnDef<AnalyticsTableDataMap["work-items"]>[] = useMemo(
    () => [
      !isPeekView
        ? {
            accessorKey: "project__name",
            header: () => <div className="text-left">{columnsLabels["project__name"]}</div>,
            cell: ({ row }) => {
              const project = getProjectById(row.original.project_id);
              return (
                <div className="flex items-center gap-2">
                  {project?.logo_props ? (
                    <Logo logo={project.logo_props} size={18} />
                  ) : (
                    <ProjectIcon className="h-4 w-4" />
                  )}
                  {project?.name ?? row.original.project__name}
                </div>
              );
            },
            meta: {
              export: {
                key: columnsLabels["project__name"],
                value: (row: Row<WorkItemInsightColumns>) => row.original.project__name?.toString() ?? "",
              },
            },
          }
        : {
            accessorKey: "display_name",
            header: () => <div className="text-left">{columnsLabels["display_name"]}</div>,
            cell: ({ row }: { row: Row<WorkItemInsightColumns> }) => (
              <div className="text-left">
                <div className="flex items-center gap-2">
                  {row.original.avatar_url && row.original.avatar_url !== "" ? (
                    <Avatar
                      name={row.original.display_name}
                      src={getFileURL(row.original.avatar_url)}
                      size={24}
                      shape="circle"
                    />
                  ) : (
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-layer-1 capitalize">
                      {row.original.display_name ? (
                        row.original.display_name?.[0]
                      ) : (
                        <UserRound className="text-secondary" size={12} />
                      )}
                    </div>
                  )}
                  <span className="break-words text-secondary">{row.original.display_name ?? t(`Unassigned`)}</span>
                </div>
              </div>
            ),
            meta: {
              export: {
                key: columnsLabels["display_name"],
                value: (row: Row<WorkItemInsightColumns>) => row.original.display_name?.toString() ?? "",
              },
            },
          },
      {
        accessorKey: "backlog_work_items",
        header: () => <div className="text-right">{columnsLabels["backlog_work_items"]}</div>,
        cell: ({ row }) => <div className="text-right">{row.original.backlog_work_items}</div>,
        meta: {
          export: {
            key: columnsLabels["backlog_work_items"],
            value: (row: Row<WorkItemInsightColumns>) => row.original.backlog_work_items.toString(),
          },
        },
      },
      {
        accessorKey: "started_work_items",
        header: () => <div className="text-right">{columnsLabels["started_work_items"]}</div>,
        cell: ({ row }) => <div className="text-right">{row.original.started_work_items}</div>,
        meta: {
          export: {
            key: columnsLabels["started_work_items"],
            value: (row: Row<WorkItemInsightColumns>) => row.original.started_work_items.toString(),
          },
        },
      },
      {
        accessorKey: "un_started_work_items",
        header: () => <div className="text-right">{columnsLabels["un_started_work_items"]}</div>,
        cell: ({ row }) => <div className="text-right">{row.original.un_started_work_items}</div>,
        meta: {
          export: {
            key: columnsLabels["un_started_work_items"],
            value: (row: Row<WorkItemInsightColumns>) => row.original.un_started_work_items.toString(),
          },
        },
      },
      {
        accessorKey: "completed_work_items",
        header: () => <div className="text-right">{columnsLabels["completed_work_items"]}</div>,
        cell: ({ row }) => <div className="text-right">{row.original.completed_work_items}</div>,
        meta: {
          export: {
            key: columnsLabels["completed_work_items"],
            value: (row: Row<WorkItemInsightColumns>) => row.original.completed_work_items.toString(),
          },
        },
      },
      {
        accessorKey: "cancelled_work_items",
        header: () => <div className="text-right">{columnsLabels["cancelled_work_items"]}</div>,
        cell: ({ row }) => <div className="text-right">{row.original.cancelled_work_items}</div>,
        meta: {
          export: {
            key: columnsLabels["cancelled_work_items"],
            value: (row: Row<WorkItemInsightColumns>) => row.original.cancelled_work_items.toString(),
          },
        },
      },
    ],
    [columnsLabels, getProjectById, isPeekView, t]
  );
  return (
    <InsightTable<"work-items">
      analyticsType="work-items"
      data={workItemsData}
      isLoading={isLoading}
      columns={columns}
      columnsLabels={columnsLabels}
      headerText={isPeekView ? t("common.assignee") : t("common.projects")}
      onExport={(rows) => workItemsData && exportCSV(rows, columns, workspaceSlug)}
    />
  );
});

const WorkItemsInsightTable = observer(function WorkItemsInsightTable(props: TWorkItemsInsightTableProps) {
  if (props.rows) {
    return (
      <ProjectWorkItemsTable
        rows={props.rows}
        isLoading={props.isLoading ?? false}
        workspaceSlug={props.workspaceSlug ?? ""}
      />
    );
  }

  return <LegacyWorkItemsInsightTable />;
});

export default WorkItemsInsightTable;
