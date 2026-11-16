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
 * 三类都能绑角色（job_role）：挂着这个角色的人自动拥有这个组的权限，实时计算、不落成员行；反过来进了组不会得到角色。
 * 工作区权限组 / 数据权限看工作区成员的角色，项目标准权限组与项目自定义组看成员在项目里的角色。
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
  /** 组内人数 = 直接添加 ∪ 经角色（模板恒为 0） */
  member_count: number;
  /** 前 3 个成员的用户 id（列表叠放头像），直接添加的在前 */
  member_preview_ids?: string[];
  /** 绑定的角色 id，按绑定时间 */
  job_role_ids?: string[];
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

/** 权限组详情「角色」页签的一行：组绑定的一个角色 */
export type TPermissionGroupJobRole = {
  /** 角色 id（数据字典 job_role 的值） */
  id: string;
  label: string;
  color: string;
  /**
   * 挂着这个角色、因此算在组里的人数。工作区权限组 / 数据权限：工作区成员；项目里的组：本项目成员；
   * 工作区设置里看项目标准权限组：各引用项目的项目成员（按人去重）。
   */
  member_count: number;
  member_preview_ids: string[];
  /** 仅工作区设置里的项目标准权限组：这些人分布在几个项目 */
  project_count: number | null;
  /** 绑定时间与绑定人 */
  created_at: string;
  created_by_id: string | null;
};

/** roles/<id>/job-roles/ 的响应；项目里的接口多一个 is_editable（标准权限组的角色跟模板走，项目里只读） */
export type TPermissionGroupJobRoles = {
  job_roles: TPermissionGroupJobRole[];
  is_editable?: boolean;
};

/** 组里的一个人：直接添加的，或经角色算进来的（两者可同时成立） */
export type TPermissionGroupMember = {
  /** 用户 id */
  id: string;
  is_direct: boolean;
  /** 他挂着的、且组绑定了的角色 */
  job_role_ids: string[];
};

/** roles/<id>/members/ 的响应：members = 直接添加 ∪ 经角色；member_ids 只有直接添加的（添加成员弹窗用它排除已添加的） */
export type TPermissionGroupMembers = {
  member_ids: string[];
  members: TPermissionGroupMember[];
};

/** roles/<id>/projects/：模板的引用项目 = 工作区全部项目（带已排除标记） */
export type TPermissionGroupTemplateProjects = {
  projects: TTemplateProjectRef[];
};
