import { type FC, useMemo } from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { OverviewCard } from "./overview-card";

export type TOverviewDistributionItem = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type Props = {
  distribution: TOverviewDistributionItem[];
  total: number;
  isLoading: boolean;
  className?: string;
  /** 卡片标题，默认「工作项分布」 */
  title?: string;
  /** 环心下方说明文案，默认「工作项」 */
  centerLabel?: string;
};

export const OverviewDistributionCard: FC<Props> = ({
  distribution,
  total,
  isLoading,
  className,
  title = "工作项分布",
  centerLabel = "工作项",
}) => {
  const { data, cells } = useMemo(
    () => ({
      data: distribution.map((slice) => ({
        id: slice.key,
        key: slice.key,
        value: slice.value,
        name: slice.label,
        color: slice.color,
      })),
      cells: distribution.map((slice) => ({ key: slice.key, fill: slice.color })),
    }),
    [distribution]
  );

  return (
    <OverviewCard title={title} icon={PieChartIcon} className={className}>
      <div className="flex h-full flex-col px-4 pb-4">
        {isLoading ? (
          <div className="grid flex-1 place-items-center text-sm text-placeholder">加载中...</div>
        ) : total === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-placeholder">暂无工作项</div>
        ) : (
          <>
            <div className="relative mx-auto h-[164px] w-[164px] flex-shrink-0">
              <PieChart
                className="size-full"
                dataKey="value"
                data={data}
                cells={cells}
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={2}
                cornerRadius={4}
                showLabel={false}
                showTooltip
                tooltipLabel="数量"
                tooltipPosition={{ x: 172, y: 56 }}
                tooltipClassName="w-auto min-w-[5rem] max-w-[8rem] whitespace-nowrap"
                showActiveOuterRing={false}
              />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-semibold leading-none tabular-nums text-primary">{total}</span>
                  <span className="mt-1 text-xs text-placeholder">{centerLabel}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              {distribution.map((slice) => {
                const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
                return (
                  <div key={slice.key} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
                      <span className="truncate text-secondary">{slice.label}</span>
                    </div>
                    <span className="flex-shrink-0 tabular-nums text-placeholder">
                      {slice.value}
                      <span className="ml-1 text-[10px]">{pct}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </OverviewCard>
  );
};
