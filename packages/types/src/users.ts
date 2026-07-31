/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TUserPermissions } from "./enums";
import type { IIssueActivity, TIssuePriorities, TStateGroups } from ".";
import type { TLoginMediums } from "./instance";

/**
 * @description The start of the week for the user
 * @enum {number}
 */
export enum EStartOfTheWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export interface IUserLite {
  avatar_url: string;
  display_name: string;
  email?: string;
  first_name: string;
  id: string;
  is_bot: boolean;
  last_name: string;
  joining_date?: string;
}
export interface IUser extends IUserLite {
  // only for uploading the cover image
  cover_image_asset?: string | null;
  cover_image?: string | null;
  // only for rendering the cover image
  cover_image_url: string | null;
  date_joined: string;
  email: string;
  is_active: boolean;
  is_email_verified: boolean;
  is_password_autoset: boolean;
  is_tour_completed: boolean;
  mobile_number: string | null;
  last_workspace_id: string;
  user_timezone: string;
  username: string;
  last_login_medium: TLoginMediums;
  theme: IUserTheme;
}

export interface IUserAccount {
  provider_account_id: string;
  provider: string;
  created_at: Date;
  updated_at: Date;
}

export type TUserProfile = {
  id: string | undefined;
  user: string | undefined;
  role: string | undefined;
  last_workspace_id: string | undefined;
  theme: {
    theme: string | undefined;
    primary: string | undefined;
    background: string | undefined;
    darkPalette: boolean | undefined;
  };
  onboarding_step: TOnboardingSteps;
  is_onboarded: boolean;
  is_tour_completed: boolean;
  use_case: string | undefined;
  billing_address_country: string | undefined;
  billing_address: string | undefined;
  has_billing_address: boolean;
  has_marketing_email_consent: boolean;
  language: string;
  created_at: Date | string;
  updated_at: Date | string;
  start_of_the_week: EStartOfTheWeek;
};

export interface IInstanceAdminStatus {
  is_instance_admin: boolean;
}

export interface IUserSettings {
  id: string | undefined;
  email: string | undefined;
  workspace: {
    last_workspace_id: string | undefined;
    last_workspace_slug: string | undefined;
    last_workspace_name: string | undefined;
    last_workspace_logo: string | undefined;
    fallback_workspace_id: string | undefined;
    fallback_workspace_slug: string | undefined;
    invites: number | undefined;
  };
}

export interface IUserTheme {
  theme: string | undefined; // 'light', 'dark', 'custom', etc.
  primary?: string | undefined;
  background?: string | undefined;
  darkPalette?: boolean | undefined;
}

export interface IUserMemberLite extends IUserLite {
  email?: string;
}

export interface IUserActivity {
  created_date: string;
  activity_count: number;
}

export interface IUserPriorityDistribution {
  priority: TIssuePriorities;
  priority_count: number;
}

export interface IUserStateDistribution {
  state_group: TStateGroups;
  state_count: number;
}

export interface IUserActivityResponse {
  count: number;
  extra_stats: null;
  next_cursor: string;
  next_page_results: boolean;
  prev_cursor: string;
  prev_page_results: boolean;
  results: IIssueActivity[];
  total_pages: number;
  total_results: number;
}

export type UserAuth = {
  isMember: boolean;
  isOwner: boolean;
  isGuest: boolean;
};

export type TOnboardingSteps = {
  profile_complete: boolean;
  workspace_create: boolean;
  workspace_invite: boolean;
  workspace_join: boolean;
};

export interface IUserProfileData {
  assigned_issues: number;
  completed_issues: number;
  completed_this_week_issues: number;
  completed_today_issues: number;
  created_issues: number;
  high_priority_pending_issues: number;
  open_assigned_issues: number;
  open_assigned_non_defect_issues: number;
  open_created_issues: number;
  open_subscribed_issues: number;
  open_defect_issues: number;
  overdue_issues: number;
  pending_issues: number;
  pending_approval_issues: number;
  pending_execution_cases: number;
  pending_review_cases: number;
  priority_distribution: IUserPriorityDistribution[];
  responsible_cycles: number;
  responsible_releases: number;
  state_distribution: IUserStateDistribution[];
  subscribed_issues: number;
  today_pending_issues: number;
  unscheduled_pending_issues: number;
  week_pending_issues: number;
}

