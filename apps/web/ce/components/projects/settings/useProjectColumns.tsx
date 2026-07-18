/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
// plane imports
import type { EUserProjectRoles, IProjectRoleSource, IWorkspaceMember } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
// components
import { MemberHeaderColumn } from "@/components/project/member-header-column";
import { AccountTypeColumn, NameColumn } from "@/components/project/settings/member-columns";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import type { IMemberFilters } from "@/store/member/utils";

export interface RowData {
  id: string;
  member: IWorkspaceMember;
  original_role: EUserProjectRoles | null;
  custom_role_ids?: string[];
  inherited_role_ids?: string[];
  role_sources?: IProjectRoleSource[];
}

type TUseProjectColumnsProps = {
  projectId: string;
  workspaceSlug: string;
};

export const useProjectColumns = (props: TUseProjectColumnsProps) => {
  const { projectId, workspaceSlug } = props;
  // states
  const [removeMemberModal, setRemoveMemberModal] = useState<RowData | null>(null);

  // store hooks
  const { data: currentUser } = useUser();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const {
    project: {
      filters: { getFilters, updateFilters },
    },
  } = useMember();
  const { roles, isLoading: isRolesLoading, fetchRoles } = useProjectRoles(workspaceSlug, projectId);
  // derived values
  const canLeaveProject = allowProjectPermissionKeys(
    ["project.member.leave"],
    workspaceSlug.toString(),
    projectId.toString()
  );
  const canRemoveProjectMember = allowProjectPermissionKeys(
    ["project.member.remove"],
    workspaceSlug.toString(),
    projectId.toString()
  );
  const canBindProjectRole = allowProjectPermissionKeys(
    ["project.member.bind_role"],
    workspaceSlug.toString(),
    projectId.toString()
  );

  const displayFilters = getFilters(projectId);

  // handlers
  const handleDisplayFilterUpdate = (filters: Partial<IMemberFilters>) => {
    updateFilters(projectId, filters);
  };

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const columns = [
    {
      key: "Full Name",
      content: "Full name",
      thClassName: "text-left",
      thRender: () => (
        <MemberHeaderColumn
          property="full_name"
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => (
        <NameColumn
          rowData={rowData}
          workspaceSlug={workspaceSlug}
          canLeaveProject={canLeaveProject}
          canRemoveProjectMember={canRemoveProjectMember}
          currentUser={currentUser}
          setRemoveMemberModal={setRemoveMemberModal}
        />
      ),
    },
    {
      key: "Display Name",
      content: "Display name",
      thRender: () => (
        <MemberHeaderColumn
          property="display_name"
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => <div className="w-32">{rowData.member.display_name}</div>,
    },
    {
      key: "Email",
      content: "Email",
      thRender: () => (
        <MemberHeaderColumn
          property="email"
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => <div className="w-48 text-secondary">{rowData.member.email}</div>,
    },
    {
      key: "Account Type",
      content: "Account type",
      thRender: () => (
        <MemberHeaderColumn
          property="role"
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => (
        <AccountTypeColumn
          rowData={rowData}
          canBindProjectRole={canBindProjectRole}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
          roles={roles}
          isRolesLoading={isRolesLoading}
        />
      ),
    },
    {
      key: "Joining Date",
      content: "Joining date",
      thRender: () => (
        <MemberHeaderColumn
          property="joining_date"
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => <div>{renderFormattedDate(rowData?.member?.joining_date)}</div>,
    },
  ];
  return {
    columns,
    removeMemberModal,
    setRemoveMemberModal,
    displayFilters,
    handleDisplayFilterUpdate,
  };
};
