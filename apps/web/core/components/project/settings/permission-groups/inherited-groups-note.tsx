/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import type { TProjectInheritedGroup } from "@plane/types";
import { getPermissionGroupDetailPath } from "@/components/workspace/settings/permission-groups";

const MAX_NAMES = 5;

type Props = {
  workspaceSlug: string;
  groups: TProjectInheritedGroup[];
};

/**
 * 项目「权限组」页顶部：白名单含本项目、带项目权限的工作区权限组，以及本项目里有谁在组里。
 * 这些组的项目权限对组内成员在本项目同样生效（2026-11-03 用户看不懂继承才加的说明块）。
 */
export function InheritedGroupsNote({ workspaceSlug, groups }: Props) {
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-subtle bg-layer-1 px-5 py-3.5 text-13 text-tertiary">
        本项目没有成员通过工作区权限组获得项目权限
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-subtle bg-surface-1">
      <div className="flex h-11 items-center gap-2 border-b border-subtle bg-layer-1 px-5">
        <span className="text-14 font-medium text-primary">工作区权限组在本项目生效</span>
        <span className="text-13 text-tertiary tabular-nums">{groups.length}</span>
      </div>
      {groups.map((group) => {
        const names = group.members.map((member) => member.display_name);
        const shown = names.slice(0, MAX_NAMES).join("、");
        return (
          <div
            key={group.id}
            className="grid min-h-12 grid-cols-[200px_120px_minmax(0,1fr)] items-center gap-x-4 border-b border-subtle px-5 text-14 last:border-b-0"
          >
            <Link
              to={getPermissionGroupDetailPath(workspaceSlug, group.id)}
              className="truncate font-medium text-primary hover:text-accent-primary hover:underline"
              title={group.name}
            >
              {group.name}
            </Link>
            <span className="text-secondary tabular-nums">{group.project_permission_count} 项项目权限</span>
            <span className="truncate text-secondary" title={names.join("、")}>
              {names.length > MAX_NAMES ? `${shown} 等 ${names.length} 人` : shown}
            </span>
          </div>
        );
      })}
    </div>
  );
}
