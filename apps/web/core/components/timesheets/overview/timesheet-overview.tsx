import { useEffect, useState } from "react";
import { Calendar, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { observer } from "mobx-react";
import { DatePicker } from "antd";
import dayjs from "dayjs";
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
  { key: "week", label: "按周", icon: Calendar },
  { key: "month", label: "按月", icon: CalendarDays },
];

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const startMonth = MONTH_LABELS[weekStart.getMonth()];
  const endMonth = MONTH_LABELS[weekEnd.getMonth()];
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getFullYear()} ${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}`;
}

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

export const TimesheetOverview = observer(function TimesheetOverview({ workspaceSlug, memberId }: Props) {
  const { fetchProjects } = useProject();

  useEffect(() => {
    if (workspaceSlug) fetchProjects(workspaceSlug);
  }, [workspaceSlug, fetchProjects]);

  const {
    mode,
    setMode,
    isLoading,
    isRefetching,
    error,
    kpis,
    dailyHours,
    projectDistribution,
    pmsAlerts,
    alertDays,
    recentEntries,
    weekStart,
    weekEnd,
    monthRange,
    isCurrentWeek,
    isCurrentMonth,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
    goToWeek,
    goToPrevMonth,
    goToNextMonth,
  } = useTimesheetOverview({ workspaceSlug, memberId });

  const [pickerOpen, setPickerOpen] = useState(false);

  if (isLoading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-sm text-red-500">{error}</div>
      </div>
    );
  }

  const modeLabel = mode === "week" ? "周" : "月";
  const isCurrentPeriod = mode === "week" ? isCurrentWeek : isCurrentMonth;

  const handlePrev = () => {
    if (mode === "week") goToPrevWeek();
    else goToPrevMonth();
  };

  const handleNext = () => {
    if (mode === "week") goToNextWeek();
    else goToNextMonth();
  };

  const handleCurrentPeriod = () => {
    goToCurrentWeek();
  };

  const navDisplayText =
    mode === "week"
      ? formatWeekRange(weekStart, weekEnd)
      : `${monthRange.start.getFullYear()} ${MONTH_LABELS[monthRange.start.getMonth()]}`;

  const currentPeriodLabel = mode === "week" ? "本周" : "本月";

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className={cn("flex flex-col gap-6 px-6 py-4 transition-opacity", isRefetching && "opacity-60")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-primary">工时概览</h1>
          </div>
          <div className="flex items-center gap-3">
            {!isCurrentPeriod && (
              <button
                onClick={handleCurrentPeriod}
                className="inline-flex h-[28px] items-center justify-center rounded-md border border-subtle px-2.5 text-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                {currentPeriodLabel}
              </button>
            )}
            <div className="flex items-center rounded-md border border-subtle overflow-hidden">
              <button
                onClick={handlePrev}
                className="inline-flex h-[26px] w-[26px] items-center justify-center text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                title={mode === "week" ? "上一周" : "上一月"}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <div
                className="relative flex h-[26px] items-center border-x border-subtle cursor-pointer hover:bg-layer-1 transition-colors"
                onClick={() => setPickerOpen(true)}
              >
                <span className="px-3 text-sm font-medium text-primary tabular-nums select-none">
                  {navDisplayText}
                </span>
                <DatePicker
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  value={dayjs(weekStart)}
                  onChange={(date) => {
                    if (date) goToWeek(date.toDate());
                    setPickerOpen(false);
                  }}
                  allowClear={false}
                  suffixIcon={null}
                  variant="borderless"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
              </div>
              <button
                onClick={handleNext}
                className="inline-flex h-[26px] w-[26px] items-center justify-center text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
                title={mode === "week" ? "下一周" : "下一月"}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center rounded-md border border-subtle bg-surface-1 p-0.5">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = mode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setMode(opt.key)}
                    className={cn(
                      "flex h-[22px] cursor-pointer items-center gap-1.5 rounded-[3px] px-2.5 text-sm font-medium transition-colors",
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
          <div className="max-h-[466px] xl:col-span-7 [&>*]:h-full">
            <OverviewRecentEntries entries={recentEntries} title={`最近填报（${modeLabel}）`} />
          </div>
          <div className="max-h-[466px] xl:col-span-5 [&>*]:h-full">
            <OverviewMissingDaysAlert alertDays={alertDays} pmsAlerts={pmsAlerts} workspaceSlug={workspaceSlug} />
          </div>
        </div>
      </div>
    </div>
  );
});
