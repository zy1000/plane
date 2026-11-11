/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRole } from "@plane/types";
import { AlertModalCore, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddMemberModal } from "@/components/workspace/settings/groups/add-member-modal";
import { JobRoleTags } from "@/components/workspace/settings/permission-groups/job-role-tags";
import {
  MemberIdentityCell,
  getMemberDisplayName,
} from "@/components/workspace/settings/permission-groups/member-identity-cell";
import { PermissionGroupPager, PermissionGroupSearch } from "@/components/workspace/settings/permission-groups/ui";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { getJobRoleErrorMessage } from "@/hooks/store/use-workspace-job-roles";

type Props = {
  workspaceSlug: string;
  role: TJobRole;
  /** 挂了这个角色的工作区成员（user id），由详情页从成员表算出 */
  holderIds: string[];
  canManageMembers: boolean;
  onAdd: (userIds: string[]) => Promise<string[]>;
  onRemove: (userId: string) => Promise<void>;
};

type TUserExtra = { employee_id?: string | null; department?: string | null };

const GRID = "grid grid-cols-[minmax(220px,1.6fr)_110px_minmax(120px,1.2fr)_minmax(160px,1.3fr)_64px] items-center gap-x-4 px-5";
const PAGE_SIZE = 20;
const ALL_DEPARTMENTS = "__all__";

/** 角色详情「工作区成员」页签：工作区成员页里挂了这个角色的人，可在这里直接添加 / 移除 */
export const JobRoleWorkspaceMembers = observer(function JobRoleWorkspaceMembers(props: Props) {
  const { workspaceSlug, role, holderIds, canManageMembers, onAdd, onRemove } = props;
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, workspaceMemberMap },
  } = useMember();
  const { jobRoleMap, isColored } = useJobRoles(workspaceSlug);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS);
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const departments = useMemo(
    () =>
      [
        ...new Set(
          holderIds.map((userId) => (getUserDetails(userId) as TUserExtra | undefined)?.department).filter(Boolean)
        ),
      ].sort() as string[],
    [holderIds, getUserDetails]
  );

  const memberOptions = useMemo(
    () =>
      getWorkspaceMemberIds(workspaceSlug)
        .filter((userId) => workspaceMemberMap?.[workspaceSlug]?.[userId]?.is_active !== false)
        .map((userId) => {
          const user = getUserDetails(userId);
          if (!user) return null;
          return {
            id: userId,
            memberId: userId,
            displayName: getMemberDisplayName(user),
            avatarUrl: user.avatar_url,
            email: user.email,
          };
        })
        .filter((option): option is NonNullable<typeof option> => option !== null),
    [getWorkspaceMemberIds, getUserDetails, workspaceMemberMap, workspaceSlug]
  );

  const keyword = query.trim().toLowerCase();
  const rows = holderIds
    .map((userId) => ({ userId, user: getUserDetails(userId) }))
    .filter(({ user }) => {
      const extra = user as TUserExtra | undefined;
      if (department !== ALL_DEPARTMENTS && extra?.department !== department) return false;
      if (!keyword) return true;
      return `${getMemberDisplayName(user)} ${user?.email ?? ""} ${extra?.employee_id ?? ""}`
        .toLowerCase()
        .includes(keyword);
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoving(true);
    try {
      await onRemove(pendingRemove);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除" });
      setPendingRemove(null);
    } catch (removeError) {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: getJobRoleErrorMessage(removeError, "请稍后重试") });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PermissionGroupSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="搜索姓名、邮箱、工号"
            className="w-72"
          />
          <CustomSelect
            value={department}
            onChange={(value: string) => {
              setDepartment(value);
              setPage(1);
            }}
            label={
              <span className={department === ALL_DEPARTMENTS ? "text-secondary" : "text-primary"}>
                {department === ALL_DEPARTMENTS ? "部门" : department}
              </span>
            }
            buttonClassName="h-9 rounded-lg border border-subtle bg-surface-1 px-3 text-14"
            optionsClassName="min-w-48 text-13"
            maxHeight="md"
          >
            <CustomSelect.Option value={ALL_DEPARTMENTS}>全部部门</CustomSelect.Option>
            {departments.map((name) => (
              <CustomSelect.Option key={name} value={name}>
                {name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
        {canManageMembers && (
          <Button variant="secondary" size="xl" className="h-9 px-4" onClick={() => setIsAddOpen(true)}>
            添加成员
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[760px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>成员</span>
            <span>工号</span>
            <span>部门</span>
            <span>其他角色</span>
            <span className="flex justify-end">操作</span>
          </div>
          {pageRows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">
              {keyword || department !== ALL_DEPARTMENTS ? "没有匹配的成员" : "暂无成员"}
            </p>
          ) : (
            pageRows.map(({ userId, user }) => {
              const extra = user as TUserExtra | undefined;
              const otherRoleIds = (workspaceMemberMap?.[workspaceSlug]?.[userId]?.job_role_ids ?? []).filter(
                (id) => id !== role.id
              );
              return (
                <div key={userId} className={cn(GRID, "min-h-16 border-b border-subtle py-2 text-14 last:border-b-0")}>
                  <MemberIdentityCell user={user} size="lg" />
                  <span className="truncate text-secondary tabular-nums">{extra?.employee_id || "—"}</span>
                  <span className="truncate text-secondary" title={extra?.department ?? ""}>
                    {extra?.department || "—"}
                  </span>
                  {otherRoleIds.length > 0 ? (
                    <JobRoleTags jobRoleIds={otherRoleIds} jobRoleMap={jobRoleMap} isColored={isColored} />
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                  <span className="flex justify-end">
                    {canManageMembers && (
                      <button
                        type="button"
                        className="text-14 text-secondary hover:text-danger-primary hover:underline"
                        onClick={() => setPendingRemove(userId)}
                      >
                        移除
                      </button>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <PermissionGroupPager total={rows.length} page={currentPage} pageCount={pageCount} onPageChange={setPage} unit="人" />

      <AddMemberModal
        isOpen={isAddOpen}
        memberOptions={memberOptions}
        existingMembers={holderIds.map((member) => ({ member }))}
        targetLabel={`角色「${role.label}」`}
        onClose={() => setIsAddOpen(false)}
        onAdd={async (userIds) => {
          try {
            const addedIds = await onAdd(userIds);
            return { succeededIds: addedIds, failures: [] };
          } catch (addError) {
            return {
              succeededIds: [],
              failures: userIds.map((targetId) => ({
                targetId,
                message: getJobRoleErrorMessage(addError, "添加失败"),
              })),
            };
          }
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => setPendingRemove(null)}
        handleSubmit={handleRemove}
        isSubmitting={isRemoving}
        title={`将 ${getMemberDisplayName(pendingRemove ? getUserDetails(pendingRemove) : undefined)} 从角色「${role.label}」中移除？`}
        content="移除后，此人在工作区成员中不再带有该角色；各项目成员中的角色不受影响。"
        primaryButtonText={{ loading: "移除中", default: "移除" }}
      />
    </div>
  );
});
