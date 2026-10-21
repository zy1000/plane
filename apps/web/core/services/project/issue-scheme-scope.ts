/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 工作项配置（类型 / 扩展字段 / 状态 / 工作流）的作用域键。
 *
 * 项目设置三页与模板中心「工作项配置」页签复用同一套组件、service、store：
 * - 项目作用域：直接传 projectId，请求 `/api/workspaces/<slug>/projects/<projectId>/...`
 * - 方案作用域：传 `scheme:<schemeId>`，请求 `/api/workspaces/<slug>/issue-schemes/<schemeId>/...`
 *   （后端与项目级同名接口共用视图，请求 / 响应形状一致）
 *
 * 组件、hook、store 原来按 projectId 做缓存键和参数的地方，原样传这个键即可。
 */
export const ISSUE_SCHEME_SCOPE_PREFIX = "scheme:";

export const toIssueSchemeScopeKey = (schemeId: string) => `${ISSUE_SCHEME_SCOPE_PREFIX}${schemeId}`;

export const getSchemeIdFromScopeKey = (scopeKey: string | null | undefined): string | undefined =>
  scopeKey?.startsWith(ISSUE_SCHEME_SCOPE_PREFIX) ? scopeKey.slice(ISSUE_SCHEME_SCOPE_PREFIX.length) : undefined;

export const isIssueSchemeScopeKey = (scopeKey: string | null | undefined) => !!getSchemeIdFromScopeKey(scopeKey);

/** 工作项配置接口的路径前缀（不带结尾斜杠） */
export const issueConfigBasePath = (workspaceSlug: string, projectIdOrScopeKey: string) => {
  const schemeId = getSchemeIdFromScopeKey(projectIdOrScopeKey);
  return schemeId
    ? `/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}`
    : `/api/workspaces/${workspaceSlug}/projects/${projectIdOrScopeKey}`;
};
