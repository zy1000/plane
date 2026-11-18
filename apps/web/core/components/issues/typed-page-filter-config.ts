/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import type { TWorkItemFilterProperty } from "@plane/types";
import type { TProjectIssueScope } from "@/store/issue/project";

type TIssuePageFilterConfig = (typeof ISSUE_DISPLAY_FILTERS_BY_PAGE)["issues"];

const buildTypedFallbackConfig = (): TIssuePageFilterConfig => {
  const issuesConfig = ISSUE_DISPLAY_FILTERS_BY_PAGE.issues;

  return {
    ...issuesConfig,
    filters: issuesConfig.filters.filter((filter) => filter !== "type_id") as TWorkItemFilterProperty[],
  };
};

export const getProjectScopeFilterConfig = (scope: TProjectIssueScope): TIssuePageFilterConfig => {
  if (scope === "issues") return ISSUE_DISPLAY_FILTERS_BY_PAGE.issues;

  // 阶段详情页：阶段由页面锁定，不给「阶段」筛选项；工作项类型照常可筛
  if (scope === "stage") {
    const issuesConfig = ISSUE_DISPLAY_FILTERS_BY_PAGE.issues;
    return {
      ...issuesConfig,
      filters: issuesConfig.filters.filter((filter) => filter !== "stage_id") as TWorkItemFilterProperty[],
    };
  }

  const scopedConfig = ISSUE_DISPLAY_FILTERS_BY_PAGE[scope as keyof typeof ISSUE_DISPLAY_FILTERS_BY_PAGE];
  if (scopedConfig) return scopedConfig as TIssuePageFilterConfig;

  return buildTypedFallbackConfig();
};
