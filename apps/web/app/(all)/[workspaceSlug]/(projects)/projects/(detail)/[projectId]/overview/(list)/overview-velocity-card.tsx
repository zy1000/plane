import { type FC, useMemo } from "react";
import { Activity } from "lucide-react";
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { IOverviewTrendPoint } from "./overview-analytics.types";
import { OverviewCard } from "./overview-card";

type Props = {
  trend: IOverviewTrendPoint[];
  isLoading: boolean;
  className?: string;
};

const AREAS = [
  {
    key: "completed",
    label: "完成",
    fill: "#16a34a29",
    fillOpacity: 1,
    stackId: "completed",
    showDot: false,
    smoothCurves: true,
    strokeColor: "#16a34a",
    strokeOpacity: 1,
  },
  {
    key: "created",
    label: "新建",
    fill: "#3f76ff1f",
    fillOpacity: 1,
    stackId: "created",
    showDot: false,
    smoothCurves: true,
    strokeColor: "#3f76ff",
    strokeOpacity: 1,
  },
];

const monthLabel = (month: string) => {
  const part = month.split("-")[1];
  return part ? `${Number(part)}月` : month;
};

export const OverviewVelocityCard: FC<Props> = ({ trend, isLoading, className }) => {
  const chartData = useMemo(
    () => trend.map((point) => ({ name: monthLabel(point.month), created: point.created, completed: point.completed })),
    [trend]
  );

  const summary = useMemo(
    () => ({
      created: trend.reduce((acc, point) => acc + point.created, 0),
      completed: trend.reduce((acc, point) => acc + point.completed, 0),
    }),
    [trend]
  );

  const hasData = chartData.some((point) => point.created > 0 || point.completed > 0);

  return (
    <OverviewCard
      title="交付节奏"
      icon={Activity}
      meta={`近 6 月 · 新建 ${summary.created} / 完成 ${summary.completed}`}
      className={className}
    >
      <div className="h-full px-2 pb-2">
        {isLoading ? (
          <div className="grid h-full place-items-center text-sm text-placeholder">加载中...</div>
        ) : !hasData ? (
          <div className="grid h-full place-items-center text-sm text-placeholder">暂无趋势数据</div>
        ) : (
          <AreaChart
            className="h-full w-full"
            data={chartData}
            areas={AREAS}
            margin={{ top: 10, right: 16, bottom: 0, left: -16 }}
            xAxis={{ key: "name" }}
            yAxis={{ key: "created", allowDecimals: false }}
            legend={{
              align: "left",
              verticalAlign: "bottom",
              layout: "horizontal",
              wrapperStyles: { justifyContent: "start", paddingLeft: "24px", paddingTop: "6px" },
            }}
          />
        )}
      </div>
    </OverviewCard>
  );
};
