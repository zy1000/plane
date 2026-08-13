/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 项目下按工作项类别切分的页面。
 *
 * 这些字符串会作为 `scope` 查询参数发给后端（见 issue.store.ts），并与
 * `apps/api/plane/app/views/issue/base.py` 的 PROJECT_ISSUE_PAGE_SCOPE_* 两张表
 * 逐字对应 —— 改这里必须同时改那里，否则后端认不出 scope，会**同时**跳过权限校验
 * 和类别过滤，页面静默列出项目全部工作项。
 *
 * 产品需求实体页在 /projects/:id/requirements，与本枚举无关。原先还有一档
 * `dev_requirements`（研发需求工作项视图），页面已下线；后端 scope 表里的对应
 * 条目保留不删 —— 前端不再发这个值，留着无害，删了反而可能影响外部调用方。
 */
export type TProjectIssueScope = "issues" | "defects";

export const DEFAULT_PROJECT_ISSUE_SCOPE: TProjectIssueScope = "issues";

export const getProjectIssueScopeKey = (
  projectId: string,
  scope: TProjectIssueScope = DEFAULT_PROJECT_ISSUE_SCOPE
): string => `${projectId}__${scope}`;

export const getProjectIssueScopeFromPathname = (pathname: string | null | undefined): TProjectIssueScope => {
  // /requirements 是产品需求页 —— 那个页面没有工作项 store，不能落到任何
  // typed scope 上，所以它走默认分支。
  if (pathname?.includes("/defects")) return "defects";
  return DEFAULT_PROJECT_ISSUE_SCOPE;
};
