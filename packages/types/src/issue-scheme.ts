/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 挂在项目上的只读工作项方案信息（`Project.issue_scheme_detail`）。
 *
 * 工作项方案 = 一套「类型 + 扩展字段 + 状态 + 工作流」。`is_project_owned` 为 false
 * 表示项目跟随研发模式（共用模式方案），项目设置里这三页只读；为 true 表示项目自定义。
 */
export type TIssueSchemeLite = {
  id: string;
  name: string;
  is_project_owned: boolean;
};

/** 研发模式摘要：类型库「用于」、类型库所属的模式列表 */
export type TIssueSchemeDevModeBrief = {
  id: string;
  name: string;
};

/**
 * 工作区的「工作项类型库」（`GET /api/workspaces/<slug>/issue-type-library/`）。
 *
 * 每个工作区只有一个，所有研发模式的 `issue_scheme` 都指向它；类型 / 状态 / 工作流 / 字段的增删改
 * 照旧走方案作用域接口（`/issue-schemes/<id>/...`）。
 */
export type TIssueTypeLibrary = {
  id: string;
  name: string;
  type_count: number;
  dev_modes: TIssueSchemeDevModeBrief[];
};

/** 模式关联行里的类型摘要 */
export type TDevModeIssueTypeBrief = {
  id: string;
  name: string;
  description?: string;
  logo_props?: {
    icon?: { name?: string; color?: string; background_color?: string };
    in_use?: string;
  };
  category_id?: number | string | null;
  category_name?: string | null;
  is_default?: boolean;
  system_key?: string | null;
};

/** 研发模式关联的一个类型库类型（`/dev-modes/<id>/issue-types/`，按 sort_order） */
export type TDevModeIssueType = {
  id: string;
  issue_type_id: string;
  sort_order: number;
  issue_type: TDevModeIssueTypeBrief;
  state_count: number;
  field_count: number;
  workflow_count: number;
  /** 跟随该模式的项目里这个类型的工作项数；大于 0 时不能取消关联 */
  issue_count: number;
};

/** 在模式里新建类型：建进类型库并追加关联到该模式 */
export type TCreateDevModeIssueTypePayload = {
  name: string;
  description?: string;
  logo_props?: TDevModeIssueTypeBrief["logo_props"];
  category_id: number | string | null;
};

/** 取消关联被拦（409 DEV_MODE_TYPE_IN_USE）时，各类型还在用的工作项数 */
export type TDevModeIssueTypeBlocked = {
  issue_type_id: string;
  name: string;
  issue_count: number;
};
