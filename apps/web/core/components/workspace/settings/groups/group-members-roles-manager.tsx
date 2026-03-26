/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { IWorkspaceGroup, IWorkspaceGroupMember, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { AlertModalCore, Avatar, Row, Button as UIButton } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { PencilIcon, Trash2Icon, PlusIcon, XIcon, ShieldIcon } from "lucide-react";
import { cn } from "@plane/utils";
import { GroupFormModal } from "./group-form-modal";
import { AddMemberModal } from "./add-member-modal";
import { AddRoleModal } from "./add-role-modal";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

export type TGroupMembersRolesVariant = "standalone" | "embedded";

type Props = {
  variant: TGroupMembersRolesVariant;
  group: IWorkspaceGroup;
  members: IWorkspaceGroupMember[];
  roles: IWorkspaceGroupRole[];
  isDetailLoading: boolean;
  availableRoles: IWorkspaceRole[];
  memberOptions: TMemberOption[];
  isAdmin: boolean;
  onUpdate: (groupId: string, data: { name: string; description: string }) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
  onAddMember: (groupId: string, memberId: string) => Promise<void>;
  onRemoveMember: (groupId: string, membershipId: string) => Promise<void>;
  onAddRole: (groupId: string, roleId: string) => Promise<void>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
};

export function GroupMembersRolesManager({
  variant,
  group,
  members,
  roles,
  isDetailLoading,
  availableRoles,
  memberOptions,
  isAdmin,
  onUpdate,
  onDelete,
  onAddMember,
  onRemoveMember,
  onAddRole,
  onRemoveRole,
}: Props) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [pendingMemberRemove, setPendingMemberRemove] = useState<{
    membershipId: string;
    displayName: string;
  } | null>(null);
  const [pendingRoleRemove, setPendingRoleRemove] = useState<{
    groupRoleId: string;
    roleName: string;
  } | null>(null);
  const [isRemoveMemberSubmitting, setIsRemoveMemberSubmitting] = useState(false);
  const [isRemoveRoleSubmitting, setIsRemoveRoleSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (data: { name: string; description: string }) => {
    await onUpdate(group.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "团队信息已更新" });
  };

  const handleDelete = async () => {
    if (!confirm(`确定要删除团队「${group.name}」吗？此操作不可恢复。`)) return;
    setIsDeleting(true);
    try {
      await onDelete(group.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已删除", message: `团队「${group.name}」已删除` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddMember = async (memberIds: string[]) => {
    try {
      await Promise.all(memberIds.map((memberId) => onAddMember(group.id, memberId)));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "已添加",
        message: memberIds.length > 1 ? `${memberIds.length} 位成员已加入组` : "成员已加入组",
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

  const closeRemoveMemberModal = () => {
    setPendingMemberRemove(null);
    setIsRemoveMemberSubmitting(false);
  };

  const handleConfirmRemoveMember = async () => {
    if (!pendingMemberRemove) return;
    setIsRemoveMemberSubmitting(true);
    try {
      await onRemoveMember(group.id, pendingMemberRemove.membershipId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "成员已从组中移除" });
      closeRemoveMemberModal();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveMemberSubmitting(false);
    }
  };

  const handleAddRole = async (roleId: string) => {
    try {
      await onAddRole(group.id, roleId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已添加", message: "角色已分配给组" });
    } catch (err: unknown) {
      const errObj = err as Record<string, string | string[]>;
      const msg = errObj?.role
        ? Array.isArray(errObj.role)
          ? errObj.role[0]
          : errObj.role
        : "添加角色失败";
      setToast({ type: TOAST_TYPE.ERROR, title: "添加失败", message: String(msg) });
    }
  };

  const closeRemoveRoleModal = () => {
    setPendingRoleRemove(null);
    setIsRemoveRoleSubmitting(false);
  };

  const handleConfirmRemoveRole = async () => {
    if (!pendingRoleRemove) return;
    setIsRemoveRoleSubmitting(true);
    try {
      await onRemoveRole(group.id, pendingRoleRemove.groupRoleId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "角色已从组中移除" });
      closeRemoveRoleModal();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveRoleSubmitting(false);
    }
  };

  const headerAdminActions = isAdmin && (
    <>
      <Button variant="secondary" size="base" prependIcon={<PencilIcon />} onClick={() => setShowEditModal(true)}>
        编辑
      </Button>
      <Button
        variant="error-outline"
        size="base"
        prependIcon={<Trash2Icon />}
        onClick={handleDelete}
        disabled={isDeleting}
      >
        删除
      </Button>
    </>
  );

  const memberListRows = members.map((item) => {
    const user = item.member_detail?.member;
    const displayName =
      user
        ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.display_name || user.email || "未知用户"
        : "未知用户";
    return (
      <li
        key={item.id}
        className="flex items-center justify-between gap-3 bg-surface-1 px-2.5 py-2.5 transition-colors duration-200 hover:bg-layer-1-hover sm:px-3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={displayName} src={user?.avatar_url} size={28} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-13 font-medium text-primary">{displayName}</p>
            {user?.email && <p className="truncate text-12 text-tertiary">{user.email}</p>}
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setPendingMemberRemove({ membershipId: item.id, displayName })}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-red-500/10 hover:text-red-600"
            aria-label="从组中移除成员"
            title="删除"
          >
            <Trash2Icon className="size-3.5" />
          </button>
        )}
      </li>
    );
  });

  const roleListRows = roles.map((item) => {
    const role = item.role_detail;
    return (
      <li
        key={item.id}
        className="flex items-center justify-between gap-3 bg-surface-1 px-2.5 py-2.5 transition-colors duration-200 hover:bg-layer-1-hover sm:px-3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-layer-1">
            <ShieldIcon className="size-3.5 text-secondary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-13 font-medium text-primary">{role?.name ?? "未知角色"}</p>
            <p className="truncate text-12 text-tertiary">{role?.description?.trim() || "该角色暂无补充说明"}</p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() =>
              setPendingRoleRemove({
                groupRoleId: item.id,
                roleName: role?.name ?? "未知角色",
              })
            }
            className={cn(
              "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-red-500/10 hover:text-red-600"
            )}
            title="从组中移除"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </li>
    );
  });

  return (
    <div
      className={cn(
        variant === "standalone" && "flex h-full flex-col overflow-hidden",
        variant === "embedded" && "bg-surface-1"
      )}
    >
      {variant === "standalone" && (
        <div className="flex items-start justify-between gap-4 border-b border-subtle px-6 py-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-h4-medium text-primary">{group.name}</h3>
            <p className="text-body-sm-regular text-tertiary">{group.description || "暂无描述"}</p>
          </div>
          {isAdmin && (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">{headerAdminActions}</div>
          )}
        </div>
      )}

      {variant === "embedded" ? (
        <Row className="flex flex-col bg-surface-1 pt-3 pb-6">
          {isDetailLoading ? (
            <div className="grid w-full grid-cols-1 gap-3 bg-surface-1 md:grid-cols-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex min-h-[17rem] animate-pulse flex-col gap-5 rounded-lg border border-subtle bg-surface-1 px-3.5 py-4"
                >
                  <div className="flex justify-between gap-4">
                    <div className="h-4 w-16 rounded bg-layer-transparent-hover" />
                    <div className="h-4 w-12 rounded bg-layer-transparent-hover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-10 rounded-md bg-layer-transparent-hover" />
                    <div className="h-10 rounded-md bg-layer-transparent-hover" />
                    <div className="h-10 rounded-md bg-layer-transparent-hover" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid w-full grid-cols-1 gap-3 bg-surface-1 md:grid-cols-2">
              {/* 成员卡片 — 对齐 ActiveCycle 进度卡 */}
              <div className="flex min-h-[17rem] flex-col gap-5 rounded-lg border border-subtle bg-surface-1 px-3.5 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="min-w-0 shrink text-14 font-semibold text-tertiary">成员</h3>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                 
                      {isAdmin && (
                        <UIButton
                          variant="link-neutral"
                          className="p-0"
                          onClick={() => setShowAddMemberModal(true)}
                          aria-label="添加成员"
                          title="添加成员"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </UIButton>
                      )}
                    </div>
                  </div>
                </div>
                {members.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-subtle px-3 py-10 text-center">
                    <p className="text-13 text-tertiary">暂无成员</p>
                  </div>
                ) : (
                  <ul className="flex max-h-[min(22rem,50vh)] min-h-0 flex-col divide-y divide-subtle overflow-y-auto rounded-md border border-subtle">
                    {memberListRows}
                  </ul>
                )}
              </div>

              {/* 角色卡片 — 对齐 ActiveCycle 生产力卡 */}
              <div className="flex min-h-[17rem] flex-col gap-5 rounded-lg border border-subtle bg-surface-1 px-3.5 py-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="min-w-0 shrink text-14 font-semibold text-tertiary">角色</h3>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {isAdmin && (
                        <UIButton
                          variant="link-neutral"
                          className="p-0"
                          onClick={() => setShowAddRoleModal(true)}
                          aria-label="添加角色"
                          title="添加角色"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </UIButton>
                      )}
                    </div>
                  </div>
                </div>
                {roles.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-md border border-dashed border-subtle px-3 py-10 text-center">
                    <p className="text-13 text-tertiary">暂未分配角色</p>
                  </div>
                ) : (
                  <ul className="flex max-h-[min(22rem,50vh)] min-h-0 flex-col divide-y divide-subtle overflow-y-auto rounded-md border border-subtle">
                    {roleListRows}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Row>
      ) : (
        <div className={cn("flex-1 overflow-y-auto px-6 py-6")}>
          {isDetailLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3">
                  <div className="size-8 rounded-full bg-layer-transparent-hover" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-28 rounded bg-layer-transparent-hover" />
                    <div className="h-2.5 w-20 rounded bg-layer-transparent-hover" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-body-sm-semibold text-primary">成员 ({members.length})</h4>
                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="base"
                      prependIcon={<PlusIcon />}
                      onClick={() => setShowAddMemberModal(true)}
                    >
                      添加成员
                    </Button>
                  )}
                </div>
                {members.length === 0 ? (
                  <div className="flex min-h-[100px] flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0 px-4 text-center">
                    <p className="text-body-sm-regular text-tertiary">暂无成员</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-subtle">
                    <ul className="divide-y divide-subtle">{memberListRows}</ul>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-body-sm-semibold text-primary">角色 ({roles.length})</h4>
                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="base"
                      prependIcon={<PlusIcon />}
                      onClick={() => setShowAddRoleModal(true)}
                    >
                      添加角色
                    </Button>
                  )}
                </div>
                {roles.length === 0 ? (
                  <div className="flex min-h-[100px] flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0 px-4 text-center">
                    <p className="text-body-sm-regular text-tertiary">暂未分配角色</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-subtle">
                    <ul className="divide-y divide-subtle">{roleListRows}</ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <GroupFormModal
        isOpen={showEditModal}
        group={group}
        onClose={() => setShowEditModal(false)}
        onSubmit={handleUpdate}
      />
      <AddMemberModal
        isOpen={showAddMemberModal}
        memberOptions={memberOptions}
        existingMembers={members}
        onClose={() => setShowAddMemberModal(false)}
        onAdd={handleAddMember}
      />
      <AddRoleModal
        isOpen={showAddRoleModal}
        availableRoles={availableRoles}
        existingRoles={roles}
        onClose={() => setShowAddRoleModal(false)}
        onAdd={handleAddRole}
      />

      <AlertModalCore
        isOpen={!!pendingMemberRemove}
        handleClose={closeRemoveMemberModal}
        handleSubmit={handleConfirmRemoveMember}
        isSubmitting={isRemoveMemberSubmitting}
        title="从组中移除此成员？"
        content={
          pendingMemberRemove ? (
            <>
              确定要将成员{" "}
              <span className="font-semibold text-primary">{pendingMemberRemove.displayName}</span>{" "}
              从「{group.name}」中移除吗？之后可以再次将其加入本组。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "移除", loading: "移除中…" }}
      />

      <AlertModalCore
        isOpen={!!pendingRoleRemove}
        handleClose={closeRemoveRoleModal}
        handleSubmit={handleConfirmRemoveRole}
        isSubmitting={isRemoveRoleSubmitting}
        title="从组中移除此角色？"
        content={
          pendingRoleRemove ? (
            <>
              确定要将角色{" "}
              <span className="font-semibold text-primary">{pendingRoleRemove.roleName}</span>{" "}
              从「{group.name}」中移除吗？之后可以再次分配。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "移除", loading: "移除中…" }}
      />
    </div>
  );
}
