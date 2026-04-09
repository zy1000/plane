import { useEffect } from "react";
import { Calendar, CalendarDays } from "lucide-react";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { useTimesheetOverview, type TOverviewMode } from "@/hooks/store/use-timesheet-overview";
import { OverviewKpiCards } from "./overview-kpi-cards";
import { OverviewDailyBarChart } from "./overview-daily-bar-chart";
import { OverviewProjectPieChart } from "./overview-project-pie-chart";
import { OverviewRecentEntries } from "./overview-recent-entries";
import { OverviewMissingDaysAlert } from "./overview-missing-days-alert";

type Props = {
  workspaceSlug: string;
  memberId: string | undefined;
};

const MODE_OPTIONS: { key: TOverviewMode; label: string; icon: typeof Calendar }[] = [
  { key: "week", label: "本周", icon: Calendar },
  { key: "month", label: "本月", icon: CalendarDays },
];

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-6 py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Loader key={i} className="min-h-[100px] gap-2 rounded-lg border border-subtle bg-surface-1 p-4">
            <Loader.Item width="40%" height="12px" />
            <Loader.Item width="60%" height="24px" />
            <Loader.Item width="100%" height="8px" />
          </Loader>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Loader className="min-h-[300px] gap-2 rounded-lg border border-subtle bg-surface-1 p-4 xl:col-span-7">
          <Loader.Item width="30%" height="14px" />
          <Loader.Item width="100%" height="240px" />
        </Loader>
        <Loader className="min-h-[300px] gap-2 rounded-lg border border-subtle bg-surface-1 p-4 xl:col-span-5">
          <Loader.Item width="30%" height="14px" />
          <Loader.Item width="100%" height="240px" />
        </Loader>
      </div>
    </div>
  );
}

export function TimesheetOverview({ workspaceSlug, memberId }: Props) {
  const { fetchProjects } = useProject();

  useEffect(() => {
    if (workspaceSlug) fetchProjects(workspaceSlug);
  }, [workspaceSlug, fetchProjects]);

  const {
    mode,
    setMode,
    isLoading,
    error,
    kpis,
    dailyHours,
    projectDistribution,
    alertDays,
    recentEntries,
    periodLabel,
  } = useTimesheetOverview({ workspaceSlug, memberId });

  if (isLoading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  const modeLabel = mode === "week" ? "本周" : "本月";

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-6 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-primary">工时概览</h1>
            <p className="mt-0.5 text-xs text-placeholder">{periodLabel}</p>
          </div>
          <div className="flex items-center rounded-lg border border-subtle bg-surface-1 p-0.5">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isActive = mode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMode(opt.key)}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-secondary hover:text-primary hover:bg-layer-1"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <OverviewKpiCards kpis={kpis} mode={mode} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <OverviewDailyBarChart
              data={dailyHours}
              title={`${modeLabel}每日工时`}
              emptyText={`${modeLabel}暂无工时记录`}
            />
          </div>
          <div className="xl:col-span-5">
            <OverviewProjectPieChart
              data={projectDistribution}
              title={`${modeLabel}项目分布`}
              emptyText={`${modeLabel}暂无项目工时数据`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <OverviewRecentEntries entries={recentEntries} title={`最近填报（${modeLabel}）`} />
          </div>
          <div className="xl:col-span-5">
            <OverviewMissingDaysAlert alertDays={alertDays} workspaceSlug={workspaceSlug} />
          </div>
        </div>
      </div>
    </div>
  );
}
