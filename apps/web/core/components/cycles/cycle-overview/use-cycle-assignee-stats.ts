"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { TCycleDistribution } from "@plane/types";
import { CycleService } from "@/services/cycle.service";

const UNASSIGNED_ASSIGNEE_KEY = "__unassigned__";

const getAssigneeKey = (assigneeId?: string | null) => assigneeId ?? UNASSIGNED_ASSIGNEE_KEY;

type TDistributionAssignee = TCycleDistribution["assignees"][number];

export type TCycleAssigneeStatRow = {
  id: string | undefined;
  title: string;
  avatar_url: string | undefined;
  completed: number;
  pending: number;
  overdue: number;
  total: number;
  completionRate: number;
};

type TUseCycleAssigneeStatsProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  distributionAssignees?: TDistributionAssignee[];
};

export const useCycleAssigneeStats = ({
  workspaceSlug,
  projectId,
  cycleId,
  distributionAssignees,
}: TUseCycleAssigneeStatsProps) => {
  const cycleService = useMemo(() => new CycleService(), []);

  const { data: overdueByAssignee } = useSWR(
    workspaceSlug && projectId && cycleId ? `cycle-overdue-by-assignee-${workspaceSlug}-${projectId}-${cycleId}` : null,
    () => cycleService.getCycleOverdueByAssignee(workspaceSlug, projectId, cycleId)
  );

  const overdueCountByAssignee = useMemo(() => {
    const overdueMap = new Map<string, number>();
    (overdueByAssignee?.data ?? []).forEach((row) => {
      overdueMap.set(getAssigneeKey(row.assignee_id), row.count ?? 0);
    });
    return overdueMap;
  }, [overdueByAssignee?.data]);

  const assigneeStatsRows: TCycleAssigneeStatRow[] = useMemo(
    () =>
      (distributionAssignees ?? []).map((assignee) => {
        const total = assignee.total_issues ?? 0;
        const completed = assignee.completed_issues ?? 0;
        const pending = assignee.pending_issues ?? 0;
        const overdue = overdueCountByAssignee.get(getAssigneeKey(assignee.assignee_id)) ?? 0;

        return {
          id: assignee.assignee_id ?? undefined,
          title: assignee.display_name || "无负责人",
          avatar_url: assignee.avatar_url ?? undefined,
          completed,
          pending,
          overdue,
          total,
          completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      }),
    [distributionAssignees, overdueCountByAssignee]
  );

  return { assigneeStatsRows };
};
