/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import type { TLogoProps, WorkItemInsightColumns } from "@plane/types";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
import { useProject } from "@/hooks/store/use-project";
// services
import { AnalyticsService } from "@/services/analytics.service";

const analyticsService = new AnalyticsService();

export type TWorkItemsStatusKey = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export type TWorkItemsStatusSegment = {
  key: TWorkItemsStatusKey;
  label: string;
  value: number;
  ratio: number;
};

export type TWorkItemsProjectRow = {
  projectId: string;
  projectName: string;
  projectIdentifier?: string;
  projectSearchValue: string;
  logoProps?: TLogoProps;
  totalWorkItems: number;
  activeWorkItems: number;
  backlogWorkItems: number;
  unstartedWorkItems: number;
  startedWorkItems: number;
  completedWorkItems: number;
  cancelledWorkItems: number;
  completionRate: number;
  backlogRatio: number;
  cancelledRate: number;
  dominantStatus: TWorkItemsStatusKey;
  dominantStatusLabel: string;
  segments: TWorkItemsStatusSegment[];
};

export type TWorkItemsFlowSummary = {
  totalWorkItems: number;
  activeWorkItems: number;
  backlogWorkItems: number;
  unstartedWorkItems: number;
  startedWorkItems: number;
  completedWorkItems: number;
  cancelledWorkItems: number;
  completionRate: number;
  backlogRatio: number;
  cancelledRate: number;
  segments: TWorkItemsStatusSegment[];
};

type TWorkItemsStatusCounts = Record<TWorkItemsStatusKey, number>;

export const WORK_ITEM_STATUS_LABELS: Record<TWorkItemsStatusKey, string> = {
  backlog: "待办",
  unstarted: "未开始",
  started: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export const WORK_ITEM_STATUS_ORDER: TWorkItemsStatusKey[] = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
];

