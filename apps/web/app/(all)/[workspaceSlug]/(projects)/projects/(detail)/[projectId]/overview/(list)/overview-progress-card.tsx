import { type FC } from "react";
import { observer } from "mobx-react";
import { BarChart3 } from "lucide-react";
import { Loader } from "@plane/ui";
import type { IProjectOverviewAnalytics } from "./overview-analytics.types";

type Props = {
  analyticsData: IProjectOverviewAnalytics | null;
  loading: boolean;
};

type TOverviewProgressKey =
  | "backlog_work_items"
  | "un_started_work_items"
  | "started_work_items"
  | "completed_work_items"
  | "cancelled_work_items";

const CATEGORIES: { label: string; key: TOverviewProgressKey; color: string }[] = [
  { label: "Backlog", key: "backlog_work_items", color: "#a3a3a3" },
  { label: "Unstarted", key: "un_started_work_items", color: "#80caff" },
  { label: "Started", key: "started_work_items", color: "#f59e0b" },
  { label: "Completed", key: "completed_work_items", color: "#16a34a" },
  { label: "Cancelled", key: "cancelled_work_items", color: "#ef4444" },
];

export const OverviewProgressCard: FC<Props> = observer(({ analyticsData, loading }) => {
  if (loading) {
    return (
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          <span className="text-sm font-medium text-primary">工作项进度</span>
        </div>
        <Loader className="gap-3">
          <Loader.Item width="100%" height="10px" />
          <Loader.Item width="80%" height="12px" />
        </Loader>
      </div>
    );
  }

  if (!analyticsData || analyticsData.total_work_items.count === 0) {
    return (
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          <span className="text-sm font-medium text-primary">工作项进度</span>
        </div>
        <div className="flex h-[60px] items-center justify-center text-sm text-placeholder">暂无工作项数据</div>
      </div>
    );
  }

  const total = analyticsData.total_work_items.count;
  const stats = CATEGORIES.map((cat) => ({
    ...cat,
    count: analyticsData[cat.key].count,
    percentage: (analyticsData[cat.key].count / total) * 100,
  }));

  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-primary">
          <BarChart3 className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          工作项进度
        </span>
        <span className="text-xs text-placeholder">共 {total} 项</span>
      </div>

      <div className="flex gap-0.5 overflow-hidden rounded-full">
        {stats.map((item) =>
          item.percentage > 0 ? (
            <div
              key={item.key}
              className="h-2 transition-all duration-300"
              style={{
                backgroundColor: item.color,
                width: `${item.percentage}%`,
                minWidth: "4px",
              }}
              title={`${item.label}: ${item.count} (${item.percentage.toFixed(1)}%)`}
            />
          ) : null
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {stats.map((item) => (
          <div key={item.key} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <span className="size-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <div className="flex items-baseline gap-1.5 text-sm">
              <span className="font-semibold text-primary">{item.count}</span>
              <span className="text-xs text-placeholder">{item.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
