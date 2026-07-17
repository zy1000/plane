/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import {
  LOGIN_MEDIUM_LABELS,
  WORKSPACE_MEMBER_EDIT_PERMISSION_KEY,
  WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY,
  WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY,
  WORKSPACE_ROLE_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { renderFormattedDate } from "@plane/utils";
import { MemberHeaderColumn } from "@/components/project/member-header-column";
import type { RowData } from "@/components/workspace/settings/member-columns";
import { AccountTypeColumn, CustomRolesColumn, NameColumn } from "@/components/workspace/settings/member-columns";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import type { IMemberFilters } from "@/store/member/utils";

export const useMemberColumns = () => {
  // states
  const [removeMemberModal, setRemoveMemberModal] = useState<RowData | null>(null);

  const { workspaceSlug } = useParams();

  const { data: currentUser } = useUser();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const {
    workspace: {
      filtersStore: { filters, updateFilters },
    },
  } = useMember();
  const { t } = useTranslation();

  // derived values
  const canEditMember = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_EDIT_PERMISSION_KEY], workspaceSlug);
  const canRemoveMember = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY], workspaceSlug);
  const canLeaveWorkspace = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY], workspaceSlug);
  const canViewRoles = allowWorkspacePermissionKeys([WORKSPACE_ROLE_VIEW_PERMISSION_KEY], workspaceSlug);
  const { roles, isLoading: isRolesLoading, fetchRoles } = useWorkspaceRoles(workspaceSlug, "workspace");
  useSWR(
    (canViewRoles || canEditMember) && workspaceSlug ? `WORKSPACE_MEMBER_ASSIGNABLE_ROLES_${workspaceSlug}` : null,
    fetchRoles
  );

  const isSuspended = (rowData: RowData) => rowData.is_active === false;

  // handlers
  const handleDisplayFilterUpdate = (filterUpdates: Partial<IMemberFilters>) => {
    updateFilters(filterUpdates);
  };

  const columns = [
    {
      key: "Full name",
      content: t("workspace_settings.settings.members.details.full_name"),
      thClassName: "text-left",
      thRender: () => (
        <MemberHeaderColumn
          property="full_name"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => (
        <NameColumn
          rowData={rowData}
          workspaceSlug={workspaceSlug}
          canRemoveMember={canRemoveMember}
          canLeaveWorkspace={canLeaveWorkspace}
          currentUser={currentUser}
          setRemoveMemberModal={setRemoveMemberModal}
        />
      ),
    },

    {
      key: "Display name",
      content: t("workspace_settings.settings.members.details.display_name"),
      tdRender: (rowData: RowData) => (
        <div className={`w-32 ${isSuspended(rowData) ? "text-placeholder" : ""}`}>{rowData.member.display_name}</div>
      ),
      thRender: () => (
        <MemberHeaderColumn
          property="display_name"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },

    {
      key: "Email address",
      content: t("workspace_settings.settings.members.details.email_address"),
      tdRender: (rowData: RowData) => (
        <div className={`w-48 truncate ${isSuspended(rowData) ? "text-placeholder" : ""}`}>{rowData.member.email}</div>
      ),
      thRender: () => (
        <MemberHeaderColumn
          property="email"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },

    {
      key: "Account type",
      content: t("workspace_settings.settings.members.details.account_type"),
      thRender: () => (
        <MemberHeaderColumn
          property="role"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => (
        <AccountTypeColumn rowData={rowData} workspaceSlug={workspaceSlug} canEditMember={canEditMember} />
      ),
    },

    {
      key: "Custom roles",
      content: "自定义角色",
      tdRender: (rowData: RowData) => (
        <CustomRolesColumn
          rowData={rowData}
          workspaceSlug={workspaceSlug}
          roles={roles}
          isLoading={isRolesLoading}
          canEditMember={canEditMember}
        />
      ),
    },

    {
      key: "Authentication",
      content: t("workspace_settings.settings.members.details.authentication"),
      tdRender: (rowData: RowData) => {
        if (isSuspended(rowData)) return null;
        const loginMedium = rowData.member.last_login_medium;
        if (!loginMedium) return null;
        return <div>{LOGIN_MEDIUM_LABELS[loginMedium]}</div>;
      },
    },

    {
      key: "Joining date",
      content: t("workspace_settings.settings.members.details.joining_date"),
      tdRender: (rowData: RowData) =>
        isSuspended(rowData) ? null : <div>{renderFormattedDate(rowData?.member?.joining_date)}</div>,
      thRender: () => (
        <MemberHeaderColumn
          property="joining_date"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },
  ];
  return { columns, workspaceSlug, removeMemberModal, setRemoveMemberModal };
};
