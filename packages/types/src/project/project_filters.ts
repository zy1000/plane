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
  | "actual_end_date"
  | "duration"
  | "created_at"
  | "members_count";

export type TProjectDisplayProperties = Record<TProjectDisplayPropertyKey, boolean>;

/**
 * 项目列表页头下方的快捷筛选页签（照禅道项目列表）：
 * all 全部 / open 未完成（状态不是终态，含未设置）/ overdue 已逾期 / no_status 未设置状态 / archived 已归档 /
 * `status:<字典值 id>` 某一个状态。富筛选条件叠在页签之上。
 */
export type TProjectQuickScope = "all" | "open" | "overdue" | "no_status" | "archived" | `status:${string}`;

export type TProjectDisplayFilters = {
  my_projects?: boolean;
  archived_projects?: boolean;
  show_archived_projects?: boolean;
  /** 快捷筛选页签；缺省当 "all" */
  quick_scope?: TProjectQuickScope;
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
