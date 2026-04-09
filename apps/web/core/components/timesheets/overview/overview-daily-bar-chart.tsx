import { BarChart } from "@plane/propel/charts/bar-chart";
import { Card } from "@plane/ui";
import type { TDailyHoursItem } from "@/hooks/store/use-timesheet-overview";

type Props = {
  data: TDailyHoursItem[];
  title?: string;
  emptyText?: string;
};

export function OverviewDailyBarChart({
  data,
  title = "每日工时",
  emptyText = "暂无工时记录",
}: Props) {
  const maxHours = Math.max(...data.map((d) => d.hours), 8);

  return (
    <Card className="border border-subtle p-4">
      <div className="mb-4 text-sm font-medium text-primary">{title}</div>
      {data.some((d) => d.hours > 0) ? (
        <BarChart
          className="h-[260px] w-full"
          data={data}
          xAxis={{ key: "name", label: "" }}
          yAxis={{ key: "hours", label: "", domain: [0, Math.ceil(maxHours)] }}
          bars={[
            {
              key: "hours",
              label: "工时 (h)",
              fill: (payload: Record<string, unknown>) => {
                const hours = (payload?.hours as number) ?? 0;
                if (hours === 0) return "#e5e7eb";
                if (hours >= 8) return "#3b82f6";
                if (hours >= 4) return "#60a5fa";
                return "#93c5fd";
              },
              showTopBorderRadius: () => true,
              showBottomBorderRadius: () => true,
            },
          ]}
          barSize={data.length > 10 ? 16 : 32}
          showTooltip
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        />
      ) : (
        <div className="flex h-[260px] items-center justify-center text-sm text-placeholder">
          {emptyText}
        </div>
      )}
    </Card>
  );
}
