import { type FC, useMemo } from "react";
import { observer } from "mobx-react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { Loader } from "@plane/ui";
import type { IOverviewMemberStat } from "./overview-analytics.types";

type Props = {
  memberStats: IOverviewMemberStat[];
  isAnalyticsLoading: boolean;
};

const CHART_MEMBER_LIMIT = 30;

export const OverviewMemberTimesheet: FC<Props> = observer(({ memberStats, isAnalyticsLoading }) => {
  const rows = useMemo(
    () =>
      memberStats
        .map((member) => ({
          key: member.member_id,
          name: member.display_name,
          hours: Math.round((member.timesheet_hours ?? 0) * 100) / 100,
        }))
        .sort((a, b) => b.hours - a.hours),
    [memberStats]
  );

  const chartRows = useMemo(() => rows.slice(0, CHART_MEMBER_LIMIT), [rows]);
  const maxHours = useMemo(() => Math.max(...rows.map((row) => row.hours), 8), [rows]);

  if (isAnalyticsLoading) {
    return (
      <Loader className="gap-3 px-4 pb-4">
        <Loader.Item width="100%" height="40px" />
        <Loader.Item width="100%" height="40px" />
        <Loader.Item width="80%" height="40px" />
      </Loader>
    );
  }

  if (rows.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-placeholder">暂无成员数据</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-5 pb-5">
      <div className="flex h-full min-h-0 flex-col rounded-lg border border-subtle bg-layer-1 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium text-primary">成员工时分布</div>
          {rows.length > CHART_MEMBER_LIMIT && (
            <span className="text-xs text-placeholder">仅展示工时前 {CHART_MEMBER_LIMIT} 名</span>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <BarChart
            className="h-full w-full"
            data={chartRows}
            xAxis={{ key: "name", label: "" }}
            yAxis={{ key: "hours", label: "工时（h）", domain: [0, Math.ceil(maxHours)] }}
            bars={[
              {
                key: "hours",
                label: "工时（小时）",
                fill: (payload: Record<string, unknown>) => {
                  const hours = (payload?.hours as number) ?? 0;
                  if (hours === 0) return "#d1d5db";
                  if (hours >= 8) return "#f59e0b";
                  if (hours >= 4) return "#fbbf24";
                  return "#fde68a";
                },
                showTopBorderRadius: () => true,
                showBottomBorderRadius: () => true,
                showPercentage: false,
                textClassName: "",
              },
            ]}
            barSize={chartRows.length > 10 ? 20 : 34}
            showTooltip
            margin={{ top: 12, right: 20, bottom: 0, left: -12 }}
          />
        </div>
      </div>
    </div>
  );
});
