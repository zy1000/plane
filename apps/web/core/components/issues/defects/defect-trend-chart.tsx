import { useMemo, type FC } from "react";
import { BarChart } from "@plane/propel/charts/bar-chart";
import type { TBarItem } from "@plane/types";
import { useCountUp } from "@/hooks/use-count-up";
import type { TDefectAnalyticsTrendPoint } from "@/services/project/project.service";

type Props = {
  isLoading: boolean;
  trend: TDefectAnalyticsTrendPoint[];
};

const bars: TBarItem<string>[] = [
  { key: "created", label: "新建", fill: "#ef4444", textClassName: "", stackId: "created", showPercentage: false },
  { key: "resolved", label: "解决", fill: "#16a34a", textClassName: "", stackId: "resolved", showPercentage: false },
];

const formatMonth = (month: string): string => {
  const parts = month.split("-");
  return parts.length === 2 ? `${Number(parts[1])}月` : month;
};

export const DefectTrendChart: FC<Props> = ({ isLoading, trend }) => {
  const data = trend.map((point) => ({
    name: formatMonth(point.month),
    created: point.created,
    resolved: point.resolved,
  }));
  const hasData = data.some((point) => point.created > 0 || point.resolved > 0);
  const chartAnimationKey = data.map((point) => `${point.name}:${point.created}:${point.resolved}`).join("|");
  const chartProgress = useCountUp(hasData ? 1 : 0, {
    decimals: 4,
    duration: 1400,
    resetKey: chartAnimationKey,
  });
  const animatedData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        created: Math.round(point.created * chartProgress),
        resolved: Math.round(point.resolved * chartProgress),
      })),
    [chartProgress, data]
  );
  const yAxisMax = Math.max(...data.map((point) => Math.max(point.created, point.resolved)), 1);

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-primary">近 6 个月：新建 vs 解决</div>
        <div className="text-xs text-placeholder">按月统计缺陷创建与解决数量</div>
      </div>
      {isLoading ? (
        <div className="mt-4 h-[280px] w-full animate-pulse rounded-lg bg-surface-2" />
      ) : !hasData ? (
        <div className="mt-4 flex h-[280px] items-center justify-center text-xs text-placeholder">暂无趋势数据</div>
      ) : (
        <BarChart
          className="mt-2 h-[280px] w-full"
          data={animatedData}
          bars={bars}
          xAxis={{ key: "name" }}
          yAxis={{ key: "created", allowDecimals: false, domain: [0, yAxisMax] }}
          legend={{ align: "center", verticalAlign: "bottom", layout: "horizontal" }}
          barSize={16}
          margin={{ top: 10, right: 16, bottom: 0, left: -12 }}
        />
      )}
    </div>
  );
};
