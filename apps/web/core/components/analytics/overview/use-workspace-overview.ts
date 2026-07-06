/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import type {
  IUserLite,
  TLogoProps,
  TOverdueRecord,
  TProjectAnalyticsCount,
  WorkItemInsightColumns,
} from "@plane/types";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// services
import { AnalyticsService } from "@/services/analytics.service";

const analyticsService = new AnalyticsService();

export type TWorkspaceOverviewHealthLevel = "healthy" | "watch" | "risk";

export type TWorkspaceOverviewHealth = {
  level: TWorkspaceOverviewHealthLevel;
  label: string;
  description: string;
  rank: number;
};

export type TWorkspaceOverviewRow = {
  projectId: string;
  projectName: string;
  projectIdentifier?: string;
  projectSearchValue: string;
  projectLeadName?: string;
  logoProps?: TLogoProps;
  health: TWorkspaceOverviewHealth;
  healthRank: number;
  totalWorkItems: number;
  backlogWorkItems: number;
  unstartedWorkItems: number;
  startedWorkItems: number;
  completedWorkItems: number;
  cancelledWorkItems: number;
  openWorkItems: number;
  completionRate: number;
  overdueWorkItems: number;
  overdueOtherItems: number;
  totalOverdue: number;
  memberCount: number;
  cycleCount: number;
  moduleCount: number;
};

export type TWorkspaceOverviewSummary = {
  projectCount: number;
  totalWorkItems: number;
  completedWorkItems: number;
  completionRate: number;
  activeOverdueCount: number;
  attentionProjectCount: number;
};

const PROJECT_STATS_FIELDS = "total_issues,completed_issues,total_members,total_cycles,total_modules";

const HEALTH_COPY: Record<TWorkspaceOverviewHealthLevel, Omit<TWorkspaceOverviewHealth, "level">> = {
  healthy: {
    label: "健康",
    description: "进度稳定",
    rank: 2,
  },
  watch: {
    label: "需关注",
    description: "进度偏慢或存在延期",
    rank: 1,
  },
  risk: {
    label: "有风险",
    description: "延期较多或进度滞后",
    rank: 0,
  },
};

const toNumber = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getSelectedProjectIdsParam = (projectIds: string[]) => (projectIds.length > 0 ? projectIds.join(",") : undefined);

const getProjectLeadName = (
  projectLead: IUserLite | string | null | undefined,
  getUserDetails: ReturnType<typeof useMember>["getUserDetails"]
): string | undefined => {
  if (!projectLead) return undefined;

  const leadDetails = typeof projectLead === "string" ? getUserDetails(projectLead) : projectLead;

  return leadDetails?.display_name ?? leadDetails?.email ?? undefined;
};

const getHealth = (params: {
  completionRate: number;
  openWorkItems: number;
  totalWorkItems: number;
  overdueWorkItems: number;
  overdueOtherItems: number;
}): TWorkspaceOverviewHealth => {
  const { completionRate, openWorkItems, totalWorkItems, overdueWorkItems, overdueOtherItems } = params;
  const overdueRatio = overdueWorkItems / Math.max(openWorkItems, 1);

  let level: TWorkspaceOverviewHealthLevel = "healthy";
  if (overdueRatio >= 0.25 || (openWorkItems > 0 && completionRate < 20) || overdueOtherItems >= 3) {
    level = "risk";
  } else if (overdueRatio >= 0.1 || (totalWorkItems > 0 && completionRate < 50) || overdueOtherItems > 0) {
    level = "watch";
  }

  return { level, ...HEALTH_COPY[level] };
};

const compareRowsByAttention = (a: TWorkspaceOverviewRow, b: TWorkspaceOverviewRow) => {
  if (a.healthRank !== b.healthRank) return a.healthRank - b.healthRank;
  if (a.totalOverdue !== b.totalOverdue) return b.totalOverdue - a.totalOverdue;
  if (a.openWorkItems !== b.openWorkItems) return b.openWorkItems - a.openWorkItems;
  if (a.completionRate !== b.completionRate) return a.completionRate - b.completionRate;
  return a.projectName.localeCompare(b.projectName);
};