export type TProfileMetricKey =
  | "today_pending_issues"
  | "week_pending_issues"
  | "overdue_issues"
  | "unscheduled_pending_issues"
  | "pending_approval_issues"
  | "pending_execution_cases"
  | "pending_review_cases"
  | "responsible_cycles"
  | "responsible_releases"
  | "assigned_issues"
  | "created_issues"
  | "subscribed_issues"
  | "open_assigned_issues"
  | "open_created_issues"
  | "open_subscribed_issues"
  | "open_defect_issues"
  | "open_assigned_non_defect_issues";

export type TProfileMetricTreeNodeType = "project" | "plan" | "review";

export interface IProfileMetricTreeNode {
  children?: IProfileMetricTreeNode[];
  count: number;
  id: string;
  name: string;
  project_id: string;
  type: TProfileMetricTreeNodeType;
}

export interface IProfileMetricTreeResponse {
  count: number;
  nodes: IProfileMetricTreeNode[];
}

export interface IProfileMetricProject {
  id: string;
  identifier: string;
  name: string;
}

export interface IProfileMetricUser {
  avatar_url: string;
  display_name: string;
  id: string;
}

export interface IProfileMetricWorkItem {
  approval_to_state: {
    color: string;
    id: string;
    name: string;
  } | null;
  entity_type: "work_item";
  id: string;
  priority: TIssuePriorities;
  project: IProfileMetricProject;
  sequence_id: number;
  state: {
    color: string;
    group: TStateGroups;
    id: string;
    name: string;
  } | null;
  target_date: string | null;
  title: string;
}

export interface IProfileMetricCycle {
  end_date: string | null;
  entity_type: "cycle";
  id: string;
  owner: IProfileMetricUser | null;
  project: IProfileMetricProject;
  start_date: string | null;
  status: string | null;
  title: string;
}

export interface IProfileMetricRelease extends Omit<IProfileMetricCycle, "entity_type"> {
  entity_type: "release";
}

export interface IProfileMetricExecutionCase {
  assignee: IProfileMetricUser | null;
  case_id: string;
  code: string;
  entity_type: "execution_case";
  id: string;
  plan: { id: string; name: string };
  priority: string;
  project: IProfileMetricProject;
  result: string;
  title: string;
}

export interface IProfileMetricReviewCase {
  case_id: string;
  code: string;
  entity_type: "review_case";
  id: string;
  is_re_review: boolean;
  personal_review_status: string;
  priority: string;
  project: IProfileMetricProject;
  review: { id: string; name: string };
  title: string;
}

export type TProfileMetricItem =
  | IProfileMetricWorkItem
  | IProfileMetricCycle
  | IProfileMetricRelease
  | IProfileMetricExecutionCase
  | IProfileMetricReviewCase;

export interface IProfileMetricItemsResponse {
  count: number;
  data: TProfileMetricItem[];
}

export interface IUserProfileProjectSegregation {
  can_view_project_contributions: boolean;
  project_data: {
    assigned_issues: number;
    completed_issues: number;
    created_issues: number;
    id: string;
    pending_issues: number;
  }[];
  user_data: Pick<IUser, "avatar_url" | "cover_image_url" | "display_name" | "first_name" | "last_name"> & {
    date_joined: Date;
    user_timezone: string;
  };
}

export interface IUserProjectsRole {
  [projectId: string]: TUserPermissions;
}

export interface IUserEmailNotificationSettings {
  property_change: boolean;
  state_change: boolean;
  comment: boolean;
  mention: boolean;
  issue_completed: boolean;
}

export type TProfileViews = "assigned" | "created" | "subscribed" | "overdue" | "work_items" | "defects";

export type TPublicMember = {
  id: string;
  member: string;
  member__display_name: string;
  member__avatar: string;
};

// export interface ICurrentUser {
//   id: readonly string;
//   avatar: string;
//   first_name: string;
//   last_name: string;
//   username: string;
//   email: string;
//   mobile_number: string;
//   is_email_verified: boolean;
//   is_tour_completed: boolean;
//   onboarding_step: TOnboardingSteps;
//   is_onboarded: boolean;
//   role: string;
// }

// export interface ICustomTheme {
//   background: string;
//   text: string;
//   primary: string;
//   sidebarBackground: string;
//   sidebarText: string;
//   darkPalette: boolean;
//   palette: string;
//   theme: string;
// }

// export interface ICurrentUserSettings {
//   theme: ICustomTheme;
// }
