/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import type { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { Button } from "@plane/propel/button";
import { Header } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import type { TOverdueEntityType, TOverdueRecord } from "@plane/types";
import { CountChip } from "@/components/common/count-chip";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useAppRouter } from "@/hooks/use-app-router";
import { recordMatchesConditions } from "./filters/match-overdue-record";
import { useOverdueFilter } from "./filters/use-overdue-filter";
import { useOverdueFiltersConfig } from "./filters/use-overdue-filters-config";
import { useOverdueExport } from "./use-overdue-export";
import { DataTable } from "../insight-table/data-table";
import { TableLoader } from "../insight-table/loader";

type Props = {
  records: TOverdueRecord[];
  isLoading?: boolean;
  onOpenAnalytics?: () => void;
};

type TQuickStatusFilter = "all" | "active" | "resolved";

const ENTITY_LABEL_MAP: Record<TOverdueEntityType, string> = {
  issue: "工作项",
  cycle: "迭代",
  release: "发布",
  test_plan: "测试计划",
};

const QUICK_STATUS_FILTERS: Array<{ key: Exclude<TQuickStatusFilter, "all">; label: string }> = [
  { key: "active", label: "正在延期" },
  { key: "resolved", label: "历史延期" },
];

const formatDate = (value: string | null) => (value ? (renderFormattedDate(value) ?? value) : "-");

function OverdueRecordsTitle({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <h2 className="text-13 font-medium text-primary">全部延期记录</h2>
      {count > 0 ? <CountChip count={count} /> : null}
    </div>
  );
}

const buildEntityDetailLink = (workspaceSlug: string, record: TOverdueRecord) => {
  const { entity_type, entity_id, project_id, identifier } = record;
  if (!workspaceSlug || !entity_id) return null;

  switch (entity_type) {
    case "issue":
      if (identifier) {
        return `/${workspaceSlug}/browse/${identifier}/`;
      }
      return project_id ? `/${workspaceSlug}/projects/${project_id}/issues/${entity_id}` : null;
    case "cycle":
      return project_id ? `/${workspaceSlug}/projects/${project_id}/cycles/${entity_id}/overview` : null;
    case "release":
      return project_id ? `/${workspaceSlug}/projects/${project_id}/releases/${entity_id}/overview` : null;
    case "test_plan":
      return project_id ? `/${workspaceSlug}/projects/${project_id}/testhub/plan-cases?planId=${entity_id}` : null;
    default:
      return null;
  }
};

export const OverdueRecordsTable = observer(({ records, isLoading = false, onOpenAnalytics }: Props) => {
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  const { exportXlsx, isExporting } = useOverdueExport();
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const { areAllConfigsInitialized, configs } = useOverdueFiltersConfig({
    records,
    workspaceSlug: workspaceSlugValue,
  });
  const filter = useOverdueFilter({
    areAllConfigsInitialized,
    configs,
    workspaceSlug: workspaceSlugValue,
  });
  const conditions = filter.allConditionsForDisplay;
  const [quickStatusFilter, setQuickStatusFilter] = useState<TQuickStatusFilter>("all");

  const recordsByFilterConditions = useMemo(
    () => records.filter((record) => recordMatchesConditions(record, conditions)),
    [conditions, records]
  );
  const quickFilteredRecords = useMemo(() => {
    if (quickStatusFilter === "active") {
      return recordsByFilterConditions.filter((record) => record.is_active);
    }
    if (quickStatusFilter === "resolved") {
      return recordsByFilterConditions.filter((record) => !record.is_active);
    }
    return recordsByFilterConditions;
  }, [quickStatusFilter, recordsByFilterConditions]);

  const columns: ColumnDef<TOverdueRecord>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: () => "名称",
        cell: ({ row }) => {
          const href = buildEntityDetailLink(workspaceSlugValue, row.original);

          if (!href) {
            return (
              <div className="max-w-[320px] truncate" title={row.original.name}>
                {row.original.name}
              </div>
            );
          }

          return (
            <button
              type="button"
              title={row.original.name}
              className="max-w-[320px] cursor-pointer truncate text-left text-primary hover:text-accent-primary hover:underline"
              onClick={() => router.push(href)}
            >
              {row.original.name}
            </button>
          );
        },
      },
      {
        accessorKey: "entity_type",
        header: () => "类型",
        cell: ({ row }) => ENTITY_LABEL_MAP[row.original.entity_type],
      },
      {
        accessorKey: "project_name",
        header: () => "项目",
        cell: ({ row }) => (
          <div className="max-w-[220px] truncate" title={row.original.project_name}>
            {row.original.project_name || "-"}
          </div>
        ),
      },
      {
        accessorKey: "status_label",
        header: () => "状态",
        cell: ({ row }) => (
          <span>{row.original.is_active ? `仍在延期 · ${row.original.status_label}` : `已恢复 · ${row.original.status_label}`}</span>
        ),
      },
      {
        accessorKey: "deadline",
        header: () => "截止日期",
        cell: ({ row }) => formatDate(row.original.deadline),
      },
      {
        accessorKey: "overdue_since",
        header: () => "延期开始",
        cell: ({ row }) => formatDate(row.original.overdue_since),
      },
      {
        accessorKey: "overdue_days",
        header: () => <div className="text-center">延期天数</div>,
        cell: ({ row }) => <div className="text-center">{row.original.overdue_days}</div>,
      },
      {
        accessorKey: "assignees",
        header: () => "负责人",
        cell: ({ row }) =>
          row.original.assignees.length > 0
            ? row.original.assignees.map((assignee) => assignee.display_name).join(", ")
            : "-",
      },
    ],
    [router, workspaceSlugValue]
  );

  const count = quickFilteredRecords.length;
  const title = <OverdueRecordsTitle count={count} />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-1">
      {isLoading ? (
        <>
          <Header className="h-11 border-b border-subtle px-page-x">
            <Header.LeftItem>{title}</Header.LeftItem>
          </Header>
          <div className="min-h-0 flex-1 overflow-hidden">
            <TableLoader columns={columns} rows={8} />
          </div>
        </>
      ) : (
        <DataTable
          data={quickFilteredRecords}
          columns={columns}
          searchPlaceholder={`${count} 条延期记录`}
          toolbarLabel={title}
          searchTriggerPosition="actions-left"
          enablePagination
          pageSize={20}
          showPaginationSummary={false}
          fillHeight
          filtersRow={<FiltersRow filter={filter} />}
          actions={() => (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-md border border-subtle bg-surface-1 p-0.5">
                {QUICK_STATUS_FILTERS.map((item) => {
                  const isActive = quickStatusFilter === item.key;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={isActive}
                      className={cn(
                        "h-6 rounded-sm px-2 text-11 transition-colors",
                        isActive ? "bg-accent-subtle font-medium text-accent-primary" : "text-secondary hover:bg-layer-2-hover"
                      )}
                      onClick={() =>
                        setQuickStatusFilter((current) => (current === item.key ? "all" : item.key))
                      }
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <FiltersToggle filter={filter} triggerClassName="h-8 w-8" iconButtonSize="xl" />
              <Button
                variant="secondary"
                className="h-8 px-3 text-12"
                loading={isExporting}
                disabled={isExporting || count === 0}
                onClick={() => void exportXlsx(quickFilteredRecords)}
              >
                导出
              </Button>
              <Button variant="secondary" size="lg" className="hidden px-2 md:block" onClick={onOpenAnalytics}>
                分析
              </Button>
            </div>
          )}
        />
      )}
    </div>
  );
});