const toNumber = (value: unknown) => {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const getProjectIdsParam = (projectIds: string[]) => (projectIds.length > 0 ? projectIds.join(",") : undefined);

const getCompletionRate = ({
  cancelledWorkItems,
  completedWorkItems,
  totalWorkItems,
}: {
  cancelledWorkItems: number;
  completedWorkItems: number;
  totalWorkItems: number;
}) =>
  totalWorkItems > 0 ? Math.round((completedWorkItems / Math.max(totalWorkItems - cancelledWorkItems, 1)) * 100) : 0;

const getStatusSegments = (counts: TWorkItemsStatusCounts, totalWorkItems: number): TWorkItemsStatusSegment[] =>
  WORK_ITEM_STATUS_ORDER.map((key) => ({
    key,
    label: WORK_ITEM_STATUS_LABELS[key],
    value: counts[key],
    ratio: totalWorkItems > 0 ? Math.round((counts[key] / totalWorkItems) * 100) : 0,
  }));

const getDominantStatus = (counts: TWorkItemsStatusCounts) =>
  WORK_ITEM_STATUS_ORDER.reduce<TWorkItemsStatusKey>(
    (dominantStatus, key) => (counts[key] > counts[dominantStatus] ? key : dominantStatus),
    "backlog"
  );

const compareRowsByWorkload = (a: TWorkItemsProjectRow, b: TWorkItemsProjectRow) => {
  if (a.activeWorkItems !== b.activeWorkItems) return b.activeWorkItems - a.activeWorkItems;
  if (a.backlogRatio !== b.backlogRatio) return b.backlogRatio - a.backlogRatio;
  if (a.startedWorkItems !== b.startedWorkItems) return b.startedWorkItems - a.startedWorkItems;
  if (a.completionRate !== b.completionRate) return a.completionRate - b.completionRate;
  return a.projectName.localeCompare(b.projectName);
};

const sortRowsByWorkload = (rows: TWorkItemsProjectRow[]) =>
  rows.reduce<TWorkItemsProjectRow[]>((sortedRows, row) => {
    const insertIndex = sortedRows.findIndex((sortedRow) => compareRowsByWorkload(row, sortedRow) < 0);
    if (insertIndex === -1) sortedRows.push(row);
    else sortedRows.splice(insertIndex, 0, row);

    return sortedRows;
  }, []);

const getRowFromProjectStats = (
  project: WorkItemInsightColumns,
  getProjectById: ReturnType<typeof useProject>["getProjectById"]
): TWorkItemsProjectRow => {
  const projectId = project.project_id ?? "";
  const projectDetails = getProjectById(projectId);
  const backlogWorkItems = toNumber(project.backlog_work_items);
  const unstartedWorkItems = toNumber(project.un_started_work_items);
  const startedWorkItems = toNumber(project.started_work_items);
  const completedWorkItems = toNumber(project.completed_work_items);
  const cancelledWorkItems = toNumber(project.cancelled_work_items);
  const counts: TWorkItemsStatusCounts = {
    backlog: backlogWorkItems,
    unstarted: unstartedWorkItems,
    started: startedWorkItems,
    completed: completedWorkItems,
    cancelled: cancelledWorkItems,
  };
  const totalWorkItems =
    backlogWorkItems + unstartedWorkItems + startedWorkItems + completedWorkItems + cancelledWorkItems;
  const activeWorkItems = Math.max(backlogWorkItems + unstartedWorkItems + startedWorkItems, 0);
  const completionRate = getCompletionRate({ cancelledWorkItems, completedWorkItems, totalWorkItems });
  const backlogRatio = totalWorkItems > 0 ? Math.round((backlogWorkItems / totalWorkItems) * 100) : 0;
  const cancelledRate = totalWorkItems > 0 ? Math.round((cancelledWorkItems / totalWorkItems) * 100) : 0;
  const dominantStatus = getDominantStatus(counts);
  const projectName = projectDetails?.name ?? project.project__name ?? "未命名项目";
  const projectIdentifier = projectDetails?.identifier;

  return {
    projectId,
    projectName,
    projectIdentifier,
    projectSearchValue: [projectName, projectIdentifier].filter(Boolean).join(" "),
    logoProps: projectDetails?.logo_props,
    totalWorkItems,
    activeWorkItems,
    backlogWorkItems,
    unstartedWorkItems,
    startedWorkItems,
    completedWorkItems,
    cancelledWorkItems,
    completionRate,
    backlogRatio,
    cancelledRate,
    dominantStatus,
    dominantStatusLabel: WORK_ITEM_STATUS_LABELS[dominantStatus],
    segments: getStatusSegments(counts, totalWorkItems),
  };
};

export const useWorkItemsAnalysis = (workspaceSlug: string | undefined) => {
  const { selectedDuration, selectedProjects } = useAnalytics();
  const { getProjectById } = useProject();
  const selectedProjectIdsParam = getProjectIdsParam(selectedProjects);

  const {
    data: projectStats,
    error,
    isLoading,
  } = useSWR<WorkItemInsightColumns[]>(
    workspaceSlug
      ? [
          "work-items-analysis-project-stats",
          workspaceSlug,
          selectedDuration,
          selectedProjectIdsParam ?? "all-projects",
        ]
      : null,
    workspaceSlug
      ? () =>
          analyticsService.getAdvanceAnalyticsStats<WorkItemInsightColumns[]>(workspaceSlug, "work-items", {
            date_filter: selectedDuration,
            ...(selectedProjectIdsParam ? { project_ids: selectedProjectIdsParam } : {}),
          })
      : null
  );

  const rows = useMemo<TWorkItemsProjectRow[]>(() => {
    const parsedRows = projectStats?.map((project) => getRowFromProjectStats(project, getProjectById)) ?? [];

    return sortRowsByWorkload(parsedRows.filter((row) => row.projectId));
  }, [getProjectById, projectStats]);

  const summary = useMemo<TWorkItemsFlowSummary>(() => {
    const backlogWorkItems = rows.reduce((acc, row) => acc + row.backlogWorkItems, 0);
    const unstartedWorkItems = rows.reduce((acc, row) => acc + row.unstartedWorkItems, 0);
    const startedWorkItems = rows.reduce((acc, row) => acc + row.startedWorkItems, 0);
    const completedWorkItems = rows.reduce((acc, row) => acc + row.completedWorkItems, 0);
    const cancelledWorkItems = rows.reduce((acc, row) => acc + row.cancelledWorkItems, 0);
    const totalWorkItems =
      backlogWorkItems + unstartedWorkItems + startedWorkItems + completedWorkItems + cancelledWorkItems;
    const activeWorkItems = backlogWorkItems + unstartedWorkItems + startedWorkItems;
    const counts: TWorkItemsStatusCounts = {
      backlog: backlogWorkItems,
      unstarted: unstartedWorkItems,
      started: startedWorkItems,
      completed: completedWorkItems,
      cancelled: cancelledWorkItems,
    };

    return {
      totalWorkItems,
      activeWorkItems,
      backlogWorkItems,
      unstartedWorkItems,
      startedWorkItems,
      completedWorkItems,
      cancelledWorkItems,
      completionRate: getCompletionRate({ cancelledWorkItems, completedWorkItems, totalWorkItems }),
      backlogRatio: totalWorkItems > 0 ? Math.round((backlogWorkItems / totalWorkItems) * 100) : 0,
      cancelledRate: totalWorkItems > 0 ? Math.round((cancelledWorkItems / totalWorkItems) * 100) : 0,
      segments: getStatusSegments(counts, totalWorkItems),
    };
  }, [rows]);

  return {
    error,
    isLoading,
    rows,
    summary,
  };
};
