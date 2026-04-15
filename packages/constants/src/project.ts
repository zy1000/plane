/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TProjectAppliedDisplayFilterKeys, TProjectOrderByOptions } from "@plane/types";
// local imports

export type TNetworkChoiceIconKey = "Lock" | "Globe2";

export type TNetworkChoice = {
  key: 0 | 2;
  labelKey: string;
  i18n_label: string;
  description: string;
  iconKey: TNetworkChoiceIconKey;
};

export const NETWORK_CHOICES: TNetworkChoice[] = [
  {
    key: 0,
    labelKey: "Private",
    i18n_label: "workspace_projects.network.private.title",
    description: "workspace_projects.network.private.description", //"Accessible only by invite",
    iconKey: "Lock",
  },
  {
    key: 2,
    labelKey: "Public",
    i18n_label: "workspace_projects.network.public.title",
    description: "workspace_projects.network.public.description", //"Anyone in the workspace except Guests can join",
    iconKey: "Globe2",
  },
];

export const GROUP_CHOICES = {
  backlog: {
    key: "backlog",
    i18n_label: "workspace_projects.state.backlog",
  },
  unstarted: {
    key: "unstarted",
    i18n_label: "workspace_projects.state.unstarted",
  },
  started: {
    key: "started",
    i18n_label: "workspace_projects.state.started",
  },
  completed: {
    key: "completed",
    i18n_label: "workspace_projects.state.completed",
  },
  cancelled: {
    key: "cancelled",
    i18n_label: "workspace_projects.state.cancelled",
  },
};

export const PROJECT_AUTOMATION_MONTHS = [
  { i18n_label: "workspace_projects.common.months_count", value: 1 },
  { i18n_label: "workspace_projects.common.months_count", value: 3 },
  { i18n_label: "workspace_projects.common.months_count", value: 6 },
  { i18n_label: "workspace_projects.common.months_count", value: 9 },
  { i18n_label: "workspace_projects.common.months_count", value: 12 },
];

export const PROJECT_ORDER_BY_OPTIONS: {
  key: TProjectOrderByOptions;
  i18n_label: string;
}[] = [
  {
    key: "sort_order",
    i18n_label: "workspace_projects.sort.manual",
  },
  {
    key: "name",
    i18n_label: "workspace_projects.sort.name",
  },
  {
    key: "created_at",
    i18n_label: "workspace_projects.sort.created_at",
  },
  {
    key: "members_length",
    i18n_label: "workspace_projects.sort.members_length",
  },
];

export const PROJECT_DISPLAY_FILTER_OPTIONS: {
  key: TProjectAppliedDisplayFilterKeys;
  i18n_label: string;
}[] = [
  {
    key: "my_projects",
    i18n_label: "workspace_projects.scope.my_projects",
  },
  {
    key: "archived_projects",
    i18n_label: "workspace_projects.scope.archived_projects",
  },
  {
    key: "show_archived_projects",
    i18n_label: "workspace_projects.scope.archived_projects",
  },
];

export const PROJECT_ERROR_MESSAGES = {
  permissionError: {
    i18n_title: "workspace_projects.error.permission",
    i18n_message: undefined,
  },
  cycleDeleteError: {
    i18n_title: "error",
    i18n_message: "workspace_projects.error.cycle_delete",
  },
  moduleDeleteError: {
    i18n_title: "error",
    i18n_message: "workspace_projects.error.module_delete",
  },
  issueDeleteError: {
    i18n_title: "error",
    i18n_message: "workspace_projects.error.issue_delete",
  },
};

/**
 * 通用项目权限接口在 403 时返回的 `error` 字段。
 * 用于前端区分「权限不足」与「其他业务失败」。
 */
export function isProjectPermissionError(error: unknown): boolean {
  const raw =
    typeof error === "object" && error !== null && "error" in error
      ? (error as { error?: unknown }).error
      : undefined;
  const msg = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!msg) return false;
  if (msg === "You don't have the required permissions.") return true;
  if (msg === "您没有所需的项目权限。") return true;
  if (msg === "You don't have the required workspace permissions.") return true;
  if (msg === "You are not allowed to comment on the issue") return true;
  return false;
}

/**
 * 删除工作项接口的权限错误判断，兼容旧版「仅创建者或管理员可删除」文案。
 */
