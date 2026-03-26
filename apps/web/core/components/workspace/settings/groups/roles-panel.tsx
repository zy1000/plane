/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { PlusIcon, ShieldIcon, XIcon } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { Button as UIButton } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { AddRoleModal } from "./add-role-modal";

type Props = {
  group: IWorkspaceGroup | null;
  roles: IWorkspaceGroupRole[];
  isLoading: boolean;
  isAdmin: boolean;
  availableRoles: IWorkspaceRole[];
  onAddRole: (groupId: string, roleId: string) => Promise<void>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
};

export function RolesPanel({ group, roles, isLoading, isAdmin, availableRoles, onAddRole, onRemoveRole }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{
    groupRoleId: string;
    roleName: string;
  } | null>(null);
  const [isRemoveSubmitting, setIsRemoveSubmitting] = useState(false);

  const handleAddRole = async (roleId: string) => {
    if (!group) return;
    try {
      await onAddRole(group.id, roleId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已添加", message: "角色已分配给团队" });
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

  const closeRemoveModal = () => {
    setPendingRemove(null);
    setIsRemoveSubmitting(false);
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove || !group) return;
    setIsRemoveSubmitting(true);
    try {
      await onRemoveRole(group.id, pendingRemove.groupRoleId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "角色已从团队中移除" });
      closeRemoveModal();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
        <h3 className="text-body-sm-semibold text-primary">
          角色
          {!isLoading && group && (
            <span className="ml-1.5 text-body-xs-regular text-tertiary">({roles.length})</span>
          )}
        </h3>
        {isAdmin && group && (
          <UIButton
            variant="link-neutral"
            className="flex items-center gap-1 p-0 text-body-xs-medium text-placeholder hover:text-primary"
            onClick={() => setShowAddModal(true)}
          >
            <PlusIcon className="size-3.5" />
            添加角色
          </UIButton>
        )}
      </div>

      {/* Content */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!group ? (
          /* No group selected */
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-layer-1">
              <ShieldIcon className="size-5 text-placeholder" />
            </div>
            <p className="text-body-sm-regular text-tertiary">请在左侧选择一个团队</p>
          </div>
        ) : isLoading ? (
          /* Loading skeleton */
          <div className="flex flex-col divide-y divide-subtle">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 px-5 py-3">
                <div className="size-7 shrink-0 rounded-md bg-layer-transparent-hover" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3 w-24 rounded bg-layer-transparent-hover" />
                  <div className="h-2.5 w-40 rounded bg-layer-transparent-hover" />
                </div>
              </div>
            ))}
          </div>
        ) : roles.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-dashed border-subtle">
              <ShieldIcon className="size-4 text-placeholder" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-body-sm-medium text-secondary">暂无角色</p>
              <p className="text-body-xs-regular text-tertiary">该团队还没有分配角色</p>
            </div>
            {isAdmin && (
              <UIButton
                variant="link-primary"
                className="p-0 text-body-xs-medium"
                onClick={() => setShowAddModal(true)}
              >
                + 添加角色
              </UIButton>
            )}
          </div>
        ) : (
          /* Role list */
          <ul className="divide-y divide-subtle">
            {roles.map((item) => {
              const role = item.role_detail;
              return (
                <li
                  key={item.id}
                  className="group flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-150 hover:bg-layer-1-hover"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-layer-1">
                      <ShieldIcon className="size-3.5 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-body-xs-semibold text-primary">{role?.name ?? "未知角色"}</p>
                      {role?.description?.trim() && (
                        <p className="truncate text-[11px] text-tertiary">{role.description}</p>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRemove({
                          groupRoleId: item.id,
                          roleName: role?.name ?? "未知角色",
                        })
                      }
                      className={cn(
                        "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-placeholder",
                        "opacity-0 transition-all duration-150 group-hover:opacity-100",
                        "hover:bg-red-500/10 hover:text-red-600"
                      )}
                      title="从团队中移除"
                    >
                      <XIcon className="size-3.5" />
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
        <AddRoleModal
          isOpen={showAddModal}
          availableRoles={availableRoles}
          existingRoles={roles}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddRole}
        />
      )}
      <AlertModalCore
        isOpen={!!pendingRemove}
        handleClose={closeRemoveModal}
        handleSubmit={handleConfirmRemove}
        isSubmitting={isRemoveSubmitting}
        title="从团队中移除此角色？"
        content={
          pendingRemove && group ? (
            <>
              确定要将角色{" "}
              <span className="font-semibold text-primary">{pendingRemove.roleName}</span>{" "}
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
