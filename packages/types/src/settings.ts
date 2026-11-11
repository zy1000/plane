/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProfileSettingsTabs = "general" | "preferences" | "activity" | "notifications" | "security" | "api-tokens";

export type TWorkspaceSettingsTabs =
  | "my-access"
  | "general"
  | "members"
  | "departments"
  | "job-roles"
  | "groups"
  | "roles"
  | "templates"
  | "export"
  | "webhooks"
  | "issue-type-categories"
  | "requirement-types"
  | "data-dictionaries"
  | "stage-types"
  | "integrations"
  | "changelog";
export type TWorkspaceSettingsItem = {
  key: TWorkspaceSettingsTabs;
  i18n_label: string;
  href: string;
  /** 任一 key（或成员身份类访问条件）满足即显示；不填看 requiresMembership */
  permissionKeys?: string[];
  requiresMembership?: boolean;
  highlight: (pathname: string, baseUrl: string) => boolean;
};

export type TProjectSettingsTabs =
  | "general"
  | "members"
  | "teams"
  | "roles"
  | "products"
  | "features_cycles"
  | "features_modules"
  | "features_releases"
  | "features_views"
  | "features_pages"
  | "features_intake"
  | "features_reviews"
  | "states"
  | "issue_types"
  | "labels"
  | "estimates"
  | "automations"
  | "workflow"
  | "pms_sync";
export type TProjectSettingsItem = {
  key: TProjectSettingsTabs;
  i18n_label: string;
  href: string;
  /** 任一满足即可看到（可含 @plane/constants 的 PROJECT_MEMBER_ACCESS 等成员条件） */
  permissionKeys?: string[];
  editPermissionKeys?: string[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};
