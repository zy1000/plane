/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPaginationInfo } from "./common";
import type { ICycle } from "./cycle";
import type { TUserPermissions } from "./enums";
import type { TProjectMembership } from "./project";
import type { IUser, IUserLite } from "./users";
import type { TLoginMediums } from "./instance";
import type { IWorkspaceViewProps } from "./view-props";

export enum EUserWorkspaceRoles {
  ADMIN = 20,
  MEMBER = 15,
  GUEST = 5,
}

export interface IWorkspace {
  readonly id: string;
  readonly owner: IUser;
  readonly created_at: Date;
  readonly updated_at: Date;
  name: string;
  url: string;
  logo_url: string | null;
  readonly total_members: number;
  readonly slug: string;
  readonly created_by: string;
  readonly updated_by: string;
  organization_size: string;
  total_projects?: number;
  role: number;
  timezone: string;
}

export interface IWorkspaceLite {
  readonly id: string;
  name: string;
  slug: string;
}

export interface IWorkspaceMemberInvitation {
  accepted: boolean;
  email: string;
  id: string;
  message: string;
  responded_at: Date;
  role: TUserPermissions;
  custom_role_ids: string[];
  token: string;
  invite_link: string;
  workspace: {
    id: string;
    logo_url: string;
    name: string;
    slug: string;
  };
}

export interface IWorkspaceBulkInviteFormData {
  emails: { email: string; role: TUserPermissions; custom_role_ids?: string[] }[];
}

/** 尚未加入某工作区、可被邀请的本地用户（邀请弹窗下拉候选） */
export type TWorkspaceInvitableUser = Pick<IUserLite, "id" | "display_name" | "first_name" | "last_name" | "avatar_url"> & {
  email: string;
};

export type Properties = {
  assignee: boolean;
  start_date: boolean;
  due_date: boolean;
  labels: boolean;
  key: boolean;
  priority: boolean;
  state: boolean;
  sub_issue_count: boolean;
  link: boolean;
  attachment_count: boolean;
  estimate: boolean;
  created_on: boolean;
  updated_on: boolean;
};

export interface IWorkspaceMember {
  id: string;
  member: IUserLite;
  role: TUserPermissions | EUserWorkspaceRoles;
  created_at?: string;
  avatar_url?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  joining_date?: string;
  display_name?: string;
  last_login_medium?: TLoginMediums;
  is_active?: boolean;
  custom_role_ids: string[];
  group_role_ids: string[];
  group_ids: string[];
}

export interface IWorkspaceMemberMe {
  company_role: string | null;
  created_at: Date;
  created_by: string;
  default_props: IWorkspaceViewProps;
  id: string;
  member: string;
  role: TUserPermissions | EUserWorkspaceRoles;
  updated_at: Date;
  updated_by: string;
  view_props: IWorkspaceViewProps;
  workspace: string;
  draft_issue_count: number;
  custom_role_ids: string[];
  group_role_ids: string[];
  group_ids?: string[];
}

export type TWorkspaceMyAccessPermissionSourceType =
  | "direct_role"
  | "group_role"
  | "workspace_owner"
  | "instance_admin";

export interface IWorkspaceMyAccessRole {
  id: string;
  name: string;
  description: string | null;
}

export interface IWorkspaceMyAccessGroup {
  id: string;
  name: string;
  description: string | null;
  joined_at: string | null;
  roles: IWorkspaceMyAccessRole[];
}

export interface IWorkspaceMyAccessPermissionSource {
  type: TWorkspaceMyAccessPermissionSourceType;
  role: Pick<IWorkspaceMyAccessRole, "id" | "name"> | null;
  group: { id: string; name: string } | null;
}

export interface IWorkspaceMyAccessPermission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: "workspace";
  module: string | null;
  action: string | null;
  category: string | null;
  sort_order: number;
  is_granted: boolean;
  sources: IWorkspaceMyAccessPermissionSource[];
}

export interface IWorkspaceMyAccess {
  membership: {
    id: string | null;
    role: EUserWorkspaceRoles | null;
    joined_at: string | null;
    is_workspace_owner: boolean;
    is_instance_admin: boolean;
  };
  direct_roles: IWorkspaceMyAccessRole[];
  groups: IWorkspaceMyAccessGroup[];
  permissions: IWorkspaceMyAccessPermission[];
}

export interface ILastActiveWorkspaceDetails {
  workspace_details: IWorkspace;
  project_details?: TProjectMembership[];
}

export interface IWorkspaceDefaultSearchResult {
  id: string;
  name: string;
  project_id: string;
  project__identifier: string;
  workspace__slug: string;
}
export interface IWorkspaceSearchResult {
  id: string;
  name: string;
  slug: string;
}

