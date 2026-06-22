import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { ProjectService } from "@/services/project/project.service";
import type {
  TDefectAnalyticsMemberStat,
  TDefectAnalyticsPrioritySlice,
  TDefectAnalyticsStatusSlice,
  TDefectAnalyticsTrendPoint,
  TProjectDefectAnalytics,
} from "@/services/project/project.service";
import { useUser } from "@/hooks/store/user";
import { PROJECT_DEFECTS_REFRESH_EVENT } from "@/hooks/store/use-project-defects";

const projectService = new ProjectService();

const EMPTY_SUMMARY: TProjectDefectAnalytics["summary"] = {
  total: 0,
  pending: 0,
  resolved: 0,
  stale_pending: 0,
  overdue: 0,
  due_soon: 0,
};

export type TUseProjectDefectAnalytics = {
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
  summary: TProjectDefectAnalytics["summary"];
  statusDistribution: TDefectAnalyticsStatusSlice[];
  priorityDistribution: TDefectAnalyticsPrioritySlice[];
  trend: TDefectAnalyticsTrendPoint[];
  topAssignees: TDefectAnalyticsMemberStat[];
  myDefectCount: number;
  myDefectRatio: number;
};

export function useProjectDefectAnalytics(
  workspaceSlug: string | undefined,
  projectId: string | undefined
): TUseProjectDefectAnalytics {
  const { data: currentUser } = useUser();

  const swrKey = workspaceSlug && projectId ? `PROJECT_DEFECT_ANALYTICS_${workspaceSlug}_${projectId}` : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    workspaceSlug && projectId ? () => projectService.getProjectDefectAnalytics(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  // 新建/变更缺陷后刷新统计
  useEffect(() => {
    const handler = () => {
      void mutate();
    };
    window.addEventListener(PROJECT_DEFECTS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PROJECT_DEFECTS_REFRESH_EVENT, handler);
  }, [mutate]);

  return useMemo(() => {
    const summary = data?.summary ?? EMPTY_SUMMARY;
    const topAssignees = (data?.member_stats ?? []).filter((member) => member.defect_count > 0);
    const myDefectCount = currentUser?.id
      ? (topAssignees.find((member) => member.member_id === String(currentUser.id))?.defect_count ?? 0)
      : 0;

    return {
      isLoading: !!swrKey && isLoading,
      error,
      refetch: () => void mutate(),
      summary,
      statusDistribution: data?.status_distribution ?? [],
      priorityDistribution: data?.priority_distribution ?? [],
      trend: data?.trend ?? [],
      topAssignees,
      myDefectCount,
      myDefectRatio: summary.total > 0 ? Math.round((myDefectCount / summary.total) * 100) : 0,
    };
  }, [data, error, isLoading, mutate, swrKey, currentUser?.id]);
}
