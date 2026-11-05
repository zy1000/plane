/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import {
  WORKSPACE_MEMBER_EDIT_PERMISSION_KEY,
  WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY,
  WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { renderFormattedDate } from "@plane/utils";
import { MemberHeaderColumn } from "@/components/project/member-header-column";
import type { RowData } from "@/components/workspace/settings/member-columns";
import {
  MemberActionsColumn,
  NetworkZoneColumn,
  PermissionGroupsColumn,
} from "@/components/workspace/settings/member-columns";
import { PERMISSION_GROUP_KIND_LABELS } from "@/components/workspace/settings/permission-group-kind";
import { JobRoleTags } from "@/components/workspace/settings/permission-groups/job-role-tags";
import { MemberIdentityCell } from "@/components/workspace/settings/permission-groups/member-identity-cell";
import { useInstance } from "@/hooks/store/use-instance";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import type { IMemberFilters } from "@/store/member/utils";

/**
 * 工作区成员表的列（效果图「工作区成员」）：成员 / 工号 / 部门 / 角色 / 工作区权限组 / 数据权限 / [大小网] / 加入时间 / 操作。
 * 列宽合计约 1170px：1536 宽窗口的内容区刚好放下（见 members-virtual-table.tsx）；
 * 权限组拆成两列后，成员 / 工号 / 部门 / 角色 / 加入时间各收了一点来凑这个预算。
 */
export const useMemberColumns = () => {
  // states
  const [removeMemberModal, setRemoveMemberModal] = useState<RowData | null>(null);
  const [editingMember, setEditingMember] = useState<RowData | null>(null);

  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";

  const { data: currentUser } = useUser();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const {
    workspace: {
      filtersStore: { filters, updateFilters },
    },
  } = useMember();
  const { t } = useTranslation();
  const { config } = useInstance();

  // derived values
  const canEditMember = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_EDIT_PERMISSION_KEY], slug);
  const canRemoveMember = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY], slug);
  const canLeaveWorkspace = allowWorkspacePermissionKeys([WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY], slug);
  const ownerId = currentWorkspace?.owner?.id;

  const { roles, fetchRoles } = useWorkspaceRoles(slug);
  useSWR(slug ? `WORKSPACE_PERMISSION_GROUPS_${slug}` : null, fetchRoles, { revalidateOnFocus: false });
  const { jobRoles, jobRoleMap, isColored } = useJobRoles(slug);

  const groupMap = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);

  const isSuspended = (rowData: RowData) => rowData.is_active === false;

  // handlers
  const handleDisplayFilterUpdate = (filterUpdates: Partial<IMemberFilters>) => {
    updateFilters(filterUpdates);
  };

  const columns = [
    {
      key: "Member",
      content: "成员",
      width: 220,
      thRender: () => (
        <MemberHeaderColumn
          property="full_name"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
      tdRender: (rowData: RowData) => <MemberIdentityCell user={rowData.member} muted={isSuspended(rowData)} />,
    },
    {
      key: "Employee id",
      content: "工号",
      width: 80,
      tdRender: (rowData: RowData) => (
        <div className={`truncate tabular-nums ${isSuspended(rowData) ? "text-placeholder" : ""}`}>
          {rowData.member.employee_id || "—"}
        </div>
      ),
    },
    {
      key: "Department",
      content: "部门",
      width: 140,
      tdRender: (rowData: RowData) => (
        <div
          className={`truncate ${isSuspended(rowData) ? "text-placeholder" : ""}`}
          title={rowData.member.department ?? ""}
        >
          {rowData.member.department || "—"}
        </div>
      ),
    },
    {
      key: "Job roles",
      content: "角色",
      width: 170,
      tdRender: (rowData: RowData) => (
        <JobRoleTags jobRoleIds={rowData.job_role_ids} jobRoleMap={jobRoleMap} isColored={isColored} />
      ),
    },
    {
      key: "Workspace permission groups",
      content: PERMISSION_GROUP_KIND_LABELS.workspace,
      width: 160,
      tdRender: (rowData: RowData) => <PermissionGroupsColumn rowData={rowData} groupMap={groupMap} kind="workspace" />,
    },
    {
      key: "Data permission groups",
      content: PERMISSION_GROUP_KIND_LABELS.data,
      width: 130,
      tdRender: (rowData: RowData) => <PermissionGroupsColumn rowData={rowData} groupMap={groupMap} kind="data" />,
    },

    // 大网 / 小网归属：隔离开关开着、且能编辑成员才有这一列（后端只给管理员视图返回归属）
    ...(config?.network_zone_enabled && canEditMember
      ? [
          {
            key: "Network zone",
            content: t("network_zone.label"),
            width: 76,
            tdRender: (rowData: RowData) => (
              <NetworkZoneColumn rowData={rowData} workspaceSlug={slug} canEditMember={canEditMember} />
            ),
          },
        ]
      : []),

    {
      key: "Joining date",
      content: "加入时间",
      width: 100,
      tdRender: (rowData: RowData) =>
        isSuspended(rowData) ? null : (
          <div className="truncate tabular-nums">{renderFormattedDate(rowData?.member?.joining_date)}</div>
        ),
      thRender: () => (
        <MemberHeaderColumn
          property="joining_date"
          displayFilters={filters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        />
      ),
    },
    {
      key: "Actions",
      content: "操作",
      width: 96,
      thRender: () => <span className="block text-right">操作</span>,
      tdRender: (rowData: RowData) => (
        <MemberActionsColumn
          rowData={rowData}
          isCurrentUser={rowData.member.id === currentUser?.id}
          isOwner={Boolean(ownerId && rowData.member.id === ownerId)}
          canEditMember={canEditMember}
          canRemoveMember={canRemoveMember}
          canLeaveWorkspace={canLeaveWorkspace}
          onEdit={setEditingMember}
          onRemove={setRemoveMemberModal}
        />
      ),
    },
  ];

  return {
    columns,
    workspaceSlug: slug,
    removeMemberModal,
    setRemoveMemberModal,
    editingMember,
    setEditingMember,
    jobRoles,
    groups: roles,
    groupMap,
  };
};
