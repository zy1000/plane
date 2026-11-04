/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TDataScopeSummary, TTemplateProjectRef } from "./data-scope";
import type { IWorkspaceRole } from "./workspace";

/**
 * 权限组（docs/permission-refactor/data-permission-plan.md），后端 WorkspaceRole。
 * 一个组 = 工作区权限 + 项目权限 + 数据权限（白名单）+ 模板开关。
 * 没有系统组：所有组都可改名、改权限、删除、绑人；成员不默认属于任何组。
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

/** 列表接口 roles/ 的一行：组本身 + 统计 */
export interface IPermissionGroup extends IWorkspaceRole {
  /** 直绑人数 */
  member_count: number;
  permission_keys_count: number;
  workspace_permission_count: number;
  project_permission_count: number;
  data_scope_summary: TDataScopeSummary;
  /** 仅模板组：引用它的项目数（白名单命中 − 已排除） */
  referenced_project_count?: number;
}

/** roles/<id>/permissions/ 的响应 */
export interface IPermissionGroupDetail extends TPermissionGroupContent {
  role: IWorkspaceRole;
  is_editable: boolean;
  type_options: TPermissionGroupTypeOption[];
}

/** roles/<id>/projects/：模板组白名单命中的项目（带已排除标记） */
export type TPermissionGroupTemplateProjects = {
  projects: TTemplateProjectRef[];
};
