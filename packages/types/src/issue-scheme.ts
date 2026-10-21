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
