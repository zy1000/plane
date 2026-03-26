/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IWorkspaceGroup, IWorkspaceGroupMember, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { GroupMembersRolesManager } from "./group-members-roles-manager";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type Props = {
  group: IWorkspaceGroup;
  members: IWorkspaceGroupMember[];
  roles: IWorkspaceGroupRole[];
  isDetailLoading: boolean;
  availableRoles: IWorkspaceRole[];
  memberOptions: TMemberOption[];
  isAdmin: boolean;
  onUpdate: (groupId: string, data: { name: string; description: string }) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
  onAddMember: (groupId: string, memberId: string) => Promise<void>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
  onAddRole: (groupId: string, roleId: string) => Promise<void>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
};

export function GroupDetailPanel(props: Props) {
  return <GroupMembersRolesManager {...props} variant="standalone" />;
}
