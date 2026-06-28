import { useMemo } from "react";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { Card } from "@plane/ui";
import type { TReportAnalysis } from "@/services/qa/report.service";

type Props = {
  analysis: TReportAnalysis | null;
};

const STATUS_META: { key: string; label: string; color: string }[] = [
  { key: "未执行", label: "未执行", color: "#bfbfbf" },
  { key: "成功", label: "成功", color: "#52c41a" },
  { key: "阻塞", label: "阻塞", color: "#faad14" },
  { key: "无效", label: "无效", color: "#3b5999" },
  { key: "失败", label: "失败", color: "#ff4d4f" },
];

export const ReportExecutionChart = ({ analysis }: Props) => {
  const passRate = analysis?.pass_rate ?? {};
  const total = STATUS_META.reduce((s, m) => s + Number(passRate[m.key] || 0), 0);

  const data = useMemo(
    () =>
      STATUS_META.map((m) => ({
        id: m.key,
        key: m.key,
        value: Number(passRate[m.key] || 0),
        name: m.label,
        color: m.color,
      })).filter((d) => d.value > 0),
    [passRate]
  );

  const cells = useMemo(
    () => STATUS_META.map((m) => ({ key: m.key, fill: m.color })),
    []
  );

  return (
    <Card className="h-full p-4">
      <div className="mb-3 flex items-center justify-end">
        <span className="text-xs text-secondary">总数(个) {total}</span>
      </div>
      <div className="grid h-[220px] w-full grid-cols-1 gap-x-4 md:grid-cols-2">
        {total > 0 ? (
          <PieChart
            className="size-full"
            dataKey="value"
            margin={{ top: 0, right: -10, bottom: 12, left: -10 }}
            data={data}
            cells={cells}
            showTooltip
            tooltipLabel="数量"
            paddingAngle={2}
            cornerRadius={4}
            innerRadius="55%"
            showLabel={false}
            centerLabel={{
              text: total,
              fill: "var(--text-color-primary)",
              style: { fontSize: "18px", fontWeight: 600 },
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-secondary">暂无执行数据</div>
        )}
        <div className="flex items-center">
          <div className="w-full space-y-2.5">
            {STATUS_META.map((m) => {
              const count = Number(passRate[m.key] || 0);
              const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
              return (
                <div key={m.key} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: m.color }} />
                    <span className="whitespace-nowrap text-primary">{m.label}</span>
                  </div>
                  <div className="text-secondary">
                    {count} <span className="text-tertiary">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};
