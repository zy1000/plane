/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// local imports
import type { EUserProjectRoles } from ".";
import type { EUserWorkspaceRoles } from "./workspace";

export type TProfileSettingsTabs = "general" | "preferences" | "activity" | "notifications" | "security" | "api-tokens";

export type TWorkspaceSettingsTabs =
  | "general"
  | "members"
  | "groups"
  | "roles"
  | "templates"
  | "export"
  | "webhooks"
  | "issue-type-categories"
  | "changelog";
export type TWorkspaceSettingsItem = {
  key: TWorkspaceSettingsTabs;
  i18n_label: string;
  href: string;
  access: EUserWorkspaceRoles[];
  permissionKeys?: string[];
  requiresMembership?: boolean;
  highlight: (pathname: string, baseUrl: string) => boolean;
};

export type TProjectSettingsTabs =
  | "general"
  | "members"
  | "roles"
  | "features_cycles"
  | "features_modules"
  | "features_views"
  | "features_pages"
  | "features_intake"
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
  access: EUserProjectRoles[];
  permissionKeys?: string[];
  editPermissionKeys?: string[];
  highlight: (pathname: string, baseUrl: string) => boolean;
};
