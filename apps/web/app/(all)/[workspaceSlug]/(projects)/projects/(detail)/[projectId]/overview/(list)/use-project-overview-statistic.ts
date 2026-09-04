import useSWR from "swr";
import { ProjectStatisticService, type TProjectOverviewStatisticResponse } from "@/services/project";

const projectStatisticService = new ProjectStatisticService();

/**
 * 概览页只取活跃条目（进行中的迭代、未收口的发布、进行中的测试计划与评审），
 * 「进行中」卡从中挑最紧要的一条；事实条的总数走各段的 total_count，不受这个过滤影响。
 */
const OVERVIEW_STATISTIC_PAGE_SIZE = 20;

export type TProjectOverviewStatistic = {
  statistic: TProjectOverviewStatisticResponse | null;
  isLoading: boolean;
  error: unknown;
};

export function useProjectOverviewStatistic(workspaceSlug: string, projectId: string): TProjectOverviewStatistic {
  const key = workspaceSlug && projectId ? `project-overview-statistic-${workspaceSlug}-${projectId}` : null;
  const { data, error, isLoading } = useSWR(
    key,
    () =>
      projectStatisticService.getOverviewStatistic(workspaceSlug, projectId, {
        page_size: OVERVIEW_STATISTIC_PAGE_SIZE,
        include_all_statuses: false,
      }),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  return {
    statistic: data ?? null,
    isLoading: Boolean(key) && isLoading && !data,
    error,
  };
}
