"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { ICycle } from "@plane/types";
import { calculateCycleProgress } from "@plane/utils";
import { CycleService } from "@/services/cycle.service";

type TUseCycleBasicInfoProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  cycleDetails: ICycle;
};

export const useCycleBasicInfo = ({ workspaceSlug, projectId, cycleId, cycleDetails }: TUseCycleBasicInfoProps) => {
  const cycleService = useMemo(() => new CycleService(), []);

  const { data: overdueByAssignee } = useSWR(
    workspaceSlug && projectId && cycleId ? `cycle-overdue-by-assignee-${workspaceSlug}-${projectId}-${cycleId}` : null,
    () => cycleService.getCycleOverdueByAssignee(workspaceSlug, projectId, cycleId)
  );

  const { data: cycleIssueTypeDistribution, isLoading: isTypeLoading } = useSWR(
    workspaceSlug && projectId && cycleId ? `cycle-issue-type-distribution-${workspaceSlug}-${projectId}-${cycleId}` : null,
    () => cycleService.getCycleIssueTypeDistribution(workspaceSlug, projectId, cycleId)
  );

  const completionRate = calculateCycleProgress(cycleDetails);
  const totalIssues = cycleDetails?.total_issues ?? 0;
  const overdueTotal = overdueByAssignee?.total ?? 0;
  const delayRate = totalIssues > 0 ? Math.round((overdueTotal / totalIssues) * 100) : 0;

  const typeDistribution = useMemo(
    () => (cycleIssueTypeDistribution?.data ?? []).filter((item) => (item?.count ?? 0) > 0),
    [cycleIssueTypeDistribution?.data]
  );

  return {
    completionRate,
    delayRate,
    typeDistribution,
    isTypeLoading,
  };
};
