/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { PlusIcon, Trash2Icon, UsersRound } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupMember } from "@plane/types";
import { AlertModalCore, Avatar } from "@plane/ui";
import { Button as UIButton } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { AddMemberModal } from "./add-member-modal";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type Props = {
  group: IWorkspaceGroup | null;
  members: IWorkspaceGroupMember[];
  isLoading: boolean;
  isAdmin: boolean;
  memberOptions: TMemberOption[];
  onAddMember: (groupId: string, memberId: string) => Promise<void>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
};

export function MembersPanel({ group, members, isLoading, isAdmin, memberOptions, onAddMember, onRemoveMember }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{
    membershipId: string;
    displayName: string;
  } | null>(null);
  const [isRemoveSubmitting, setIsRemoveSubmitting] = useState(false);

  const handleAddMember = async (memberIds: string[]) => {
    if (!group) return;
    try {
      await Promise.all(memberIds.map((id) => onAddMember(group.id, id)));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "已添加",
        message: memberIds.length > 1 ? `${memberIds.length} 位成员已加入团队` : "成员已加入团队",
      });
    } catch (err: unknown) {
      const errObj = err as Record<string, string | string[]>;
      const msg = errObj?.member
        ? Array.isArray(errObj.member)
          ? errObj.member[0]
          : errObj.member
        : "添加成员失败";
      setToast({ type: TOAST_TYPE.ERROR, title: "添加失败", message: String(msg) });
    }
  };

  const closeRemoveModal = () => {
    setPendingRemove(null);
    setIsRemoveSubmitting(false);
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove || !group) return;
    setIsRemoveSubmitting(true);
    try {
      await onRemoveMember(group.id, pendingRemove.membershipId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "成员已从团队中移除" });
      closeRemoveModal();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col border-r border-subtle overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
        <h3 className="text-body-sm-semibold text-primary">
          成员
          {!isLoading && group && (
            <span className="ml-1.5 text-body-xs-regular text-tertiary">({members.length})</span>
          )}
        </h3>
        {isAdmin && group && (
          <UIButton
            variant="link-neutral"
            className="flex items-center gap-1 p-0 text-body-xs-medium text-placeholder hover:text-primary"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon className="size-3.5" />
            添加成员
          </UIButton>
        )}
      </div>

      {/* Content */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!group ? (
          /* No group selected */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-layer-1">
              <UsersRound className="size-5 text-placeholder" />
            </div>
            <p className="text-body-sm-regular text-tertiary">请在左侧选择一个团队</p>
          </div>
        ) : isLoading ? (
          /* Loading skeleton */
          <div className="flex flex-col gap-0 divide-y divide-subtle">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-5 py-3">
                <div className="size-7 shrink-0 rounded-full bg-layer-transparent-hover" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3 w-28 rounded bg-layer-transparent-hover" />
                  <div className="h-2.5 w-40 rounded bg-layer-transparent-hover" />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-dashed border-subtle">
              <UsersRound className="size-4 text-placeholder" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-body-sm-medium text-secondary">暂无成员</p>
              <p className="text-body-xs-regular text-tertiary">该团队还没有成员</p>
            </div>
            {isAdmin && (
              <UIButton
                variant="link-primary"
                className="p-0 text-body-xs-medium"
                onClick={() => setShowAddModal(true)}
              >
                + 添加成员
              </UIButton>
            )}
          </div>
        ) : (
          /* Member list */
          <ul className="divide-y divide-subtle">
            {members.map((item) => {
              const user = item.member_detail?.member;
              const displayName = user
                ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
                  user.display_name ||
                  user.email ||
                  "未知用户"
                : "未知用户";
              return (
                <li
                  key={item.id}
                  className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-layer-1-hover"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={displayName} src={user?.avatar_url} size={28} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-body-xs-semibold text-primary">{displayName}</p>
                      {user?.email && (
                        <p className="truncate text-[11px] text-tertiary">{user.email}</p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setPendingRemove({ membershipId: item.id, displayName })}
                      className={cn(
                        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-placeholder",
                        "opacity-0 transition-all duration-150 group-hover:opacity-100",
                        "hover:bg-red-500/10 hover:text-red-600"
                      )}
                      aria-label="从团队中移除"
                      title="移除"
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

      {/* Modals */}
      {group && (
        <AddMemberModal
          isOpen={showAddModal}
          memberOptions={memberOptions}
          existingMembers={members}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddMember}
        />
      )}
      <AlertModalCore
        isOpen={!!pendingRemove}
        handleClose={closeRemoveModal}
        handleSubmit={handleConfirmRemove}
        isSubmitting={isRemoveSubmitting}
        title="从团队中移除此成员？"
        content={
          pendingRemove && group ? (
            <>
              确定要将成员{" "}
              <span className="font-semibold text-primary">{pendingRemove.displayName}</span>{" "}
              从「{group.name}」中移除吗？之后可以再次将其加入本团队。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "移除", loading: "移除中…" }}
      />
    </div>
  );
}
