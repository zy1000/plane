/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDataScopeSummary, TTemplateProjectRef } from "./data-scope";
import type { IWorkspaceRole } from "./workspace";

/**
 * 权限组（docs/permission-refactor/split-plan.md），后端 WorkspaceRole，按 `kind` 分三类：
 * 工作区权限组（权限 + 成员）/ 项目权限模板（项目权限 + 引用项目，无成员）/ 数据权限（白名单 + 成员）。
 * 没有系统组：所有组都可改名、删除；成员不默认属于任何组。
 */

/** {权限 key: [不适用的工作项类型 id]}：只有工作项 / 缺陷的新建、编辑、删除能按类型限定 */
export type TPermissionGroupTypeLimits = Record<string, string[]>;

/** 权限组的权限内容（编辑器的值，也是 PATCH roles/<id>/permissions/ 的请求体） */
export type TPermissionGroupContent = {
  permission_keys: string[];
  type_limits: TPermissionGroupTypeLimits;
};

/** 类型限定弹层里的一个类型：工作区组取类型库，项目自定义组取项目方案（id 用库类型 id） */
export type TPermissionGroupTypeOption = {
  id: string;
  name: string;
  logo_props: Record<string, unknown> | null;
  /** 类别名为「缺陷」的类型归 project.defect，其余归 project.issue */
  module: "project.issue" | "project.defect";
  is_active: boolean;
};

/** 列表接口 roles/ 的一行：组本身 + 按类型给的统计 */
export interface IPermissionGroup extends IWorkspaceRole {
  /** 直绑人数（模板恒为 0） */
  member_count: number;
  /** 前 3 个直绑成员的用户 id（列表叠放头像） */
  member_preview_ids?: string[];
  permission_keys_count: number;
  workspace_permission_count: number;
  project_permission_count: number;
  /** 仅数据权限 */
  data_scope_summary?: TDataScopeSummary;
  /** 仅项目权限模板：引用它的项目数（全部项目 − 已排除） */
  referenced_project_count?: number;
}

/** roles/<id>/permissions/ 的响应 */
export interface IPermissionGroupDetail extends TPermissionGroupContent {
  role: IWorkspaceRole;
  is_editable: boolean;
  type_options: TPermissionGroupTypeOption[];
}

/** roles/<id>/projects/：模板的引用项目 = 工作区全部项目（带已排除标记） */
export type TPermissionGroupTemplateProjects = {
  projects: TTemplateProjectRef[];
};
