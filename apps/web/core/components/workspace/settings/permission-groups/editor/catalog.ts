/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PERMISSION_CATALOG } from "@plane/constants";
import type { TPermissionCatalogGroup, TPermissionCatalogModule, TPermissionScope } from "@plane/constants";

/**
 * 权限组编辑器读的目录：@plane/constants 的 PERMISSION_CATALOG（由后端 registry.py 生成）。
 * 分组 / 模块 / 动作的顺序和文案都以它为准，编辑器不写死任何 key。
 */

export const SCOPE_LABELS: Record<TPermissionScope, string> = {
  workspace: "工作区权限",
  project: "项目权限",
};

export const getScopeGroups = (scope: TPermissionScope): TPermissionCatalogGroup[] =>
  PERMISSION_CATALOG.groups.filter((group) => group.scope === scope);

export const getModuleKeys = (module: TPermissionCatalogModule): string[] => module.actions.map((action) => action.key);

export const getGroupKeys = (group: TPermissionCatalogGroup): string[] => group.modules.flatMap(getModuleKeys);

export const getScopeKeys = (scope: TPermissionScope): string[] => getScopeGroups(scope).flatMap(getGroupKeys);

/** 搜索：命中分组名时整组保留，否则只留模块名或动作名命中的模块 */
export const filterGroups = (groups: TPermissionCatalogGroup[], query: string): TPermissionCatalogGroup[] => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return groups;
  return groups
    .map((group) => {
      if (group.label.toLowerCase().includes(keyword)) return group;
      const modules = group.modules.filter(
        (module) =>
          module.label.toLowerCase().includes(keyword) ||
          module.actions.some((action) => action.label.toLowerCase().includes(keyword))
      );
      return { ...group, modules };
    })
    .filter((group) => group.modules.length > 0);
};

/** 「按动作勾选」下拉：按目录的动作顺序，只列可见模块里实际出现的动作 */
export const getActionsInGroups = (groups: TPermissionCatalogGroup[]) => {
  const present = new Set(groups.flatMap((group) => group.modules.flatMap((module) => module.actions.map((a) => a.action))));
  return PERMISSION_CATALOG.actions.filter((action) => present.has(action.action));
};

/** 某个动作在这些模块里对应的 key，例如「查看」→ 每个有查看的模块的 *.view */
export const getActionKeys = (groups: TPermissionCatalogGroup[], action: string): string[] =>
  groups.flatMap((group) =>
    group.modules.flatMap((module) => module.actions.filter((item) => item.action === action).map((item) => item.key))
  );

/** 类型限定弹层只列本模块的类型：project.defect 行列缺陷类型，project.issue 行列其余类型 */
export const TYPE_LIMIT_MODULE_LABELS: Record<string, string> = {
  "project.issue": "工作项",
  "project.defect": "缺陷",
};
