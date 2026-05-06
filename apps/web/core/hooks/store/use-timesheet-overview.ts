import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimesheetService, type TTimeSheet } from "@/services/issue/timesheet.service";
import { isChinaWorkday } from "@/helpers/china-holidays.helper";
import { formatDateKey, getWeekStart, getWeekDays } from "@/hooks/store/use-timesheet-page";

const timesheetService = new TimesheetService();

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export type TOverviewMode = "week" | "month";

export type TOverviewKpis = {
  totalHours: number;
  filledDays: number;
  targetDays: number;
  avgDailyHours: number;
  totalProjects: number;
};

export type TDailyHoursItem = {
  key: string;
  name: string;
  date: string;
  hours: number;
};

export type TProjectDistributionItem = {
  id: string;
  key: string;
  name: string;
  value: number;
  color: string;
};

const PROJECT_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

function countWorkDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function buildProjectDistribution(timesheets: TTimeSheet[]): TProjectDistributionItem[] {
  const projectMap = new Map<string, number>();
  for (const t of timesheets) {
    const pid = t.project;
    projectMap.set(pid, (projectMap.get(pid) ?? 0) + parseFloat(t.hours || "0"));
  }

  let idx = 0;
  return Array.from(projectMap.entries())
    .map(([id, hours]) => ({
      id,
      key: id,
      name: id,
      value: Math.round(hours * 100) / 100,
      color: PROJECT_COLORS[idx++ % PROJECT_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function buildDailyHoursMap(timesheets: TTimeSheet[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of timesheets) {
    map.set(t.date, (map.get(t.date) ?? 0) + parseFloat(t.hours || "0"));
  }
  return map;
}

export type TAlertDay = {
  date: string;
  type: "missing" | "insufficient";
  hours: number;
};

function buildAlertDays(dates: Date[], hoursMap: Map<string, number>): TAlertDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dates
    .filter((d) => d <= today)
    .map((d) => {
      const dateKey = formatDateKey(d);
      if (!isChinaWorkday(d, dateKey)) return null;
      const hours = hoursMap.get(dateKey) ?? 0;
      if (hours === 0) return { date: dateKey, type: "missing" as const, hours: 0 };
      if (hours < 8) return { date: dateKey, type: "insufficient" as const, hours: Math.round(hours * 100) / 100 };
      return null;
    })
    .filter((item): item is TAlertDay => item !== null);
}

function sortEntriesDesc(timesheets: TTimeSheet[], limit: number): TTimeSheet[] {
  return [...timesheets]
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return b.start_time.localeCompare(a.start_time);
    })
    .slice(0, limit);
}

export type TUseTimesheetOverviewOptions = {
  workspaceSlug: string | undefined;
  memberId: string | undefined;
};

export const useTimesheetOverview = ({ workspaceSlug, memberId }: TUseTimesheetOverviewOptions) => {
  const [weekTimesheets, setWeekTimesheets] = useState<TTimeSheet[]>([]);
  const [monthTimesheets, setMonthTimesheets] = useState<TTimeSheet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TOverviewMode>("week");
  const requestIdRef = useRef(0);

  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const monthRange = useMemo(() => getMonthRange(new Date()), []);

  const monthDays = useMemo(() => {
    const days: Date[] = [];
    const d = new Date(monthRange.start);
    while (d <= monthRange.end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [monthRange]);

  const fetchData = useCallback(async () => {
    if (!workspaceSlug) return;
    const reqId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const [weekData, monthData] = await Promise.all([
        timesheetService.workspaceList(workspaceSlug, {
          member_id: memberId,
          date__gte: formatDateKey(weekStart),
          date__lte: formatDateKey(weekEnd),
        }),
        timesheetService.workspaceList(workspaceSlug, {
          member_id: memberId,
          date__gte: formatDateKey(monthRange.start),
          date__lte: formatDateKey(monthRange.end),
        }),
      ]);

      if (reqId !== requestIdRef.current) return;
      setWeekTimesheets(weekData);
      setMonthTimesheets(monthData);
    } catch {
      if (reqId !== requestIdRef.current) return;
      setError("获取工时数据失败");
    } finally {
      if (reqId === requestIdRef.current) setIsLoading(false);
    }
  }, [workspaceSlug, memberId, weekStart, weekEnd, monthRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeTimesheets = mode === "week" ? weekTimesheets : monthTimesheets;

  // --- KPIs ---
  const weekHoursMap = useMemo(() => buildDailyHoursMap(weekTimesheets), [weekTimesheets]);
  const monthHoursMap = useMemo(() => buildDailyHoursMap(monthTimesheets), [monthTimesheets]);
  const activeHoursMap = mode === "week" ? weekHoursMap : monthHoursMap;

  const kpis: TOverviewKpis = useMemo(() => {
    const total = activeTimesheets.reduce((s, t) => s + parseFloat(t.hours || "0"), 0);
    const filledDays = new Set(activeTimesheets.map((t) => t.date)).size;
    const projects = new Set(activeTimesheets.map((t) => t.project));
    const targetDays =
      mode === "week" ? 5 : countWorkDays(monthRange.start, monthRange.end);

    return {
      totalHours: Math.round(total * 100) / 100,
      filledDays,
      targetDays,
      avgDailyHours: filledDays > 0 ? Math.round((total / filledDays) * 100) / 100 : 0,
      totalProjects: projects.size,
    };
  }, [activeTimesheets, mode, monthRange]);

  // --- Daily hours chart data ---
  const dailyHours: TDailyHoursItem[] = useMemo(() => {
    if (mode === "week") {
      return weekDays.map((d, i) => {
        const dateKey = formatDateKey(d);
        return {
          key: dateKey,
          name: WEEKDAY_LABELS[i],
          date: dateKey,
          hours: Math.round((weekHoursMap.get(dateKey) ?? 0) * 100) / 100,
        };
      });
    }
    return monthDays.map((d) => {
      const dateKey = formatDateKey(d);
      return {
        key: dateKey,
        name: `${d.getMonth() + 1}/${d.getDate()}`,
        date: dateKey,
        hours: Math.round((monthHoursMap.get(dateKey) ?? 0) * 100) / 100,
      };
    });
  }, [mode, weekDays, weekHoursMap, monthDays, monthHoursMap]);

  // --- Project distribution ---
  const projectDistribution = useMemo(
    () => buildProjectDistribution(activeTimesheets),
    [activeTimesheets]
  );

  // --- Alert days ---
  const alertDays = useMemo(() => {
    const dates = mode === "week" ? weekDays : monthDays;
    const map = mode === "week" ? weekHoursMap : monthHoursMap;
    return buildAlertDays(dates, map);
  }, [mode, weekDays, monthDays, weekHoursMap, monthHoursMap]);

  // --- Recent entries ---
  const recentEntries = useMemo(
    () => sortEntriesDesc(activeTimesheets, 10),
    [activeTimesheets]
  );

  // --- Period label ---
  const periodLabel = useMemo(() => {
    if (mode === "week") {
      return `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
    }
    return `${monthRange.start.getFullYear()}年${monthRange.start.getMonth() + 1}月`;
  }, [mode, weekStart, weekEnd, monthRange]);

  return {
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
    refresh: fetchData,
  };
};
