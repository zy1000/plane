/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TCycleTabOptions = "active" | "all";

export type TCycleLayoutOptions = "list" | "board" | "gantt";

export type TCycleOrderByOptions =
  | "manual"
  | "name"
  | "-name"
  | "progress"
  | "-progress"
  | "issues"
  | "-issues"
  | "start_date"
  | "-start_date"
  | "end_date"
  | "-end_date"
  | "created_at"
  | "-created_at";

export type TCycleDisplayPropertyKey =
  | "status"
  | "issue_count"
  | "start_date"
  | "end_date"
  | "test_handoff_date"
  | "created_by"
  | "members";

export type TCycleDisplayProperties = Partial<Record<TCycleDisplayPropertyKey, boolean>>;

export type TCycleDisplayFilters = {
  active_tab?: TCycleTabOptions;
  layout?: TCycleLayoutOptions;
  group_by?: "state" | "owned_by" | "release" | "none";
  order_by?: TCycleOrderByOptions;
  display_properties?: TCycleDisplayProperties;
};

export type TCycleFilters = {
  end_date?: string[] | null;
  start_date?: string[] | null;
  status?: string[] | null;
};

export type TCycleFiltersByState = {
  default: TCycleFilters;
  archived: TCycleFilters;
};

export type TCycleStoredFilters = {
  display_filters?: TCycleDisplayFilters;
  filters?: TCycleFilters;
};
