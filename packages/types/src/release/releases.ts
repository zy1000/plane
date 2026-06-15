import type { ILinkDetails } from "../issues";
import type { TIssue } from "../issues/issue";
import type { IUserLite } from "../users";
import type { IIssueFilterOptions } from "../view-props";

export type TReleaseStatus =
  | "not-started"
  | "in-progress"
  | "pending-test"
  | "testing"
  | "rejected"
  | "completed"
  | "cancelled";

export type TReleaseOverduePhase = "dev" | "test";

export type TReleaseOverdueTrigger = "system" | "user";

export interface IReleaseOverdueRecord {
  id: string;
  release: string;
  phase: TReleaseOverduePhase;
  started_at: string;
  ended_at: string | null;
  triggered_by: TReleaseOverdueTrigger;
  snapshot_owner: string | null;
  snapshot_owner_detail: IUserLite | null;
  snapshot_status: string;
  created_at: string;
  updated_at: string;
}

export type TReleaseCompletionChartDistribution = {
  [key: string]: number | null;
};

export type TReleaseDistributionBase = {
  total_issues: number;
  pending_issues: number;
  completed_issues: number;
};

export type TReleaseEstimateDistributionBase = {
  total_estimates: number;
  pending_estimates: number;
  completed_estimates: number;
};

export type TReleaseAssigneesDistribution = {
  assignee_id: string | null;
  avatar_url: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
};

export type TReleaseLabelsDistribution = {
  color: string | null;
  label_id: string | null;
  label_name: string | null;
};

export type TReleaseDistribution = {
  assignees: (TReleaseAssigneesDistribution & TReleaseDistributionBase)[];
  completion_chart: TReleaseCompletionChartDistribution;
  labels: (TReleaseLabelsDistribution & TReleaseDistributionBase)[];
};

export type TReleaseEstimateDistribution = {
  assignees: (TReleaseAssigneesDistribution & TReleaseEstimateDistributionBase)[];
  completion_chart: TReleaseCompletionChartDistribution;
  labels: (TReleaseLabelsDistribution & TReleaseEstimateDistributionBase)[];
};

export interface IRelease {
  total_issues: number;
  completed_issues: number;
  backlog_issues: number;
  started_issues: number;
  unstarted_issues: number;
  cancelled_issues: number;
  total_estimate_points?: number;
  completed_estimate_points?: number;
  backlog_estimate_points: number;
  started_estimate_points: number;
  unstarted_estimate_points: number;
  cancelled_estimate_points: number;
  distribution?: TReleaseDistribution;
  estimate_distribution?: TReleaseEstimateDistribution;

  id: string;
  name: string;
  description: string;
  description_text: any;
  description_html: any;
  workspace_id: string;
  project_id: string;
  lead_id: string | null;
  member_ids: string[];
  link_release?: ILinkDetails[];
  sub_issues?: number;
  is_favorite: boolean;
  sort_order: number;
  view_props: {
    filters: IIssueFilterOptions;
  };
  status?: TReleaseStatus;
  archived_at: string | null;
  start_date: string | null;
  target_date: string | null;
  test_handoff_date: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  note?: string;
  has_active_overdue?: boolean;
  has_overdue_history?: boolean;
  active_overdue_phase?: TReleaseOverduePhase | null;
  has_active_dev_overdue?: boolean;
  has_active_test_overdue?: boolean;
  has_dev_overdue_history?: boolean;
  has_test_overdue_history?: boolean;
}

export interface ReleaseIssueResponse {
  created_at: Date;
  created_by: string;
  id: string;
  issue: string;
  issue_detail: TIssue;
  release: string;
  release_detail: IRelease;
  project: string;
  updated_at: Date;
  updated_by: string;
  workspace: string;
  sub_issues_count: number;
}

export type ReleaseLink = {
  title: string;
  url: string;
};

export type SelectReleaseType = (IRelease & { actionType: "edit" | "delete" | "create-issue" }) | undefined;

export type TReleasePlotType = "burndown" | "points";

export type TPublicRelease = {
  id: string;
  name: string;
};
