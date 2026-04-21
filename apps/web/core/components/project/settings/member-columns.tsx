/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { CircleMinus } from "lucide-react";
import { Disclosure } from "@headlessui/react";
// plane imports
import { MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import type { EUserProjectRoles, IProjectRole, IUser, IWorkspaceMember } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// local imports
import { ProjectRoleMultiSelect } from "./project-role-multi-select";

export interface RowData {
  id: string;
  member: IWorkspaceMember;
  original_role: EUserProjectRoles | null;
  custom_role_ids?: string[];
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  isAdmin: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
};

type AccountTypeProps = {
  rowData: RowData;
  canBindProjectRole: boolean;
  workspaceSlug: string;
  projectId: string;
  roles: IProjectRole[];
  isRolesLoading: boolean;
};

export function NameColumn(props: NameProps) {
  const { rowData, workspaceSlug, isAdmin, currentUser, setRemoveMemberModal } = props;
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;

  return (
    <Disclosure>
      {({}) => (
        <div className="group relative">
          <div className="flex w-72 items-center gap-2">
            <div className="flex flex-1 items-center gap-x-2 gap-y-2">
              {avatar_url && avatar_url.trim() !== "" ? (
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
                  <span className="relative flex size-6 items-center justify-center rounded-full bg-layer-3 text-11 text-on-color capitalize">
                    {(email ?? display_name ?? "?")[0]}
                  </span>
                </Link>
              )}
              {first_name} {last_name}
            </div>
            {(isAdmin || id === currentUser?.id) && (
              <CustomMenu
                ellipsis
                buttonClassName="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                optionsClassName="p-1.5"
                placement="bottom-end"
              >
                <CustomMenu.MenuItem>
                  <div
                    className="flex cursor-pointer items-center gap-x-1 font-medium text-danger-primary"
                    data-ph-element={MEMBER_TRACKER_ELEMENTS.PROJECT_MEMBER_TABLE_CONTEXT_MENU}
                    onClick={() => setRemoveMemberModal(rowData)}
                  >
                    <CircleMinus className="size-3.5 flex-shrink-0" />
                    {rowData.member?.id === currentUser?.id ? "Leave " : "Remove "}
                  </div>
                </CustomMenu.MenuItem>
              </CustomMenu>
            )}
          </div>
        </div>
      )}
    </Disclosure>
  );
}

export const AccountTypeColumn = observer(function AccountTypeColumn(props: AccountTypeProps) {
  const { rowData, projectId, workspaceSlug, canBindProjectRole, roles, isRolesLoading } = props;
  return (
    <ProjectRoleMultiSelect
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      memberId={rowData.member.id}
      selectedRoleIds={rowData.custom_role_ids ?? []}
      roles={roles}
      isLoading={isRolesLoading}
      disabled={!canBindProjectRole}
    />
  );
});
