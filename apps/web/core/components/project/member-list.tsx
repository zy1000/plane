/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { MemberFilterSelect } from "@/components/project/settings/members/filter-select";
import { buildGroupOptions } from "@/components/project/settings/members/helpers";
import { ProjectMemberAccessModal } from "@/components/project/settings/members/member-access-modal";
import { ProjectMembersTable } from "@/components/project/settings/members/project-members-table";
import type { TProjectMemberRow } from "@/components/project/settings/members/use-project-members-table";
import { useProjectMembersTable } from "@/components/project/settings/members/use-project-members-table";
import { errorMessage } from "@/components/project/settings/permission-groups/shared";
// hooks
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// local imports
import { ConfirmProjectMemberRemove } from "./confirm-project-member-remove";
import { SendProjectInvitationModal } from "./send-project-invitation-modal";

type TProjectMemberListProps = {
  projectId: string;
  workspaceSlug: string;
  canManage: boolean;
  /** 「添加成员」按钮在页头，弹窗开关由页面传进来 */
  isAddModalOpen: boolean;
  onAddModalClose: () => void;
};

/** 项目设置「成员」：搜索 + 角色 / 权限组筛选 + 成员表（效果图「项目成员」） */
export const ProjectMemberList = observer(function ProjectMemberList(props: TProjectMemberListProps) {
  const { projectId, workspaceSlug, canManage, isAddModalOpen, onAddModalClose } = props;
  const router = useAppRouter();
  const [editingRow, setEditingRow] = useState<TProjectMemberRow | null>(null);
  const [removingRow, setRemovingRow] = useState<TProjectMemberRow | null>(null);

  const { data: currentUser } = useUser();
  const { leaveProject } = useUserPermissions();
  const { getProjectById } = useProject();
  const {
    project: { removeMemberFromProject, updateMemberAccess },
  } = useMember();
  const { roles: groups, fetchRoles } = useProjectRoles(workspaceSlug, projectId);
  const { jobRoles, jobRoleMap, isColored } = useJobRoles(workspaceSlug);
  const table = useProjectMembersTable(projectId);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const project = getProjectById(projectId);
  const projectLeadId =
    typeof project?.project_lead === "string" ? project.project_lead : (project?.project_lead?.id ?? null);
  const groupFilterOptions = useMemo(
    () => buildGroupOptions(groups).map((option) => ({ id: option.id, label: option.label })),
    [groups]
  );

  const handleRemove = async (row: TProjectMemberRow) => {
    const isSelf = row.user.id === currentUser?.id;
    try {
      if (isSelf) {
        await leaveProject(workspaceSlug, projectId);
        router.push(`/${workspaceSlug}/projects`);
      } else {
        await removeMemberFromProject(workspaceSlug, projectId, row.user.id);
        void fetchRoles();
      }
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: isSelf ? "退出失败" : "移出失败",
        message: errorMessage(error, "请稍后重试"),
      });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 w-64 items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-3">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            value={table.query}
            onChange={(event) => table.setQuery(event.target.value)}
            placeholder="搜索成员"
            className="min-w-0 flex-1 border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
          />
        </div>
        <MemberFilterSelect
          label="角色"
          options={jobRoles.map((role) => ({ id: role.id, label: role.label }))}
          value={table.jobRoleFilter}
          onChange={table.setJobRoleFilter}
        />
        <MemberFilterSelect
          label="权限组"
          options={groupFilterOptions}
          value={table.groupFilter}
          onChange={table.setGroupFilter}
        />
        <span className="ml-auto text-13 text-tertiary tabular-nums">{table.filteredRows.length} 人</span>
      </div>

      <div className="mt-3">
        <ProjectMembersTable
          rows={table.filteredRows}
          isLoading={table.isLoading}
          groups={groups}
          jobRoleMap={jobRoleMap}
          isJobRoleColored={isColored}
          currentUserId={currentUser?.id}
          projectLeadId={projectLeadId}
          canManage={canManage}
          onEdit={setEditingRow}
          onRemove={setRemovingRow}
        />
      </div>

      <SendProjectInvitationModal
        isOpen={isAddModalOpen}
        onClose={onAddModalClose}
        onSuccess={() => void fetchRoles()}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      />

      <ProjectMemberAccessModal
        row={editingRow}
        groups={groups}
        jobRoles={jobRoles}
        onClose={() => setEditingRow(null)}
        onSubmit={async (row, data) => {
          await updateMemberAccess(workspaceSlug, projectId, row.user.id, data);
          void fetchRoles();
        }}
      />

      {removingRow && (
        <ConfirmProjectMemberRemove
          isOpen
          onClose={() => setRemovingRow(null)}
          data={{ id: removingRow.user.id, display_name: removingRow.user.display_name || "" }}
          onSubmit={() => handleRemove(removingRow)}
        />
      )}
    </>
  );
});
