/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TChartData } from "./charts";

export enum ChartXAxisProperty {
  STATES = "STATES",
  STATE_GROUPS = "STATE_GROUPS",
  LABELS = "LABELS",
  ASSIGNEES = "ASSIGNEES",
  ESTIMATE_POINTS = "ESTIMATE_POINTS",
  CYCLES = "CYCLES",
  MODULES = "MODULES",
  PRIORITY = "PRIORITY",
  START_DATE = "START_DATE",
  TARGET_DATE = "TARGET_DATE",
  CREATED_AT = "CREATED_AT",
  COMPLETED_AT = "COMPLETED_AT",
  CREATED_BY = "CREATED_BY",
  WORK_ITEM_TYPES = "WORK_ITEM_TYPES",
  PROJECTS = "PROJECTS",
  EPICS = "EPICS",
}

export enum ChartYAxisMetric {
  WORK_ITEM_COUNT = "WORK_ITEM_COUNT",
  ESTIMATE_POINT_COUNT = "ESTIMATE_POINT_COUNT",
  PENDING_WORK_ITEM_COUNT = "PENDING_WORK_ITEM_COUNT",
  COMPLETED_WORK_ITEM_COUNT = "COMPLETED_WORK_ITEM_COUNT",
  IN_PROGRESS_WORK_ITEM_COUNT = "IN_PROGRESS_WORK_ITEM_COUNT",
  WORK_ITEM_DUE_THIS_WEEK_COUNT = "WORK_ITEM_DUE_THIS_WEEK_COUNT",
  WORK_ITEM_DUE_TODAY_COUNT = "WORK_ITEM_DUE_TODAY_COUNT",
  BLOCKED_WORK_ITEM_COUNT = "BLOCKED_WORK_ITEM_COUNT",
  EPIC_WORK_ITEM_COUNT = "EPIC_WORK_ITEM_COUNT",
}

export type TAnalyticsTabsBase = "overview" | "work-items" | "statistics" | "overdue";
export type TAnalyticsGraphsBase = "projects" | "work-items" | "custom-work-items";
export interface AnalyticsTab {
  key: TAnalyticsTabsBase;
  label: string;
  content: React.FC;
  isDisabled: boolean;
}
export type TAnalyticsFilterParams = {
  project_ids?: string;
  cycle_id?: string;
  module_id?: string;
};

export type TOverdueAnalyticsStatus = "active" | "all" | "resolved";
export type TOverdueEntityType = "issue" | "cycle" | "release" | "test_plan";
export type TOverdueDateField = "deadline" | "overdue_since";

export type TOverdueAnalyticsFilterParams = {
  project_ids?: string;
  status?: TOverdueAnalyticsStatus;
  entity_type?: TOverdueEntityType;
  date_field?: TOverdueDateField;
  start_date?: string;
  end_date?: string;
};

export type TOverdueAssignee = {
  id: string;
  display_name: string;
  avatar_url: string;
};

export type TOverdueRecord = {
  entity_type: TOverdueEntityType;
  entity_id: string;
  name: string;
  identifier: string | null;
  project_id: string | null;
  project_name: string;
  deadline: string | null;
  overdue_since: string | null;
  ended_at: string | null;
  is_active: boolean;
  overdue_days: number;
  phase: "dev" | "test" | null;
  status_label: string;
  assignees: TOverdueAssignee[];
};

export type TOverdueSummary = {
  work_items: number;
  cycles: number;
  releases: number;
  test_plans: number;
  total: number;
};

export type TOverdueTrendPoint = {
  month: string;
  count: number;
};

export type TOverdueAnalyticsResponse = {
  summary: TOverdueSummary;
  records: TOverdueRecord[];
  trend: TOverdueTrendPoint[];
};

// service types

export interface IAnalyticsResponse {
  [key: string]: any;
}

export interface IAnalyticsResponseFields {
  count: number;
  filter_count: number;
}

// chart types

export interface IChartResponse {
  schema: Record<string, string>;
  data: TChartData<string, string>[];
}

// table types

export interface WorkItemInsightColumns {
  project_id?: string;
  project__name?: string;
  cancelled_work_items: number;
  completed_work_items: number;
  backlog_work_items: number;
  un_started_work_items: number;
  started_work_items: number;
  // in case of peek view, we will display the display_name instead of project__name
  display_name?: string;
  avatar_url?: string;
  assignee_id?: string;
}

export type AnalyticsTableDataMap = {
  "work-items": WorkItemInsightColumns;
};

export interface IAnalyticsParams {
  x_axis: ChartXAxisProperty;
  y_axis: ChartYAxisMetric;
  group_by?: ChartXAxisProperty;
}
