/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";

import { Disclosure } from "@headlessui/react";
// plane imports
import { EUserPermissions, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import { TrashIcon, SuspendedUserIcon } from "@plane/propel/icons";
import type { IUser, IWorkspaceGroup, IWorkspaceMember, IWorkspaceRole } from "@plane/types";
// plane ui
import { PopoverMenu } from "@plane/ui";
// helpers
import { SYSTEM_USER_AVATAR_FALLBACK_COLOR } from "@/helpers/user-avatar.helper";
import { getFileURL } from "@plane/utils";
import { WorkspaceRoleMultiSelect } from "./workspace-role-multi-select";
import { WorkspaceTeamMultiSelect } from "./workspace-team-multi-select";

export interface RowData {
  member: IWorkspaceMember;
  role: EUserPermissions;
  is_active: boolean;
  custom_role_ids: string[];
  group_role_ids: string[];
  group_ids: string[];
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  canRemoveMember: boolean;
  canLeaveWorkspace: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
};

type CustomRolesProps = {
  rowData: RowData;
  workspaceSlug: string;
  roles: IWorkspaceRole[];
  isLoading: boolean;
  canEditMember: boolean;
};

type TeamsProps = {
  rowData: RowData;
  workspaceSlug: string;
  groups: IWorkspaceGroup[];
  isLoading: boolean;
  canManageTeams: boolean;
};

export function NameColumn(props: NameProps) {
  const { rowData, workspaceSlug, canRemoveMember, canLeaveWorkspace, currentUser, setRemoveMemberModal } = props;
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;
  const isSuspended = rowData.is_active === false;
  const isCurrentUser = id === currentUser?.id;
  const canRemove = isCurrentUser ? canLeaveWorkspace : canRemoveMember;

  return (
    <Disclosure>
      {() => (
        <div className="group relative">
          <div className="flex w-72 items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-1 items-center gap-x-2 gap-y-2">
              {isSuspended ? (
                <div className="rounded-full bg-layer-1">
                  <SuspendedUserIcon className="size-6 text-placeholder" />
                </div>
              ) : avatar_url && avatar_url.trim() !== "" ? (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full text-on-color capitalize">
                    <img
                      src={getFileURL(avatar_url)}
                      className="absolute top-0 left-0 h-full w-full rounded-full object-cover"
                      alt={display_name || email}
                    />
                  </span>
                </Link>
              ) : (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span
                    className="relative flex size-6 items-center justify-center rounded-full text-11 text-on-color capitalize"
                    style={{ backgroundColor: SYSTEM_USER_AVATAR_FALLBACK_COLOR }}
                  >
                    {(email ?? display_name ?? "?")[0]}
                  </span>
                </Link>
              )}
              <span className={isSuspended ? "text-placeholder" : ""}>
                {first_name} {last_name}
              </span>
            </div>

            {!isSuspended && canRemove && (
              <PopoverMenu
                data={[""]}
                keyExtractor={(item) => item}
                popoverClassName="justify-end"
                buttonClassName="outline-none	origin-center rotate-90 size-8 aspect-square flex-shrink-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                render={() => (
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex cursor-pointer items-center gap-x-3"
                    onClick={() => setRemoveMemberModal(rowData)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRemoveMemberModal(rowData);
                      }
                    }}
                    data-ph-element={MEMBER_TRACKER_ELEMENTS.WORKSPACE_MEMBER_TABLE_CONTEXT_MENU}
                  >
                    <TrashIcon className="size-3.5 align-middle" /> {id === currentUser?.id ? "Leave " : "Remove "}
                  </div>
                )}
              />
            )}
          </div>
        </div>
      )}
    </Disclosure>
  );
}

export const CustomRolesColumn = observer(function CustomRolesColumn(props: CustomRolesProps) {
  const { rowData, workspaceSlug, roles, isLoading, canEditMember } = props;
  const isSuspended = rowData.is_active === false;

  if (isSuspended) return null;

  return (
    <WorkspaceRoleMultiSelect
      workspaceSlug={workspaceSlug}
      memberId={rowData.member.id}
      selectedRoleIds={rowData.custom_role_ids ?? []}
      roles={roles}
      isLoading={isLoading}
      disabled={!canEditMember}
    />
  );
});

export const TeamsColumn = observer(function TeamsColumn(props: TeamsProps) {
  const { rowData, workspaceSlug, groups, isLoading, canManageTeams } = props;
  const isSuspended = rowData.is_active === false;

  if (isSuspended) return null;

  return (
    <WorkspaceTeamMultiSelect
      workspaceSlug={workspaceSlug}
      memberId={rowData.member.id}
      selectedGroupIds={rowData.group_ids ?? []}
      groups={groups}
      isLoading={isLoading}
      disabled={!canManageTeams}
    />
  );
});
