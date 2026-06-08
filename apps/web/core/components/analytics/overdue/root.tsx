/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import AnalyticsWrapper from "../analytics-wrapper";
import { OverdueCharts } from "./overdue-charts";
import { OverdueRecordsTable } from "./overdue-records-table";
import { OverdueSummaryCards } from "./overdue-summary-cards";
import { useOverdueAnalytics } from "./use-overdue-analytics";

function OverdueAnalyticsRoot() {
  const { data, error, isLoading } = useOverdueAnalytics("all");

  return (
    <AnalyticsWrapper i18nTitle="延期分析">
      <div className="flex flex-col gap-8">
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-13 text-red-700">
            延期数据加载失败，请稍后重试。
          </div>
        ) : null}

        <OverdueSummaryCards summary={data?.summary} isLoading={isLoading} />
        <OverdueCharts records={data?.records ?? []} trend={data?.trend ?? []} isLoading={isLoading} />
        <OverdueRecordsTable records={data?.records ?? []} isLoading={isLoading} />
      </div>
    </AnalyticsWrapper>
  );
}

export const OverdueAnalytics = observer(OverdueAnalyticsRoot);
