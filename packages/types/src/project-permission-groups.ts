/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TPermissionGroupContent, TPermissionGroupTypeOption } from "./permission-group";

/**
 * 项目设置 › 权限组（后端 plane/app/views/project/role.py、utils/permission_groups.py），
 * 以及研发矩阵（项目 × 产品 × 角色 → 成员）。权限内容 / 类型选项与工作区组共用 permission-group.ts 的类型。
 * 「角色」是另一回事：数据字典 job_role 的值，只用来找人，与权限无关。
 */

/** 项目权限组列表一行的来源：引用了本项目的工作区模板组（白名单命中且未排除，只读、可删除引用）/ 本项目自己的组 */
export type TProjectPermissionGroupSource = "template" | "project";

export type TProjectPermissionGroup = {
  /** 本项目权限组 id；模板在本项目还没人用时是模板 id */
  id: string;
  project_role_id: string | null;
  template_id: string | null;
  name: string;
  description: string;
  source: TProjectPermissionGroupSource;
  member_count: number;
  /** 前 3 个成员的用户 id（列表叠放头像） */
  member_preview_ids?: string[];
  updated_at: string | null;
  permission_count: number;
};

/** 白名单含本项目、带项目权限的工作区权限组，以及本项目里谁在组里（这部分权限对组内成员在本项目生效；直通的人不算） */
export type TProjectInheritedGroup = {
  id: string;
  name: string;
  project_permission_count: number;
  members: { id: string; display_name: string }[];
};

export type TProjectPermissionGroupList = {
  groups: TProjectPermissionGroup[];
  inherited_groups: TProjectInheritedGroup[];
};

export type TProjectPermissionGroupDetail = TPermissionGroupContent & {
  group: TProjectPermissionGroup;
  /** 引用模板的组只读 */
  is_editable: boolean;
  type_options: TPermissionGroupTypeOption[];
};

/** 角色（数据字典 job_role 的值） */
export type TJobRoleOption = {
  id: string;
  label: string;
  color: string;
};

/** 研发矩阵的一格：这个项目里，这个产品的这个角色由谁负责 */
export type TProductTeamCell = {
  product_id: string;
  job_role_id: string;
  member_ids: string[];
};

/** 项目设置「研发产品」：关联产品为行、角色为列 */
export type TProjectProductTeamMatrix = {
  products: { id: string; name: string; identifier: string; code: string }[];
  job_roles: TJobRoleOption[];
  /** 本项目用得上的角色（有成员挂着或矩阵里已填），默认只展示这些列 */
  used_job_role_ids: string[];
  cells: TProductTeamCell[];
};

/** 产品设置「研发团队」：按关联项目分组的矩阵行（只读） */
export type TProductTeam = {
  job_roles: TJobRoleOption[];
  projects: {
    id: string;
    name: string;
    identifier: string;
    cells: { job_role_id: string; member_ids: string[] }[];
  }[];
};

/** 添加项目成员：权限组（可给模板 id）+ 角色；不传 job_role_ids 时后端默认带上他在工作区的角色 */
export type TProjectMemberAddPayload = {
  members: { member_id: string; role_ids?: string[]; job_role_ids?: string[] }[];
};
