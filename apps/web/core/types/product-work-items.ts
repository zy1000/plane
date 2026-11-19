/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 产品「工作项」页签：Issue.product 指向本产品的工作项（跨项目、只读）。
 * 与后端 `plane/utils/product_work_items.py` 一一对应。
 */

import type { TIssuePriorities, TLogoProps, TStateGroups } from "@plane/types";

export type TProductWorkItemStateGroupCounts = Record<"all" | TStateGroups, number>;

export type TProductWorkItem = {
  id: string;
  project_id: string;
  project_identifier: string;
  project_name: string;
  sequence_id: number;
  name: string;
  priority: TIssuePriorities | null;
  target_date: string | null;
  state: { id: string; name: string; color: string; group: TStateGroups } | null;
  type: { id: string; name: string; logo_props: TLogoProps | null } | null;
  product_module: { id: string; name: string } | null;
  assignee_ids: string[];
};

export type TProductWorkItemFacets = {
  projects: { id: string; identifier: string; name: string }[];
  types: { id: string; name: string; logo_props: TLogoProps | null }[];
  modules: { id: string; name: string }[];
  assignee_ids: string[];
};

export type TProductWorkItemsResponse = {
  total: number;
  page: number;
  per_page: number;
  state_group_counts: TProductWorkItemStateGroupCounts;
  facets: TProductWorkItemFacets;
  results: TProductWorkItem[];
};

export type TProductWorkItemsQuery = {
  page: number;
  per_page: number;
  state_group?: TStateGroups;
  search?: string;
  /** 富筛选表达式（JSON 字符串），后端走 IssueComplexFilterBackend */
  filters?: string;
};
