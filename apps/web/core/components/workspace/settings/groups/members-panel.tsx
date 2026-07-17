/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Search, Trash2Icon, UserPlus, UsersRound, X } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupMember } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddMemberModal } from "./add-member-modal";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type TBulkMutationResult = {
  succeededIds: string[];
  failures: { targetId: string; message: string }[];
};

type Props = {
  group: IWorkspaceGroup;
  members: IWorkspaceGroupMember[];
  isLoading: boolean;
  canManage: boolean;
  memberOptions: TMemberOption[];
  onAddMembers: (groupId: string, memberIds: string[]) => Promise<TBulkMutationResult>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
  onPermissionsChanged: () => Promise<void>;
};

const getMemberDisplayName = (item: IWorkspaceGroupMember) => {
  const user = item.member_detail?.member;
  return user
    ? user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.email || "未知用户"
    : "未知用户";
};

export function MembersPanel({
  group,
  members,
  isLoading,
  canManage,
  memberOptions,
  onAddMembers,
  onRemoveMember,
  onPermissionsChanged,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ membershipId: string; displayName: string } | null>(null);
  const [isRemoveSubmitting, setIsRemoveSubmitting] = useState(false);

  const filteredMembers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return members;
    return members.filter((item) => {
      const user = item.member_detail?.member;
      return (
        getMemberDisplayName(item).toLowerCase().includes(normalizedQuery) ||
        user?.email?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [members, searchQuery]);

  const handleAddMembers = async (memberIds: string[]) => {
    const result = await onAddMembers(group.id, memberIds);
    if (result.succeededIds.length > 0) await onPermissionsChanged().catch(() => undefined);
    return result;
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoveSubmitting(true);
    try {
      await onRemoveMember(group.id, pendingRemove.membershipId);
      await onPermissionsChanged().catch(() => undefined);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "成员已从团队中移除" });
      setPendingRemove(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-5 py-3">
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 focus-within:border-accent-strong">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索团队成员"
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="flex size-5 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary"
              aria-label="清除成员搜索"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {canManage && (
          <Button variant="primary" prependIcon={<UserPlus />} onClick={() => setShowAddModal(true)}>
            添加成员
          </Button>
        )}
      </div>

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="divide-y divide-subtle">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex animate-pulse items-center gap-3 px-5 py-3">
                <div className="size-8 rounded-full bg-layer-transparent-hover" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-32 rounded bg-layer-transparent-hover" />
                  <div className="h-3 w-48 rounded bg-layer-transparent-hover" />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-subtle bg-layer-1">
              <UsersRound className="size-5 text-secondary" />
            </div>
            <p className="text-13 font-medium text-primary">团队中还没有成员</p>
            <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
              从工作区成员中选择人员加入团队，他们将自动继承团队的全部角色权限。
            </p>
            {canManage && (
              <Button
                variant="secondary"
                className="mt-4"
                prependIcon={<UserPlus />}
                onClick={() => setShowAddModal(true)}
              >
                添加成员
              </Button>
            )}
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <Search className="mb-3 size-5 text-placeholder" />
            <p className="text-13 font-medium text-primary">没有匹配的成员</p>
            <p className="mt-1 text-13 text-secondary">尝试搜索姓名或邮箱。</p>
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {filteredMembers.map((item) => {
              const user = item.member_detail?.member;
              const displayName = getMemberDisplayName(item);
              return (
                <li
                  key={item.id}
                  className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-layer-1-hover"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={displayName} src={user?.avatar_url} size={32} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-13 font-medium text-primary">{displayName}</p>
                      <p className="mt-0.5 truncate text-13 text-secondary">{user?.email || "暂无邮箱"}</p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setPendingRemove({ membershipId: item.id, displayName })}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md text-placeholder opacity-0 transition-colors hover:bg-danger-subtle hover:text-danger-primary",
                        "group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                      )}
                      aria-label={`从团队中移除 ${displayName}`}
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AddMemberModal
        isOpen={showAddModal}
        memberOptions={memberOptions}
        existingMembers={members}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddMembers}
      />
      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => setPendingRemove(null)}
        handleSubmit={handleConfirmRemove}
        isSubmitting={isRemoveSubmitting}
        title="从团队中移除此成员？"
        content={
          pendingRemove ? (
            <>
              <span className="font-medium text-primary">{pendingRemove.displayName}</span> 将不再通过「{group.name}
              」继承团队角色权限；其直接角色和其他团队权限不会受影响。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "移除成员", loading: "移除中…" }}
      />
    </div>
  );
}
