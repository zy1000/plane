/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddMemberModal } from "@/components/workspace/settings/groups/add-member-modal";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import type { usePermissionGroupMembers } from "@/hooks/store/use-permission-group-detail";
import { getPermissionGroupErrorMessage } from "./helpers";
import { JobRoleTags } from "./job-role-tags";
import { MemberIdentityCell, getMemberDisplayName } from "./member-identity-cell";
import { PermissionGroupSearch } from "./ui";

type Props = {
  workspaceSlug: string;
  group: IPermissionGroup;
  canManage: boolean;
  /** 成员数据由详情页取（数字卡片也要用），这里只渲染和增删 */
  members: ReturnType<typeof usePermissionGroupMembers>;
  /** 加人 / 移人后刷新列表里的人数 */
  onChanged: () => void;
};

const GRID = "grid grid-cols-[minmax(220px,1.6fr)_104px_minmax(120px,1fr)_minmax(180px,1.2fr)_56px] items-center gap-x-4 px-5";

/** 工作区权限组详情的「成员」页签：直绑在这个组上的人。团队绑定带来的不在这里列（在团队页看） */
export const PermissionGroupMembersPanel = observer(function PermissionGroupMembersPanel(props: Props) {
  const { workspaceSlug, group, canManage, members, onChanged } = props;
  const { memberIds, isLoading, error, reload, addMembers, removeMember } = members;
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, workspaceMemberMap },
  } = useMember();
  const { jobRoleMap, isColored } = useJobRoles(workspaceSlug);
  const [query, setQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

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
  const rows = memberIds
    .map((userId) => ({ userId, user: getUserDetails(userId) }))
    .filter(({ user }) => {
      if (!keyword) return true;
      const employeeId = (user as { employee_id?: string | null } | undefined)?.employee_id ?? "";
      return `${getMemberDisplayName(user)} ${user?.email ?? ""} ${employeeId}`.toLowerCase().includes(keyword);
    });

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoving(true);
    try {
      await removeMember(pendingRemove);
      onChanged();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移出" });
      setPendingRemove(null);
    } catch (removeError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "移出失败",
        message: getPermissionGroupErrorMessage(removeError, "请稍后重试"),
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const pendingUser = pendingRemove ? getUserDetails(pendingRemove) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索姓名、邮箱、工号" className="w-72" />
        {canManage && (
          <Button variant="primary" size="xl" className="h-9 px-4" onClick={() => setIsAddOpen(true)}>
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
          <span>角色</span>
          <span className="flex justify-end">操作</span>
        </div>
        {isLoading && memberIds.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-4">
            {[0, 1, 2].map((index) => (
              <Loader.Item key={index} height="36px" />
            ))}
          </Loader>
        ) : error ? (
          <div className="py-10 text-center">
            <p className="text-13 text-secondary">{error}</p>
            <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
              重试
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-14 text-center text-14 text-placeholder">{keyword ? "没有匹配的成员" : "还没有成员"}</p>
        ) : (
          rows.map(({ userId, user }) => {
            const extra = user as { employee_id?: string | null; department?: string | null } | undefined;
            const membership = workspaceMemberMap?.[workspaceSlug]?.[userId];
            return (
              <div key={userId} className={cn(GRID, "min-h-16 border-b border-subtle py-2 text-14 last:border-b-0")}>
                <MemberIdentityCell user={user} size="lg" />
                <span className="truncate text-secondary tabular-nums">{extra?.employee_id || "—"}</span>
                <span className="truncate text-secondary" title={extra?.department ?? ""}>
                  {extra?.department || "—"}
                </span>
                <JobRoleTags jobRoleIds={membership?.job_role_ids} jobRoleMap={jobRoleMap} isColored={isColored} />
                <span className="flex justify-end">
                  {canManage && (
                    <button
                      type="button"
                      className="text-14 text-secondary hover:text-danger-primary hover:underline"
                      onClick={() => setPendingRemove(userId)}
                    >
                      移出
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
        </div>
      </div>

      <AddMemberModal
        isOpen={isAddOpen}
        memberOptions={memberOptions}
        existingMembers={memberIds.map((member) => ({ member }))}
        targetLabel="权限组"
        onClose={() => setIsAddOpen(false)}
        onAdd={async (userIds) => {
          try {
            await addMembers(userIds);
            onChanged();
            return { succeededIds: userIds, failures: [] };
          } catch (addError) {
            return {
              succeededIds: [],
              failures: userIds.map((targetId) => ({
                targetId,
                message: getPermissionGroupErrorMessage(addError, "添加失败"),
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
        title={`把 ${getMemberDisplayName(pendingUser)} 移出「${group.name}」？`}
        content="移出后他不再拥有这个权限组给的权限；如果他所在的团队也绑了这个组，仍会通过团队拿到。"
        primaryButtonText={{ loading: "移出中", default: "移出" }}
      />
    </div>
  );
});
