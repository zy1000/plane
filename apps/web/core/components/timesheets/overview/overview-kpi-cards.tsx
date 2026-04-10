import { Timer, CalendarCheck, TrendingUp, FolderKanban } from "lucide-react";
import { Card, LinearProgressIndicator } from "@plane/ui";
import type { TOverviewKpis, TOverviewMode } from "@/hooks/store/use-timesheet-overview";

type Props = {
  kpis: TOverviewKpis;
  mode: TOverviewMode;
};

type KpiCardDef = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  getValue: (k: TOverviewKpis) => string;
  getSub: (k: TOverviewKpis, m: TOverviewMode) => string;
  getProgress: ((k: TOverviewKpis) => Array<{ id: string; name: string; value: number; color: string }>) | null;
};

const KPI_CARDS: KpiCardDef[] = [
  {
    key: "totalHours",
    label: "总工时",
    icon: Timer,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    getValue: (k) => `${k.totalHours}h`,
    getSub: (k, m) => (m === "week" ? `目标 40h` : `${k.filledDays} 天累计`),
    getProgress: (k) => [
      {
        id: "filled",
        name: "已填",
        value: Math.min(k.totalHours, k.targetDays * 8),
        color: "#3b82f6",
      },
      {
        id: "remaining",
        name: "剩余",
        value: Math.max(0, k.targetDays * 8 - k.totalHours),
        color: "transparent",
      },
    ],
  },
  {
    key: "filledDays",
    label: "填报天数",
    icon: CalendarCheck,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-500",
    getValue: (k) => `${k.filledDays} / ${k.targetDays} 天`,
    getSub: (k) =>
      k.filledDays >= k.targetDays
        ? "已全部填报"
        : `还有 ${k.targetDays - k.filledDays} 个工作日未填`,
    getProgress: (k) => [
      {
        id: "filled",
        name: "已填",
        value: k.filledDays,
        color: "#10b981",
      },
      {
        id: "remaining",
        name: "未填",
        value: Math.max(0, k.targetDays - k.filledDays),
        color: "transparent",
      },
    ],
  },
  {
    key: "avgDaily",
    label: "日均工时",
    icon: TrendingUp,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    getValue: (k) => `${k.avgDailyHours}h`,
    getSub: (k) => `${k.filledDays} 天有填报记录`,
    getProgress: null,
  },
  {
    key: "totalProjects",
    label: "涉及项目",
    icon: FolderKanban,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
    getValue: (k) => `${k.totalProjects}`,
    getSub: () => "有工时记录的项目数",
    getProgress: null,
  },
];

export function OverviewKpiCards({ kpis, mode }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {KPI_CARDS.map((card) => {
        const Icon = card.icon;
        const progressData = card.getProgress?.(kpis);
        return (
          <Card key={card.key} className="p-4 border border-subtle">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${card.iconBg}`}>
                <Icon className={`h-4.5 w-4.5 ${card.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-placeholder">{card.label}</div>
                <div className="mt-0.5 text-xl font-semibold text-primary">{card.getValue(kpis)}</div>
              </div>
            </div>
            {progressData && (
              <div className="mt-3">
                <LinearProgressIndicator size="md" data={progressData} />
              </div>
            )}
            <div className="mt-2 text-sm text-placeholder">{card.getSub(kpis, mode)}</div>
          </Card>
        );
      })}
    </div>
  );
}
