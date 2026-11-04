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

/** 列表上方的说明：白名单含本项目、带项目权限的工作区权限组，以及本项目里在组里的人 */
export function InheritedGroupsNote({ workspaceSlug, groups }: Props) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-subtle bg-layer-1 px-4 py-3 text-13 text-tertiary">
        本项目没有成员通过工作区权限组获得项目权限
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 px-4 py-3">
      <p className="text-13 text-secondary">
        以下工作区权限组的白名单包含本项目，它们的项目权限对组内成员在本项目生效：
      </p>
      {groups.map((group) => {
        const names = group.members.map((member) => member.display_name);
        const shown = names.slice(0, MAX_NAMES).join("、");
        return (
          <div key={group.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-13">
            <Link
              to={getPermissionGroupDetailPath(workspaceSlug, group.id)}
              className="w-32 shrink-0 truncate font-medium text-accent-primary hover:underline"
              title={group.name}
            >
              {group.name}
            </Link>
            <span className="w-28 shrink-0 text-secondary tabular-nums">
              {group.project_permission_count} 项项目权限
            </span>
            <span className="min-w-0 flex-1 truncate text-secondary" title={names.join("、")}>
              {names.length > MAX_NAMES ? `${shown} 等 ${names.length} 人` : shown}
            </span>
          </div>
        );
      })}
    </div>
  );
}
