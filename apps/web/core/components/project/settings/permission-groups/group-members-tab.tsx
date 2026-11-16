/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import type { TPermissionGroupMember } from "@plane/types";
import { PermissionGroupMembersTable } from "@/components/workspace/settings/permission-groups";

type Props = {
  workspaceSlug: string;
  /** 直接分配 ∪ 经角色；null = 还在加载 */
  members: TPermissionGroupMember[] | null;
  /** 项目成员设置页地址：给成员加减权限组、设角色都在那里做 */
  membersPath: string;
};

/**
 * 项目权限组详情的「成员」页签：只读列表，「授权来源」标明是直接分配的，还是挂着组所绑的角色；
 * 加减人、设角色在项目「成员」页
 */
export function PermissionGroupMembersTab({ workspaceSlug, members, membersPath }: Props) {
  return (
    <PermissionGroupMembersTable
      workspaceSlug={workspaceSlug}
      members={members}
      directLabel="直接分配"
      action={
        <Link to={membersPath} className="text-14 font-medium text-accent-primary hover:underline">
          到成员页调整
        </Link>
      }
    />
  );
}
