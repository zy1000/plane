/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { renderFormattedDate } from "@plane/utils";
import type { TOverdueEntityType, TOverdueRecord } from "@plane/types";
import { DataTable } from "../insight-table/data-table";

type Props = {
  records: TOverdueRecord[];
  isLoading?: boolean;
};

type TEntityFilter = "all" | TOverdueEntityType;

const ENTITY_LABEL_MAP: Record<TOverdueEntityType, string> = {
  issue: "工作项",
  cycle: "迭代",
  release: "发布",
  test_plan: "测试计划",
};

const ENTITY_FILTER_OPTIONS: Array<{ value: TEntityFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "issue", label: "工作项" },
  { value: "cycle", label: "迭代" },
  { value: "release", label: "发布" },
  { value: "test_plan", label: "测试计划" },
];

const formatDate = (value: string | null) => (value ? (renderFormattedDate(value) ?? value) : "-");

export const OverdueRecordsTable = ({ records, isLoading = false }: Props) => {
  const [entityFilter, setEntityFilter] = useState<TEntityFilter>("all");

  const filteredRecords = useMemo(
    () => (entityFilter === "all" ? records : records.filter((record) => record.entity_type === entityFilter)),
    [entityFilter, records]
  );

  const columns: ColumnDef<TOverdueRecord>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: () => "名称",
        cell: ({ row }) => (
          <div className="max-w-[320px] truncate" title={row.original.name}>
            {row.original.name}
          </div>
        ),
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
    []
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
      actions={() => (
        <div className="flex items-center gap-2">
          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value as TEntityFilter)}
            className="h-8 rounded border border-subtle bg-surface-1 px-2 text-12 text-primary outline-none"
          >
            {ENTITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
    />
  );
};
