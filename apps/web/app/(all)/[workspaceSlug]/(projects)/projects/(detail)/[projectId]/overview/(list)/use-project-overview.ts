import { useEffect, useMemo, useRef, useState } from "react";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { useProject } from "@/hooks/store/use-project";
import type {
  IOverviewDefectTrendPoint,
  IOverviewMemberStat,
  IOverviewTrendPoint,
  IProjectOverviewAnalytics,
  TOverviewDefectPriority,
} from "./overview-analytics.types";

export type THealthLevel = "healthy" | "watch" | "risk";

export type TWorkItemCounts = {
  total: number;
  backlog: number;
  unstarted: number;
  started: number;
  completed: number;
  cancelled: number;
};

export type TDistributionSlice = {
  key: keyof Omit<TWorkItemCounts, "total">;
  label: string;
  value: number;
  color: string;
};

export type THealthVerdict = {
  level: THealthLevel;
  label: string;
  description: string;
  /** 完成率环的描边色（CSS 变量，明暗主题自动跟随） */
  color: string;
  /** 健康度胶囊的配色 class */
  pillClassName: string;
};

export type TProjectOverviewData = {
  analytics: IProjectOverviewAnalytics | null;
  isLoading: boolean;
  counts: TWorkItemCounts;
  /** 进行中的未完成工作项（total - completed - cancelled） */
  openCount: number;
  /** 完成率 0-100，分母剔除已取消 */
  completionRate: number;
  totalHours: number;
  overdue: number;
  dueSoon: number;
  totalDefects: number;
  pendingDefects: number;
  pendingDefectsByPriority: Record<TOverviewDefectPriority, number>;
  defectTrend: IOverviewDefectTrendPoint[];
  health: THealthVerdict;
  /** 五个状态组全部给出（含 0），Hero 的状态条与图例按它渲染 */
  distribution: TDistributionSlice[];
  trend: IOverviewTrendPoint[];
  memberStats: IOverviewMemberStat[];
};

const DISTRIBUTION_KEYS = ["backlog", "unstarted", "started", "completed", "cancelled"] as const;

const EMPTY_PRIORITY_COUNTS: Record<TOverviewDefectPriority, number> = {
  urgent: 0,
  high: 0,
  medium: 0,
  low: 0,
  none: 0,
};

/** 健康判定阈值，集中管理便于调参 */
const HEALTH_THRESHOLDS = {
  overdueRisk: 0.25,
  overdueWatch: 0.1,
  completionRisk: 0.2,
  completionWatch: 0.5,
} as const;

const HEALTH_STYLES: Record<THealthLevel, Pick<THealthVerdict, "color" | "pillClassName">> = {
  healthy: { color: "var(--bg-success-primary)", pillClassName: "bg-success-subtle text-success-primary" },
  watch: { color: "var(--bg-warning-primary)", pillClassName: "bg-warning-subtle text-warning-primary" },
  risk: { color: "var(--bg-danger-primary)", pillClassName: "bg-danger-subtle text-danger-primary" },
};

const toCount = (value?: { count: number }) => value?.count ?? 0;

function resolveHealthLevel(params: { completionRate: number; overdue: number; openCount: number }): THealthLevel {
  const { completionRate, overdue, openCount } = params;
  const overdueRatio = overdue / Math.max(openCount, 1);
  const rate = completionRate / 100;

  if (overdueRatio >= HEALTH_THRESHOLDS.overdueRisk || (openCount > 0 && rate < HEALTH_THRESHOLDS.completionRisk)) {
    return "risk";
  }
  if (overdueRatio >= HEALTH_THRESHOLDS.overdueWatch || rate < HEALTH_THRESHOLDS.completionWatch) {
    return "watch";
  }
  return "healthy";
}

export function useProjectOverview(workspaceSlug: string, projectId: string): TProjectOverviewData {
  const { t, currentLocale } = useTranslation();
  // useTranslation 每次渲染都重新 bind 一个 t；用 ref 取最新的，memo 只跟随语言切换
  const tRef = useRef(t);
  tRef.current = t;
  const { fetchProjectAnalyze } = useProject();
  const [analytics, setAnalytics] = useState<IProjectOverviewAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    let cancelled = false;
    setIsLoading(true);
    fetchProjectAnalyze(workspaceSlug, projectId)
      .then((response: IProjectOverviewAnalytics) => {
        if (!cancelled) setAnalytics(response);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setAnalytics(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, fetchProjectAnalyze]);

  return useMemo(() => {
    const t = tRef.current;
    const counts: TWorkItemCounts = {
      total: toCount(analytics?.total_work_items),
      backlog: toCount(analytics?.backlog_work_items),
      unstarted: toCount(analytics?.un_started_work_items),
      started: toCount(analytics?.started_work_items),
      completed: toCount(analytics?.completed_work_items),
      cancelled: toCount(analytics?.cancelled_work_items),
    };

    const openCount = Math.max(counts.total - counts.completed - counts.cancelled, 0);
    const completionDenominator = Math.max(counts.total - counts.cancelled, 1);
    const completionRate = Math.round((counts.completed / completionDenominator) * 100);

    const overdue = analytics?.overdue_work_items ?? 0;
    const dueSoon = analytics?.due_soon_work_items ?? 0;

    const level = resolveHealthLevel({ completionRate, overdue, openCount });
    const health: THealthVerdict = {
      level,
      label: t(`project_overview.hero.levels.${level}.label`),
      description: t(`project_overview.hero.levels.${level}.description`),
      ...HEALTH_STYLES[level],
    };

    const distribution: TDistributionSlice[] = DISTRIBUTION_KEYS.map((key) => ({
      key,
      label: t(`project_overview.states.${key}`),
      value: counts[key],
      color: STATE_GROUPS[key].color,
    }));

    return {
      analytics,
      isLoading,
      counts,
      openCount,
      completionRate,
      totalHours: Math.round((analytics?.total_timesheet_hours ?? 0) * 100) / 100,
      overdue,
      dueSoon,
      totalDefects: analytics?.total_defects ?? 0,
      pendingDefects: analytics?.pending_defects ?? 0,
      pendingDefectsByPriority: { ...EMPTY_PRIORITY_COUNTS, ...(analytics?.pending_defects_by_priority ?? {}) },
      defectTrend: analytics?.defect_trend ?? [],
      health,
      distribution,
      trend: analytics?.created_completed_trend ?? [],
      memberStats: analytics?.member_stats ?? [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentLocale 代表 t 的变化
  }, [analytics, isLoading, currentLocale]);
}
