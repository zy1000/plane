import { useEffect, useMemo, useState } from "react";
import { useProject } from "@/hooks/store/use-project";
import type {
  IOverviewMemberStat,
  IOverviewTrendPoint,
  IProjectOverviewAnalytics,
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
  color: string;
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
  health: THealthVerdict;
  distribution: TDistributionSlice[];
  trend: IOverviewTrendPoint[];
  memberStats: IOverviewMemberStat[];
};

/** 工作项各状态配色（与统计页同色系，保持一致观感） */
const STATE_COLORS: Record<TDistributionSlice["key"], string> = {
  backlog: "#c0c4cc",
  unstarted: "#9aa0a6",
  started: "#3f76ff",
  completed: "#16a34a",
  cancelled: "#64748b",
};

const STATE_LABELS: Record<TDistributionSlice["key"], string> = {
  backlog: "待办",
  unstarted: "未开始",
  started: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

/** 健康判定阈值，集中管理便于调参 */
const HEALTH_THRESHOLDS = {
  overdueRisk: 0.25,
  overdueWatch: 0.1,
  completionRisk: 0.2,
  completionWatch: 0.5,
} as const;

const HEALTH_PRESETS: Record<THealthLevel, Omit<THealthVerdict, "level">> = {
  healthy: { label: "健康", description: "进度稳定，风险可控", color: "#16a34a" },
  watch: { label: "需关注", description: "存在逾期或进度偏慢", color: "#f59e0b" },
  risk: { label: "有风险", description: "逾期较多或进度滞后", color: "#ef4444" },
};

const toCount = (value?: { count: number }) => value?.count ?? 0;

function resolveHealthVerdict(params: {
  completionRate: number;
  overdue: number;
  openCount: number;
}): THealthVerdict {
  const { completionRate, overdue, openCount } = params;
  const overdueRatio = overdue / Math.max(openCount, 1);
  const rate = completionRate / 100;

  let level: THealthLevel = "healthy";
  if (overdueRatio >= HEALTH_THRESHOLDS.overdueRisk || (openCount > 0 && rate < HEALTH_THRESHOLDS.completionRisk)) {
    level = "risk";
  } else if (overdueRatio >= HEALTH_THRESHOLDS.overdueWatch || rate < HEALTH_THRESHOLDS.completionWatch) {
    level = "watch";
  }

  return { level, ...HEALTH_PRESETS[level] };
}

export function useProjectOverview(workspaceSlug: string, projectId: string): TProjectOverviewData {
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

    const distribution: TDistributionSlice[] = (
      ["backlog", "unstarted", "started", "completed", "cancelled"] as const
    )
      .map((key) => ({
        key,
        label: STATE_LABELS[key],
        value: counts[key],
        color: STATE_COLORS[key],
      }))
      .filter((slice) => slice.value > 0);

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
      health: resolveHealthVerdict({ completionRate, overdue, openCount }),
      distribution,
      trend: analytics?.created_completed_trend ?? [],
      memberStats: analytics?.member_stats ?? [],
    };
  }, [analytics, isLoading]);
}
