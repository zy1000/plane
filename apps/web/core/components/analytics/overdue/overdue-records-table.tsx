/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import type { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { Button } from "@plane/propel/button";
import { renderFormattedDate } from "@plane/utils";
import type { TOverdueEntityType, TOverdueRecord } from "@plane/types";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { useAppRouter } from "@/hooks/use-app-router";
import { recordMatchesConditions } from "./filters/match-overdue-record";
import { useOverdueFilter } from "./filters/use-overdue-filter";
import { useOverdueFiltersConfig } from "./filters/use-overdue-filters-config";
import { useOverdueExport } from "./use-overdue-export";
import { DataTable } from "../insight-table/data-table";

type Props = {
  records: TOverdueRecord[];
  isLoading?: boolean;
};

const ENTITY_LABEL_MAP: Record<TOverdueEntityType, string> = {
  issue: "工作项",
  cycle: "迭代",
  release: "发布",
  test_plan: "测试计划",
};

const formatDate = (value: string | null) => (value ? (renderFormattedDate(value) ?? value) : "-");

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

export const OverdueRecordsTable = observer(({ records, isLoading = false }: Props) => {
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
  });
  const conditions = filter.allConditionsForDisplay;

  const filteredRecords = useMemo(
    () => records.filter((record) => recordMatchesConditions(record, conditions)),
    [conditions, records]
  );

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
        header: () => <div className="text-right">延期天数</div>,
        cell: ({ row }) => <div className="text-right">{row.original.overdue_days}</div>,
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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-md border border-subtle bg-layer-1" />
        ))}
      </div>
    );
  }

  return (
    <DataTable
      data={filteredRecords}
      columns={columns}
      searchPlaceholder={`${filteredRecords.length} 条延期记录`}
      searchTriggerPosition="actions-left"
      enablePagination
      pageSize={20}
      filtersRow={<FiltersRow filter={filter} />}
      actions={() => (
        <div className="flex items-center gap-2">
          <FiltersToggle filter={filter} triggerClassName="h-8 w-8" iconButtonSize="xl" />
          <Button
            variant="secondary"
            className="h-8 px-3 text-12"
            loading={isExporting}
            disabled={isExporting || filteredRecords.length === 0}
            onClick={() => void exportXlsx(filteredRecords)}
          >
            导出
          </Button>
        </div>
      )}
    />
  );
});
