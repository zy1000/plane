/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDataScopeMode, TPermissionGroupKind } from "@plane/types";
import { getScopeKeys } from "./editor/catalog";

export const WORKSPACE_KEY_TOTAL = getScopeKeys("workspace").length;
export const PROJECT_KEY_TOTAL = getScopeKeys("project").length;

/** 三类权限组（docs/permission-refactor/split-plan.md §1），列表分段、新建弹窗「类型」字段都按这个顺序 */
export const PERMISSION_GROUP_KINDS: TPermissionGroupKind[] = ["workspace", "project_template", "data"];

export const PERMISSION_GROUP_KIND_LABELS: Record<TPermissionGroupKind, string> = {
  workspace: "工作区权限组",
  project_template: "项目权限模板",
  data: "数据权限",
};

export const isPermissionGroupKind = (value: string | null | undefined): value is TPermissionGroupKind =>
  value != null && (PERMISSION_GROUP_KINDS as string[]).includes(value);

export type TPermissionGroupDetailTab = "permissions" | "data-scope" | "members" | "referenced";

/** 详情页每类可用的页签，第一个是默认页签 */
export const PERMISSION_GROUP_KIND_TABS: Record<TPermissionGroupKind, TPermissionGroupDetailTab[]> = {
  workspace: ["permissions", "members"],
  project_template: ["permissions", "referenced"],
  data: ["data-scope", "members"],
};

export const getPermissionGroupDefaultTab = (kind: TPermissionGroupKind): TPermissionGroupDetailTab =>
  PERMISSION_GROUP_KIND_TABS[kind][0];

export const DATA_SCOPE_MODE_LABELS: Record<TDataScopeMode, string> = {
  all: "全部",
  selected: "指定",
  filter: "按条件",
};

export const DATA_SCOPE_KIND_LABELS = { projects: "项目", products: "产品" } as const;

/** 列表页；带 kind 时落在对应分段 */
export const getPermissionGroupsPath = (workspaceSlug: string, kind?: TPermissionGroupKind) =>
  `/${workspaceSlug}/settings/permission/${kind ? `?kind=${kind}` : ""}`;

export const getPermissionGroupDetailPath = (workspaceSlug: string, roleId: string, tab?: string) =>
  `/${workspaceSlug}/settings/permission/${roleId}/${tab ? `?tab=${tab}` : ""}`;

/** 后端错误体 → 一句人话 */
export const getPermissionGroupErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string; name?: string[] | string };
    if (Array.isArray(payload.name)) return payload.name[0] ?? fallback;
    if (typeof payload.name === "string") return payload.name;
    return payload.error ?? payload.detail ?? fallback;
  }
  return fallback;
};
