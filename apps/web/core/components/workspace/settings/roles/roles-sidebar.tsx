/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { DownloadIcon, PencilIcon, PlusIcon, ShieldCheck, Trash2Icon } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import type { IWorkspaceRole } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { AlertModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { RoleFormModal } from "./role-form-modal";

type Props = {
  roles: IWorkspaceRole[];
  totalRoleCount: number;
  isLoading: boolean;
  isAdmin: boolean;
  selectedRoleId: string | null;
  onSelectRole: (roleId: string) => void;
  onCreate: (data: { name: string; description: string }) => Promise<IWorkspaceRole>;
  onUpdate: (roleId: string, data: { name: string; description: string }) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
  onImport?: () => void;
};

export function RolesSidebar({
  roles,
  totalRoleCount,
  isLoading,
  isAdmin,
  selectedRoleId,
  onSelectRole,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
}: Props) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<IWorkspaceRole | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IWorkspaceRole | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const filteredRoles = searchQuery.trim()
    ? roles.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : roles;

  const isSearchNoResults = filteredRoles.length === 0 && totalRoleCount > 0;

  const handleCreate = async (data: { name: string; description: string }) => {
    const newRole = await onCreate(data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已创建", message: `角色「${newRole.name}」已创建` });
    onSelectRole(newRole.id);
  };

  const handleUpdate = async (data: { name: string; description: string }) => {
    if (!editingRole) return;
    await onUpdate(editingRole.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "角色信息已更新" });
  };

  const closeDeleteModal = () => {
    setPendingDelete(null);
    setIsDeleteSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleteSubmitting(true);
    try {
      await onDelete(pendingDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已删除", message: `角色「${pendingDelete.name}」已删除` });
      closeDeleteModal();
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
      }
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-1/4 min-w-52 max-w-72 flex-col border-r border-subtle">
        <div className="flex items-center justify-between gap-2 border-b border-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-12 animate-pulse rounded bg-layer-transparent-hover" />
            <div className="h-4 w-6 animate-pulse rounded-full bg-layer-transparent-hover" />
          </div>
        </div>
        <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex animate-pulse flex-col gap-1.5 rounded-md px-3 py-2.5">
              <div className="h-3.5 w-3/4 rounded bg-layer-transparent-hover" />
              <div className="h-3 w-1/2 rounded bg-layer-transparent-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-1/4 min-w-52 max-w-72 flex-col border-r border-subtle">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 !text-13 !font-medium !leading-4 text-primary">
            角色
            <CountChip count={totalRoleCount} className="h-4 !text-13 !font-medium !leading-4" />
          </h4>
          {isAdmin && (
            <div className="flex items-center gap-0.5">
              {onImport ? (
                <button
                  type="button"
                  onClick={onImport}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary"
                  aria-label="从模板导入"
                  title="从模板导入"
                >
                  <DownloadIcon className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary"
                  aria-label="新建角色"
                  title="新建角色"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 border-none bg-transparent text-13 font-medium leading-4 outline-none placeholder:text-placeholder"
            placeholder="搜索角色..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Roles List */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
        {filteredRoles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-layer-1">
              <ShieldCheck className="size-4 text-placeholder" />
            </div>
            {isSearchNoResults ? (
              <p className="text-13 font-medium leading-4 text-tertiary">没有匹配的角色</p>
            ) : (
              <>
                <p className="text-13 font-medium leading-4 text-tertiary">暂无角色</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="mt-2 cursor-pointer text-13 font-medium leading-4 text-custom-primary-100 transition-colors hover:underline"
                  >
                    点击新建
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filteredRoles.map((role) => {
              const isSelected = selectedRoleId === role.id;
              return (
                <li
                  key={role.id}
                  onClick={() => onSelectRole(role.id)}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors duration-150",
                    isSelected
                      ? "bg-accent-primary/8 text-accent-primary"
                      : "hover:bg-layer-1-hover"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ShieldCheck
                        className={cn("size-3.5 shrink-0", isSelected ? "text-accent-primary" : "text-placeholder")}
                      />
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate !text-13 !font-medium !leading-4",
                          isSelected ? "text-accent-primary" : "text-primary"
                        )}
                      >
                        {role.name}
                      </p>
                    </div>
                    {/* Admin actions — visible on hover */}
                    {isAdmin && (
                      <div
                        className={cn(
                          "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150",
                          "group-hover:opacity-100",
                          isSelected && "opacity-100"
                        )}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRole(role);
                          }}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 hover:bg-layer-1-hover hover:text-primary"
                          aria-label="编辑角色"
                          title="编辑"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(role);
                          }}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 hover:bg-red-500/10 hover:text-red-600"
                          aria-label="删除角色"
                          title="删除"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Description */}
                  {role.description?.trim() && (
                    <p className="truncate pl-5 text-13 font-medium leading-4 text-tertiary">{role.description}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* New Role Button (bottom) */}
      {isAdmin && roles.length > 0 && (
        <div className="shrink-0 border-t border-subtle p-2">
          <Button
            variant="ghost"
            prependIcon={<PlusIcon />}
            onClick={() => setShowCreateModal(true)}
            className="w-full justify-center"
          >
            新建角色
          </Button>
        </div>
      )}

      {/* Modals */}
      <RoleFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
      <RoleFormModal
        isOpen={Boolean(editingRole)}
        role={editingRole}
        onClose={() => setEditingRole(null)}
        onSubmit={handleUpdate}
      />
      <AlertModalCore
        isOpen={!!pendingDelete}
        handleClose={closeDeleteModal}
        handleSubmit={handleConfirmDelete}
        isSubmitting={isDeleteSubmitting}
        title="删除此角色？"
        content={
          pendingDelete ? (
            <>
              确定要删除角色{" "}
              <span className="font-semibold text-primary">「{pendingDelete.name}」</span>{" "}
              吗？此操作不可恢复。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "删除", loading: "删除中…" }}
      />
    </div>
  );
}
