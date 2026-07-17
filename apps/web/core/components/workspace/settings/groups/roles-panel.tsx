/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { PlusIcon, ShieldCheck, Trash2Icon } from "lucide-react";
import type { IWorkspaceGroup, IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddRoleModal } from "./add-role-modal";

type TBulkMutationResult = {
  succeededIds: string[];
  failures: { targetId: string; message: string }[];
};

type Props = {
  group: IWorkspaceGroup;
  roles: IWorkspaceGroupRole[];
  isLoading: boolean;
  canManage: boolean;
  availableRoles: IWorkspaceRole[];
  isAvailableRolesLoading: boolean;
  availableRolesError: string | null;
  onRetryAvailableRoles: () => void;
  onAddRoles: (groupId: string, roleIds: string[]) => Promise<TBulkMutationResult>;
  onRemoveRole: (groupId: string, groupRoleId: string) => Promise<void>;
  onPermissionsChanged: () => Promise<void>;
};

const getPermissionCount = (role: IWorkspaceRole | undefined) => {
  if (!role?.permissions || typeof role.permissions !== "object") return 0;
  const permissionKeys = role.permissions.permission_keys;
  return Array.isArray(permissionKeys) ? permissionKeys.filter((key) => typeof key === "string").length : 0;
};

export function RolesPanel({
  group,
  roles,
  isLoading,
  canManage,
  availableRoles,
  isAvailableRolesLoading,
  availableRolesError,
  onRetryAvailableRoles,
  onAddRoles,
  onRemoveRole,
  onPermissionsChanged,
}: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ groupRoleId: string; roleName: string } | null>(null);
  const [isRemoveSubmitting, setIsRemoveSubmitting] = useState(false);

  const handleAddRoles = async (roleIds: string[]) => {
    const result = await onAddRoles(group.id, roleIds);
    if (result.succeededIds.length > 0) await onPermissionsChanged().catch(() => undefined);
    return result;
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoveSubmitting(true);
    try {
      await onRemoveRole(group.id, pendingRemove.groupRoleId);
      await onPermissionsChanged().catch(() => undefined);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移除", message: "角色已从团队中移除" });
      setPendingRemove(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "移除失败", message: "请稍后重试" });
    } finally {
      setIsRemoveSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-subtle px-5 py-3">
        <div>
          <p className="text-13 font-medium text-primary">已分配角色</p>
          <p className="mt-0.5 text-11 text-tertiary">角色权限会立即应用到团队成员</p>
        </div>
        {canManage && (
          <Button variant="primary" prependIcon={<PlusIcon />} onClick={() => setShowAddModal(true)}>
            添加角色
          </Button>
        )}
      </div>

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="divide-y divide-subtle">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="flex animate-pulse items-center gap-3 px-5 py-3.5">
                <div className="size-9 rounded-lg bg-layer-transparent-hover" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3.5 w-28 rounded bg-layer-transparent-hover" />
                  <div className="h-3 w-52 rounded bg-layer-transparent-hover" />
                </div>
              </div>
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-subtle bg-layer-1">
              <ShieldCheck className="size-5 text-secondary" />
            </div>
            <p className="text-13 font-medium text-primary">尚未分配团队角色</p>
            <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
              当前没有通过这个团队授予权限。团队成员仍可能拥有直接角色或其他团队角色。
            </p>
            {canManage && (
              <Button
                variant="secondary"
                className="mt-4"
                prependIcon={<PlusIcon />}
                onClick={() => setShowAddModal(true)}
              >
                添加角色
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {roles.map((item) => {
              const role = item.role_detail;
              const roleName = role?.name ?? "未知角色";
              const permissionCount = getPermissionCount(role);
              return (
                <li
                  key={item.id}
                  className="group flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-layer-1-hover"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                      <ShieldCheck className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-13 font-medium text-primary">{roleName}</p>
                        {role?.is_system && (
                          <span className="rounded-md bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">系统角色</span>
                        )}
                        <span className="text-11 text-tertiary tabular-nums">{permissionCount} 项权限</span>
                      </div>
                      <p className="mt-0.5 truncate text-13 text-secondary">
                        {role?.description?.trim() || "暂无角色描述"}
                      </p>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => setPendingRemove({ groupRoleId: item.id, roleName })}
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-md text-placeholder opacity-0 transition-colors hover:bg-danger-subtle hover:text-danger-primary",
                        "group-focus-within:opacity-100 group-hover:opacity-100 focus:opacity-100"
                      )}
                      aria-label={`从团队中移除角色 ${roleName}`}
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

      <AddRoleModal
        isOpen={showAddModal}
        availableRoles={availableRoles}
        existingRoles={roles}
        isLoading={isAvailableRolesLoading}
        error={availableRolesError}
        onRetry={onRetryAvailableRoles}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddRoles}
      />
      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => setPendingRemove(null)}
        handleSubmit={handleConfirmRemove}
        isSubmitting={isRemoveSubmitting}
        title="从团队中移除此角色？"
        content={
          pendingRemove ? (
            <>
              「{group.name}」的 {group.member_count} 位成员将不再通过该团队获得
              <span className="font-medium text-primary"> {pendingRemove.roleName}</span>{" "}
              的权限；由其他角色授予的权限不会受影响。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "移除角色", loading: "移除中…" }}
      />
    </div>
  );
}
