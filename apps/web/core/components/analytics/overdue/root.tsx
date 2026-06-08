/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
import type { TOverdueAnalyticsStatus } from "@plane/types";
import AnalyticsWrapper from "../analytics-wrapper";
import { OverdueCharts } from "./overdue-charts";
import { OverdueRecordsTable } from "./overdue-records-table";
import { OverdueSummaryCards } from "./overdue-summary-cards";
import { useOverdueAnalytics } from "./use-overdue-analytics";

const STATUS_OPTIONS: Array<{ value: TOverdueAnalyticsStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "active", label: "仍在延期" },
  { value: "resolved", label: "历史已结束" },
];

function OverdueAnalyticsRoot() {
  const [statusFilter, setStatusFilter] = useState<TOverdueAnalyticsStatus>("all");
  const { data, error, isLoading } = useOverdueAnalytics(statusFilter);

  return (
    <AnalyticsWrapper i18nTitle="延期分析">
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map((option) => {
            const isActive = statusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-13 transition-colors",
                  isActive
                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                    : "border-subtle bg-surface-1 text-tertiary hover:text-primary"
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-13 text-red-700">
            延期数据加载失败，请稍后重试。
          </div>
        ) : null}

        <OverdueSummaryCards summary={data?.summary} isLoading={isLoading} />
        <OverdueCharts records={data?.records ?? []} trend={data?.trend ?? []} isLoading={isLoading} />
        <OverdueRecordsTable records={data?.records ?? []} statusFilter={statusFilter} isLoading={isLoading} />
      </div>
    </AnalyticsWrapper>
  );
}

export const OverdueAnalytics = observer(OverdueAnalyticsRoot);