export function isWorkItemDeletePermissionError(error: unknown): boolean {
  if (isProjectPermissionError(error)) return true;

  const raw =
    typeof error === "object" && error !== null && "error" in error
      ? (error as { error?: unknown }).error
      : undefined;
  const msg = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!msg) return false;

  if (msg === "Only admin or creator can delete the work item") return true;
  if (msg.startsWith("Only admin or creator can delete the ")) return true;

  return false;
}

export enum EProjectFeatureKey {
  WORK_ITEMS = "work_items",
  CYCLES = "cycles",
  MODULES = "modules",
  VIEWS = "views",
  PAGES = "pages",
  INTAKE = "intake",
  OVERVIEW = "overview",
}

/** 邀请项目成员，与后端 PermissionKey.PROJECT_MEMBER_INVITE 一致 */
export const PROJECT_MEMBER_INVITE_PERMISSION_KEY = "project.member.invite" as const;

/** 项目文件/资产页权限常量，与后端 PermissionKey.PROJECT_ASSET_* 一致 */
export const PROJECT_ASSET_VIEW_PERMISSION_KEY = "project.asset.view" as const;
export const PROJECT_ASSET_UPLOAD_PERMISSION_KEY = "project.asset.upload" as const;
export const PROJECT_ASSET_DELETE_PERMISSION_KEY = "project.asset.delete" as const;
export const PROJECT_ASSET_DOWNLOAD_PERMISSION_KEY = "project.asset.download" as const;

/** 项目统计页（/projects/:id/statistics），与后端 PermissionKey.PROJECT_ANALYTICS_VIEW 一致 */
export const PROJECT_ANALYTICS_VIEW_PERMISSION_KEY = "project.analytics.view" as const;

/** 迭代权限常量，与后端 PermissionKey.SPRINTS_* 一致 */
export const PROJECT_SPRINTS_VIEW_PERMISSION_KEY = "sprints.view" as const;
export const PROJECT_SPRINTS_CREATE_PERMISSION_KEY = "sprints.create" as const;
export const PROJECT_SPRINTS_EDIT_PERMISSION_KEY = "sprints.edit" as const;
export const PROJECT_SPRINTS_DELETE_PERMISSION_KEY = "sprints.delete" as const;
export const PROJECT_SPRINTS_ARCHIVE_PERMISSION_KEY = "sprints.archive" as const;
export const PROJECT_SPRINTS_ISSUE_MANAGE_PERMISSION_KEY = "sprints.issue.manage" as const;
export const PROJECT_SPRINTS_FILE_UPLOAD_PERMISSION_KEY = "sprints.file.upload" as const;
export const PROJECT_SPRINTS_FILE_DELETE_PERMISSION_KEY = "sprints.file.delete" as const;
export const PROJECT_SPRINTS_FILE_DOWNLOAD_PERMISSION_KEY = "sprints.file.download" as const;

/** 项目视图列表/详情页权限，与后端 PermissionKey.VIEW_VIEW 一致 */
export const PROJECT_VIEWS_VIEW_PERMISSION_KEY = "view.view" as const;

/** 项目模块页权限常量，与后端 PermissionKey.MODULES_VIEW 一致 */
export const PROJECT_MODULES_VIEW_PERMISSION_KEY = "modules.view" as const;
/** 与后端 PermissionKey.MODULES_ARCHIVE 一致 */
export const PROJECT_MODULES_ARCHIVE_PERMISSION_KEY = "modules.archive" as const;

/** 项目发布页权限常量，与后端 PermissionKey.RELEASES_VIEW / RELEASES_CREATE 一致 */
export const PROJECT_RELEASES_VIEW_PERMISSION_KEY = "releases.view" as const;
export const PROJECT_RELEASES_CREATE_PERMISSION_KEY = "releases.create" as const;

/** 发布归档/恢复权限常量，与后端 PermissionKey.RELEASES_ARCHIVE 一致 */
export const PROJECT_RELEASES_ARCHIVE_PERMISSION_KEY = "releases.archive" as const;

/** 兼容旧命名，避免现有调用方失效 */
export const PROJECT_PUBLISH_VIEW_PERMISSION_KEY = PROJECT_RELEASES_VIEW_PERMISSION_KEY;
export const PROJECT_PUBLISH_CREATE_PERMISSION_KEY = PROJECT_RELEASES_CREATE_PERMISSION_KEY;
