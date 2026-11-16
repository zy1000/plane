/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** 工作区设置 › 角色：角色本身是数据字典 job_role 的值，这里多带设置页要的计数 */

/** 看得见的引用计数（删除拦截同一口径） */
export type TJobRoleUsage = {
  workspace_member_count: number;
  /** 按人去重 */
  project_member_count: number;
  project_count: number;
  /** 研发矩阵里填了这个角色的格子数 */
  matrix_count: number;
  /** 引用它的流转数（按流转去重） */
  transition_count: number;
  workflow_count: number;
  /** 绑了这个角色的权限组数 = 下面两项之和 */
  permission_group_count: number;
  /** 按工作区角色生效的：工作区权限组、数据权限组 */
  workspace_permission_group_count: number;
  /** 按项目内角色生效的：项目标准权限组、项目自定义权限组 */
  project_permission_group_count: number;
};

/** 角色详情「权限组」页签的一行：这个角色绑在哪个权限组上（挂这个角色的人自动拥有该组权限） */
export type TJobRolePermissionGroup = {
  id: string;
  name: string;
  /** project = 某个项目的自定义权限组，其余是工作区设置里的三类 */
  kind: "workspace" | "data" | "project_template" | "project";
  /** 仅项目自定义权限组 */
  project: { id: string; name: string; identifier: string } | null;
  workspace_permission_count: number;
  project_permission_count: number;
  /** 仅数据权限组：白名单当前命中的项目 / 产品数 */
  scope_project_count?: number;
  scope_product_count?: number;
  /** 仅项目标准权限组 */
  referenced_project_count?: number;
};

export type TJobRole = TJobRoleUsage & {
  id: string;
  label: string;
  /** 预设色 key 或 #rrggbb；空串 = 未指定（按灰显示） */
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by_id: string | null;
};

export type TJobRolePayload = { label?: string; color?: string };

export type TJobRoleProjectMembers = {
  project: { id: string; name: string; identifier: string; code: string };
  member_ids: string[];
};

export type TJobRoleReferenceDimension = "initiator" | "assignee" | "approver";

export type TJobRoleReference = {
  id: string;
  dimension: TJobRoleReferenceDimension;
  workflow: { id: string; name: string; is_active: boolean };
  issue_type_name: string;
  /** library = 工作项类型库（模板中心维护）；project = 项目自己的方案 */
  scope: { kind: "library" | "project"; project_id: string | null; name: string };
  from_state: { id: string; name: string; color: string };
  to_state: { id: string; name: string; color: string };
  approval_type: "any" | "all" | "n_of_m";
  required_count: number | null;
};

/** 按角色名字引用它的地方：改名后会对不上 */
export type TJobRoleLabelUsage = {
  review_templates: { initiator_role: number; leader_role: number; auditor_role: number };
  review_template_count: number;
  open_review_count: number;
};