const sortRowsByAttention = (rows: TWorkspaceOverviewRow[]) =>
  rows.reduce<TWorkspaceOverviewRow[]>((sortedRows, row) => {
    const insertIndex = sortedRows.findIndex((sortedRow) => compareRowsByAttention(row, sortedRow) < 0);
    if (insertIndex === -1) sortedRows.push(row);
    else sortedRows.splice(insertIndex, 0, row);

    return sortedRows;
  }, []);

export const useWorkspaceOverview = (workspaceSlug: string | undefined) => {
  const { selectedProjects } = useAnalytics();
  const { getUserDetails } = useMember();
  const { fetchProjectAnalyticsCount, getProjectById } = useProject();
  const selectedProjectIdsParam = getSelectedProjectIdsParam(selectedProjects);

  const projectScopeParams = selectedProjectIdsParam ? { project_ids: selectedProjectIdsParam } : undefined;

  const {
    data: projectStats,
    error: projectStatsError,
    isLoading: isProjectStatsLoading,
  } = useSWR<TProjectAnalyticsCount[]>(
    workspaceSlug
      ? ["workspace-overview-project-stats", workspaceSlug, selectedProjectIdsParam ?? "all-projects"]
      : null,
    workspaceSlug
      ? () =>
          fetchProjectAnalyticsCount(workspaceSlug, {
            fields: PROJECT_STATS_FIELDS,
            ...projectScopeParams,
          })
      : null
  );

  const {
    data: workItemStats,
    error: workItemStatsError,
    isLoading: isWorkItemStatsLoading,
  } = useSWR<WorkItemInsightColumns[]>(
    workspaceSlug
      ? ["workspace-overview-work-item-stats", workspaceSlug, selectedProjectIdsParam ?? "all-projects"]
      : null,
    workspaceSlug
      ? () =>
          analyticsService.getAdvanceAnalyticsStats<WorkItemInsightColumns[]>(workspaceSlug, "work-items", {
            ...projectScopeParams,
          })
      : null
  );

  const {
    data: overdueAnalytics,
    error: overdueError,
    isLoading: isOverdueLoading,
  } = useSWR(
    workspaceSlug
      ? ["workspace-overview-active-overdue", workspaceSlug, selectedProjectIdsParam ?? "all-projects"]
      : null,
    workspaceSlug
      ? () =>
          analyticsService.getWorkspaceOverdueAnalytics(workspaceSlug, {
            status: "active",
            ...projectScopeParams,
          })
      : null
  );

  const rows = useMemo<TWorkspaceOverviewRow[]>(() => {
    const projectStatsMap = new Map<string, TProjectAnalyticsCount>();
    const workItemStatsMap = new Map<string, WorkItemInsightColumns>();
    const overdueByProject = new Map<string, { workItems: number; other: number }>();
    const projectIds = new Set<string>();

    (projectStats ?? []).forEach((project) => {
      projectStatsMap.set(project.id, project);
      projectIds.add(project.id);
    });

    (workItemStats ?? []).forEach((project) => {
      if (!project.project_id) return;
      workItemStatsMap.set(project.project_id, project);
      projectIds.add(project.project_id);
    });

    (overdueAnalytics?.records ?? []).forEach((record: TOverdueRecord) => {
      if (!record.project_id) return;
      const current = overdueByProject.get(record.project_id) ?? { workItems: 0, other: 0 };
      if (record.entity_type === "issue") current.workItems += 1;
      else current.other += 1;
      overdueByProject.set(record.project_id, current);
      projectIds.add(record.project_id);
    });

    const overviewRows = Array.from(projectIds).map((projectId) => {
      const projectDetails = getProjectById(projectId);
      const stats = projectStatsMap.get(projectId);
      const workItems = workItemStatsMap.get(projectId);
      const overdue = overdueByProject.get(projectId) ?? { workItems: 0, other: 0 };

      const backlogWorkItems = toNumber(workItems?.backlog_work_items);
      const unstartedWorkItems = toNumber(workItems?.un_started_work_items);
      const startedWorkItems = toNumber(workItems?.started_work_items);
      const completedWorkItems = workItems
        ? toNumber(workItems.completed_work_items)
        : toNumber(stats?.completed_issues);
      const cancelledWorkItems = toNumber(workItems?.cancelled_work_items);
      const statusTotal =
        backlogWorkItems + unstartedWorkItems + startedWorkItems + completedWorkItems + cancelledWorkItems;
      const totalWorkItems = statusTotal > 0 ? statusTotal : toNumber(stats?.total_issues);
      const openWorkItems = Math.max(
        backlogWorkItems + unstartedWorkItems + startedWorkItems ||
          totalWorkItems - completedWorkItems - cancelledWorkItems,
        0
      );
      const completionDenominator = Math.max(totalWorkItems - cancelledWorkItems, 1);
      const completionRate = totalWorkItems > 0 ? Math.round((completedWorkItems / completionDenominator) * 100) : 0;
      const health = getHealth({
        completionRate,
        openWorkItems,
        totalWorkItems,
        overdueWorkItems: overdue.workItems,
        overdueOtherItems: overdue.other,
      });
      const projectName = projectDetails?.name ?? workItems?.project__name ?? "未命名项目";
      const projectIdentifier = projectDetails?.identifier;

      return {
        projectId,
        projectName,
        projectIdentifier,
        projectSearchValue: [projectName, projectIdentifier].filter(Boolean).join(" "),
        projectLeadName: getProjectLeadName(projectDetails?.project_lead, getUserDetails),
        logoProps: projectDetails?.logo_props,
        health,
        healthRank: health.rank,
        totalWorkItems,
        backlogWorkItems,
        unstartedWorkItems,
        startedWorkItems,
        completedWorkItems,
        cancelledWorkItems,
        openWorkItems,
        completionRate,
        overdueWorkItems: overdue.workItems,
        overdueOtherItems: overdue.other,
        totalOverdue: overdue.workItems + overdue.other,
        memberCount: toNumber(stats?.total_members),
        cycleCount: toNumber(stats?.total_cycles),
        moduleCount: toNumber(stats?.total_modules),
      };
    });

    return sortRowsByAttention(overviewRows);
  }, [getProjectById, getUserDetails, overdueAnalytics?.records, projectStats, workItemStats]);

  const summary = useMemo<TWorkspaceOverviewSummary>(() => {
    const totalWorkItems = rows.reduce((acc, row) => acc + row.totalWorkItems, 0);
    const completedWorkItems = rows.reduce((acc, row) => acc + row.completedWorkItems, 0);
    const cancelledWorkItems = rows.reduce((acc, row) => acc + row.cancelledWorkItems, 0);
    const completionRate =
      totalWorkItems > 0
        ? Math.round((completedWorkItems / Math.max(totalWorkItems - cancelledWorkItems, 1)) * 100)
        : 0;

    return {
      projectCount: rows.length,
      totalWorkItems,
      completedWorkItems,
      completionRate,
      activeOverdueCount: overdueAnalytics?.records?.length ?? 0,
      attentionProjectCount: rows.filter((row) => row.health.level !== "healthy").length,
    };
  }, [overdueAnalytics?.records?.length, rows]);

  const attentionRows = useMemo(
    () => sortRowsByAttention(rows.filter((row) => row.health.level !== "healthy")).slice(0, 10),
    [rows]
  );

  return {
    summary,
    rows,
    attentionRows,
    error: projectStatsError || workItemStatsError || overdueError,
    isLoading: isProjectStatsLoading || isWorkItemStatsLoading || isOverdueLoading,
  };
};
