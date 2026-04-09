import { observer } from "mobx-react";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { Card } from "@plane/ui";
import { useProject } from "@/hooks/store/use-project";
import type { TProjectDistributionItem } from "@/hooks/store/use-timesheet-overview";

type Props = {
  data: TProjectDistributionItem[];
  title?: string;
  emptyText?: string;
};

export const OverviewProjectPieChart = observer(function OverviewProjectPieChart({
  data,
  title = "项目工时分布",
  emptyText = "暂无项目工时数据",
}: Props) {
  const { getProjectById } = useProject();

  const resolvedData = data.map((item) => {
    const project = getProjectById(item.id);
    return {
      ...item,
      name: project?.name ?? item.name,
    };
  });

  const total = resolvedData.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="border border-subtle p-4">
      <div className="mb-4 text-sm font-medium text-primary">{title}</div>
      {resolvedData.length > 0 ? (
        <div className="grid h-[260px] w-full grid-cols-1 gap-x-4 md:grid-cols-2">
          <PieChart
            className="size-full"
            dataKey="value"
            margin={{ top: 0, right: -10, bottom: 12, left: -10 }}
            data={resolvedData}
            cells={resolvedData.map((d) => ({ key: d.key, fill: d.color }))}
            showTooltip
            tooltipLabel="工时"
            paddingAngle={4}
            cornerRadius={4}
            innerRadius="50%"
            showLabel={false}
          />
          <div className="flex items-center">
            <div className="w-full space-y-3">
              {resolvedData.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2.5 w-2.5 flex-shrink-0 rounded-xs" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-primary">{item.name}</span>
                  </div>
                  <div className="flex-shrink-0 text-placeholder">
                    {item.value}h ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[260px] items-center justify-center text-sm text-placeholder">
          {emptyText}
        </div>
      )}
    </Card>
  );
});
