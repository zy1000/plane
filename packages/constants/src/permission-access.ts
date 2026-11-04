/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 不是权限 key 的「访问条件」。可以和 key 放在同一个数组里交给 store 的
 * allowWorkspacePermissionKeys / allowProjectPermissionKeys（任一满足即放行）：
 * - WORKSPACE_MEMBER_ACCESS：工作区活跃成员即可
 * - PROJECT_MEMBER_ACCESS：能进项目即可（成员、项目负责人等直通身份、白名单访客）
 * - WORKSPACE_OWNER_ACCESS：只有工作区 owner（实例管理员同样放行）
 *
 * 后端对应：@allow_workspace_member / @allow_project_member / @allow_workspace_owner。
 */
export const WORKSPACE_MEMBER_ACCESS = "@workspace_member" as const;
export const PROJECT_MEMBER_ACCESS = "@project_member" as const;
export const WORKSPACE_OWNER_ACCESS = "@workspace_owner" as const;

export type TPermissionAccess =
  | typeof WORKSPACE_MEMBER_ACCESS
  | typeof PROJECT_MEMBER_ACCESS
  | typeof WORKSPACE_OWNER_ACCESS;
