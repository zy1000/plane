/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TModuleDisplayFilters, TModuleOrderByOptions } from "../module/module_filters";

export type TReleaseGroupByOption = "status" | "lead" | "none";

export type TReleaseDisplayPropertyKey =
  | "status"
  | "issue_count"
  | "start_date"
  | "end_date"
  | "created_by"
  | "members";

export type TReleaseDisplayProperties = Partial<Record<TReleaseDisplayPropertyKey, boolean>>;

export type TReleaseDisplayFilters = TModuleDisplayFilters & {
  group_by?: TReleaseGroupByOption;
  display_properties?: TReleaseDisplayProperties;
};

export type TReleaseOrderByOptions = TModuleOrderByOptions;
