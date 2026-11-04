/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDataScopeEntry, TDataScopeMode } from "@plane/types";
import { getScopeKeys } from "./editor/catalog";

export const WORKSPACE_KEY_TOTAL = getScopeKeys("workspace").length;
export const PROJECT_KEY_TOTAL = getScopeKeys("project").length;

export const DATA_SCOPE_MODE_LABELS: Record<TDataScopeMode, string> = {
  all: "全部",
  selected: "指定",
  filter: "按条件",
};

export const DATA_SCOPE_KIND_LABELS = { projects: "项目", products: "产品" } as const;

/** 列表里「数据权限」列的一行文字：全部 / 指定 3 个 / 按条件 */
/** 白名单是不是「全部」（用来判断「配了白名单却没勾项目权限」的提示） */
export const isScopeEntryAll = (entry: TDataScopeEntry | undefined) => !entry || entry.mode === "all";

export const getPermissionGroupsPath = (workspaceSlug: string) => `/${workspaceSlug}/settings/permission/`;

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
