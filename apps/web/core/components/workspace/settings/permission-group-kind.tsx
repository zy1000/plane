/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWorkspaceRole, TPermissionGroupKind } from "@plane/types";

/**
 * 「给人 / 团队选权限组」的入口（成员弹窗、成员表、邀请、团队）共用的 kind 小工具。
 * 三类文案和类型标签以权限组页面的定义为准，这里只转一手。
 */
export { PERMISSION_GROUP_KIND_LABELS } from "./permission-groups/helpers";
export { PermissionGroupKindTag } from "./permission-groups/ui";

/** 能绑给人 / 团队的两类；项目权限模板没有成员，人在项目里绑 */
export type TAssignablePermissionGroupKind = Exclude<TPermissionGroupKind, "project_template">;

export const isAssignablePermissionGroup = <T extends Pick<IWorkspaceRole, "kind">>(
  role: T
): role is T & { kind: TAssignablePermissionGroupKind } => role.kind !== "project_template";

/** 按可绑定的两类分组（模板直接丢掉），顺序固定：工作区权限组在前、数据权限在后 */
export const splitAssignablePermissionGroups = <T extends Pick<IWorkspaceRole, "kind">>(roles: T[]) => ({
  workspace: roles.filter((role) => role.kind === "workspace"),
  data: roles.filter((role) => role.kind === "data"),
});

/** 成员表里的组 chip 底色：工作区权限组沿用品牌色，数据权限用 indigo 那套标签色 */
export const PERMISSION_GROUP_KIND_CHIP_CLASS: Record<TAssignablePermissionGroupKind, string> = {
  workspace: "border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
  data: "border-label-indigo-border/30 bg-label-indigo-bg text-label-indigo-text",
};
