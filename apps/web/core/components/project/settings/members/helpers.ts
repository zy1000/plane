/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TJobRoleOption, TProjectPermissionGroup } from "@plane/types";
import type { TChipOption } from "@/components/permission-groups";

const SOURCE_HINT: Record<TProjectPermissionGroup["source"], string> = {
  template: "标准权限组",
  project: "本项目",
};

/** 可分配给成员的权限组（id 可能是模板 id，后端会自动建引用行） */
export const buildGroupOptions = (groups: TProjectPermissionGroup[]): TChipOption[] =>
  groups.map((group) => ({ id: group.id, label: group.name, hint: SOURCE_HINT[group.source] }));

export const buildJobRoleOptions = (jobRoles: TJobRoleOption[], countById?: Map<string, number>): TChipOption[] =>
  jobRoles.map((role) => ({
    id: role.id,
    label: role.label,
    hint: countById ? `${countById.get(role.id) ?? 0} 人` : undefined,
  }));
