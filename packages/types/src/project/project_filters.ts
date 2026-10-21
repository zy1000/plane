/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectOrderByOptions =
  | "sort_order"
  | "name"
  | "-name"
  | "created_at"
  | "-created_at"
  | "members_length"
  | "-members_length"
  | "start_date"
  | "-start_date"
  | "end_date"
  | "-end_date";

/** 项目列表表格里可以开关的列；项目名称与操作列固定，不在此列 */
export type TProjectDisplayPropertyKey =
  | "code"
  | "project_type"
  | "business_category"
  | "status"
  | "business_unit"
  | "dev_mode"
  | "lead"
  | "product_manager"
  | "start_date"
  | "end_date"
  | "duration"
  | "created_at"
  | "members_count";

export type TProjectDisplayProperties = Record<TProjectDisplayPropertyKey, boolean>;

export type TProjectDisplayFilters = {
  my_projects?: boolean;
  archived_projects?: boolean;
  show_archived_projects?: boolean;
  order_by?: TProjectOrderByOptions;
  display_properties?: Partial<TProjectDisplayProperties>;
};

/** 项目列表富筛选可用的属性；值的匹配规则见 apps/web `project/filters/` */
export type TProjectFilterProperty =
  | "status"
  | "project_type"
  | "business_unit"
  | "business_category"
  | "dev_mode"
  | "lead"
  | "product_manager"
  | "members"
  | "network"
  | "start_date"
  | "end_date"
  | "created_at";
