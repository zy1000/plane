/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddMemberModal } from "@/components/workspace/settings/groups/add-member-modal";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { usePermissionGroupMembers } from "@/hooks/store/use-permission-group-detail";
import { getPermissionGroupErrorMessage } from "./helpers";
import { JobRoleTags } from "./job-role-tags";
import { MemberIdentityCell, getMemberDisplayName } from "./member-identity-cell";

type Props = {
  workspaceSlug: string;
  group: IPermissionGroup;
  canManage: boolean;
  /** 加人 / 移人后刷新列表里的人数 */
  onChanged: () => void;
};

const GRID = "grid grid-cols-[minmax(220px,1.6fr)_100px_minmax(120px,1fr)_minmax(160px,1.2fr)_80px] items-center gap-x-4 px-4";

/** 工作区权限组详情的「成员」页签：直绑在这个组上的人。团队绑定带来的不在这里列（在团队页看） */
export const PermissionGroupMembersPanel = observer(function PermissionGroupMembersPanel(props: Props) {
  const { workspaceSlug, group, canManage, onChanged } = props;
  const { memberIds, isLoading, error, reload, addMembers, removeMember } = usePermissionGroupMembers(
    workspaceSlug,
    group.id,
    true
  );
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
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder="搜索姓名、邮箱、工号"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>
              <X className="size-3 text-placeholder hover:text-primary" />
            </button>
          )}
        </div>
        <span className="ml-auto text-13 text-tertiary tabular-nums">{memberIds.length} 人</span>
        {canManage && (
          <Button variant="primary" size="lg" onClick={() => setIsAddOpen(true)}>
            添加成员
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div className={cn(GRID, "h-10 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary")}>
          <span>成员</span>
          <span>工号</span>
          <span>部门</span>
          <span>角色</span>
          <span className="text-right">操作</span>
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
          <p className="py-12 text-center text-13 text-placeholder">
            {keyword ? "没有匹配的成员" : "还没有成员，点右上角「添加成员」把人加进来"}
          </p>
        ) : (
          rows.map(({ userId, user }) => {
            const extra = user as { employee_id?: string | null; department?: string | null } | undefined;
            const membership = workspaceMemberMap?.[workspaceSlug]?.[userId];
            return (
              <div key={userId} className={cn(GRID, "min-h-13 border-b border-subtle py-2 text-13 last:border-b-0")}>
                <MemberIdentityCell user={user} />
                <span className="truncate text-secondary tabular-nums">{extra?.employee_id || "—"}</span>
                <span className="truncate text-secondary" title={extra?.department ?? ""}>
                  {extra?.department || "—"}
                </span>
                <JobRoleTags jobRoleIds={membership?.job_role_ids} jobRoleMap={jobRoleMap} isColored={isColored} />
                <span className="text-right">
                  {canManage && (
                    <button
                      type="button"
                      className="text-13 text-danger-primary hover:underline"
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
