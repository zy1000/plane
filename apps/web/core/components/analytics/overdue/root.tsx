/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { OverdueAnalyticsModal } from "./overdue-analytics-modal";
import { OverdueRecordsTable } from "./overdue-records-table";
import { useOverdueAnalytics } from "./use-overdue-analytics";

function OverdueAnalyticsRoot() {
  const { data, error, isLoading } = useOverdueAnalytics("all");
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-1">
      {error ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-page-x py-2 text-13 text-red-700">
          延期数据加载失败，请稍后重试。
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <OverdueRecordsTable
          records={data?.records ?? []}
          isLoading={isLoading}
          onOpenAnalytics={() => setIsAnalyticsOpen(true)}
        />
      </div>

      <OverdueAnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        summary={data?.summary}
        records={data?.records ?? []}
        trend={data?.trend ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}

export const OverdueAnalytics = observer(OverdueAnalyticsRoot);