export interface IWorkspaceIssueSearchResult {
  id: string;
  name: string;
  project__identifier: string;
  project_id: string;
  sequence_id: number;
  workspace__slug: string;
  type_id: string;
}

export interface IWorkspacePageSearchResult {
  id: string;
  name: string;
  project_ids: string[];
  project__identifiers: string[];
  workspace__slug: string;
}

export interface IWorkspaceProjectSearchResult {
  id: string;
  identifier: string;
  name: string;
  workspace__slug: string;
}

export interface IWorkspaceSearchResults {
  results: {
    workspace: IWorkspaceSearchResult[];
    project: IWorkspaceProjectSearchResult[];
    issue: IWorkspaceIssueSearchResult[];
    cycle: IWorkspaceDefaultSearchResult[];
    module: IWorkspaceDefaultSearchResult[];
    issue_view: IWorkspaceDefaultSearchResult[];
    page: IWorkspacePageSearchResult[];
  };
}

export interface IProductUpdateResponse {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: string;
    node_id: string;
    avatar_url: string;
    gravatar_id: "";
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: false;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: true;
  created_at: string;
  published_at: string;
  assets: [];
  tarball_url: string;
  zipball_url: string;
  body: string;
  reactions: {
    url: string;
    total_count: number;
    "+1": number;
    "-1": number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
}

export interface IWorkspaceActiveCyclesResponse {
  count: number;
  extra_stats: null;
  next_cursor: string;
  next_page_results: boolean;
  prev_cursor: string;
  prev_page_results: boolean;
  results: ICycle[];
  total_pages: number;
}

export interface IWorkspaceProgressResponse {
  completed_issues: number;
  total_issues: number;
  started_issues: number;
  cancelled_issues: number;
  unstarted_issues: number;
}
export interface IWorkspaceAnalyticsResponse {
  completion_chart: Record<string, unknown>;
}

export type TWorkspacePaginationInfo = TPaginationInfo & {
  results: IWorkspace[];
};

export interface IWorkspaceSidebarNavigationItem {
  key?: string;
  is_pinned: boolean;
  sort_order: number;
}

export interface IWorkspaceSidebarNavigation {
  [key: string]: IWorkspaceSidebarNavigationItem;
}

export enum EOnboardingSteps {
  PROFILE_SETUP = "PROFILE_SETUP",
  ROLE_SETUP = "ROLE_SETUP",
  USE_CASE_SETUP = "USE_CASE_SETUP",
  WORKSPACE_CREATE_OR_JOIN = "WORKSPACE_CREATE_OR_JOIN",
  INVITE_MEMBERS = "INVITE_MEMBERS",
}

export type TOnboardingStep = EOnboardingSteps;

export enum ECreateOrJoinWorkspaceViews {
  WORKSPACE_CREATE = "WORKSPACE_CREATE",
  WORKSPACE_JOIN = "WORKSPACE_JOIN",
}

// Workspace Role
export type TWorkspaceRoleType = "workspace" | "project_template";

export interface IWorkspaceRole {
  id: string;
  workspace: string;
  name: string;
  description: string;
  permissions: Record<string, unknown>;
  type: TWorkspaceRoleType;
  legacy_role: EUserWorkspaceRoles | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

// Workspace Group
export interface IWorkspaceGroup {
  id: string;
  workspace: string;
  name: string;
  description: string;
  member_count: number;
  role_count: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

export interface IWorkspaceGroupMember {
  id: string;
  group: string;
  member: string;
  member_detail: IWorkspaceMember;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

export interface IWorkspaceGroupRole {
  id: string;
  group: string;
  role: string;
  role_detail: IWorkspaceRole;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

// Permission
export interface IPermission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: "workspace" | "project";
  module: string | null;
  action: string | null;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  is_bound: boolean;
}

export interface IRolePermissionData {
  role: IWorkspaceRole;
  permission_keys: string[];
  permissions: IPermission[];
}

// Project Role — 项目内实际生效的自定义角色
export interface IProjectRole {
  id: string;
  project: string;
  name: string;
  description: string;
  permissions: Record<string, unknown>;
  source_template: string | null;
  source_template_name: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

export interface IProjectGroupRole {
  id: string;
  project: string;
  group: string;
  role: string;
  role_detail: IProjectRole;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  deleted_at: string | null;
}

export interface IProjectGroup {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  project_member_count: number;
  grants: IProjectGroupRole[];
}

export interface IProjectGroupMember {
  id: string;
  workspace_member_id: string;
  member: IUserLite;
  is_project_member: boolean;
}

export interface IProjectRolePermissionData {
  role: IProjectRole;
  permission_keys: string[];
  permissions: IPermission[];
}
