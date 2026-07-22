/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { DownloadIcon, PencilIcon, PlusIcon, RotateCcw, ShieldCheck, Trash2Icon } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AlertModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { RoleFormModal, type TRoleFormLabels } from "./role-form-modal";

export type TRolesSidebarItem<TId extends string | number = string> = {
  id: TId;
  name: string;
  description?: string | null;
  is_system?: boolean;
};

export type TRolesSidebarLabels = {
  title: string;
  import: string;
  create: string;
  searchPlaceholder: string;
  noResults: string;
  empty: string;
  createInline: string;
  edit: string;
  delete: string;
  createdTitle: string;
  createdMessage: (name: string) => string;
  savedTitle: string;
  savedMessage: string;
  deletedTitle: string;
  deletedMessage: (name: string) => string;
  deleteFailedTitle: string;
  tryAgain: string;
  loadFailed: string;
  retry: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: (name: string) => string;
  cancel: string;
  deleting: string;
  form: Partial<TRoleFormLabels>;
};

type Props<TId extends string | number> = {
  roles: TRolesSidebarItem<TId>[];
  totalRoleCount: number;
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  isAdmin: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canImport?: boolean;
  selectedRoleId: TId | null;
  onSelectRole: (roleId: TId) => void;
  onCreate: (data: { name: string; description: string }) => Promise<TRolesSidebarItem<TId>>;
  onUpdate: (roleId: TId, data: { name: string; description: string }) => Promise<void>;
  onDelete: (roleId: TId) => Promise<void>;
  onImport?: () => void;
  labels?: Partial<TRolesSidebarLabels>;
};

const DEFAULT_LABELS: TRolesSidebarLabels = {
  title: "角色",
  import: "从模板导入",
  create: "新建角色",
  searchPlaceholder: "搜索角色...",
  noResults: "没有匹配的角色",
  empty: "暂无角色",
  createInline: "点击新建",
  edit: "编辑",
  delete: "删除",
  createdTitle: "已创建",
  createdMessage: (name) => `角色「${name}」已创建`,
  savedTitle: "已保存",
  savedMessage: "角色信息已更新",
  deletedTitle: "已删除",
  deletedMessage: (name) => `角色「${name}」已删除`,
  deleteFailedTitle: "删除失败",
  tryAgain: "请稍后重试",
  loadFailed: "无法加载角色",
  retry: "重试",
  deleteConfirmTitle: "删除此角色？",
  deleteConfirmDescription: (name) => `确定要删除角色「${name}」吗？此操作不可恢复。`,
  cancel: "取消",
  deleting: "删除中…",
  form: {},
};

export function RolesSidebar<TId extends string | number>({
  roles,
  totalRoleCount,
  isLoading,
  error,
  onRetry,
  isAdmin,
  canCreate,
  canEdit,
  canDelete,
  canImport,
  selectedRoleId,
  onSelectRole,
  onCreate,
  onUpdate,
  onDelete,
  onImport,
  labels: labelOverrides,
}: Props<TId>) {
  const { t } = useTranslation();
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<TRolesSidebarItem<TId> | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TRolesSidebarItem<TId> | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);
  const canCreateRole = canCreate ?? isAdmin;
  const canEditRole = canEdit ?? isAdmin;
  const canDeleteRole = canDelete ?? isAdmin;
  const canImportRole = canImport ?? canCreateRole;

  const filteredRoles = searchQuery.trim()
    ? roles.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : roles;

  const isSearchNoResults = filteredRoles.length === 0 && totalRoleCount > 0;

  const handleCreate = async (data: { name: string; description: string }) => {
    if (!canCreateRole) return;
    const newRole = await onCreate(data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: labels.createdTitle, message: labels.createdMessage(newRole.name) });
    onSelectRole(newRole.id);
  };

  const handleUpdate = async (data: { name: string; description: string }) => {
    if (!editingRole || editingRole.is_system || !canEditRole) return;
    await onUpdate(editingRole.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: labels.savedTitle, message: labels.savedMessage });
  };

  const closeDeleteModal = () => {
    setPendingDelete(null);
    setIsDeleteSubmitting(false);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || pendingDelete.is_system || !canDeleteRole) return;
    setIsDeleteSubmitting(true);
    try {
      await onDelete(pendingDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: labels.deletedTitle,
        message: labels.deletedMessage(pendingDelete.name),
      });
      closeDeleteModal();
    } catch (requestError) {
      if (isProjectPermissionError(requestError)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: labels.deleteFailedTitle, message: labels.tryAgain });
      }
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full w-1/4 max-w-72 min-w-52 flex-col border-r border-subtle">
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
    <div className="flex h-full w-1/4 max-w-72 min-w-52 flex-col border-r border-subtle">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 !text-13 !leading-4 !font-medium text-primary">
            {labels.title}
            <CountChip count={totalRoleCount} className="h-4 !text-13 !leading-4 !font-medium" />
          </h4>
          <div className="flex items-center gap-0.5">
            {onImport ? (
              <button
                type="button"
                onClick={onImport}
                disabled={!canImportRole}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder"
                aria-label={labels.import}
                title={labels.import}
              >
                <DownloadIcon className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                disabled={!canCreateRole}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder"
                aria-label={labels.create}
                title={labels.create}
              >
                <PlusIcon className="size-3.5" />
              </button>
            )}
          </div>
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 border-none bg-transparent text-13 leading-4 font-medium outline-none placeholder:text-placeholder"
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Roles List */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
        {error ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-danger-subtle">
              <ShieldCheck className="size-4 text-danger-primary" />
            </div>
            <p className="text-13 leading-4 font-medium text-tertiary">{labels.loadFailed}</p>
            {onRetry && (
              <Button variant="ghost" prependIcon={<RotateCcw />} onClick={onRetry} className="mt-2">
                {labels.retry}
              </Button>
            )}
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-layer-1">
              <ShieldCheck className="size-4 text-placeholder" />
            </div>
            {isSearchNoResults ? (
              <p className="text-13 leading-4 font-medium text-tertiary">{labels.noResults}</p>
            ) : (
              <>
                <p className="text-13 leading-4 font-medium text-tertiary">{labels.empty}</p>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  disabled={!canCreateRole}
                  className="text-custom-primary-100 mt-2 cursor-pointer text-13 leading-4 font-medium transition-colors hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline"
                >
                  {labels.createInline}
                </button>
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
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors duration-150",
                    isSelected ? "bg-accent-primary/8 text-accent-primary" : "hover:bg-layer-1-hover"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectRole(role.id)}
                    className="absolute inset-0 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-accent-strong"
                    aria-label={role.name}
                  />
                  <div className="pointer-events-none relative flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ShieldCheck
                        className={cn("size-3.5 shrink-0", isSelected ? "text-accent-primary" : "text-placeholder")}
                      />
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate !text-13 !leading-4 !font-medium",
                          isSelected ? "text-accent-primary" : "text-primary"
                        )}
                      >
                        {role.name}
                      </p>
                    </div>
                    {/* Admin actions — visible on hover */}
                    {!role.is_system && (
                      <div
                        className={cn(
                          "pointer-events-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150",
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
                          disabled={!canEditRole}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 hover:bg-layer-1-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder"
                          aria-label={labels.edit}
                          title={labels.edit}
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(role);
                          }}
                          disabled={!canDeleteRole}
                          className="hover:bg-red-500/10 hover:text-red-600 flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-placeholder"
                          aria-label={labels.delete}
                          title={labels.delete}
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Description */}
                  {role.description?.trim() && (
                    <p className="pointer-events-none relative truncate pl-5 text-13 leading-4 font-medium text-tertiary">
                      {role.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* New Role Button (bottom) */}
      {roles.length > 0 && (
        <div className="shrink-0 border-t border-subtle p-2">
          <Button
            variant="ghost"
            prependIcon={<PlusIcon />}
            onClick={() => setShowCreateModal(true)}
            className="w-full justify-center"
            disabled={!canCreateRole}
          >
            {labels.create}
          </Button>
        </div>
      )}

      {/* Modals */}
      <RoleFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
        labels={labels.form}
      />
      <RoleFormModal
        isOpen={Boolean(editingRole)}
        role={editingRole}
        onClose={() => setEditingRole(null)}
        onSubmit={handleUpdate}
        labels={labels.form}
      />
      <AlertModalCore
        isOpen={!!pendingDelete}
        handleClose={closeDeleteModal}
        handleSubmit={handleConfirmDelete}
        isSubmitting={isDeleteSubmitting}
        title={labels.deleteConfirmTitle}
        content={pendingDelete ? labels.deleteConfirmDescription(pendingDelete.name) : null}
        secondaryButtonText={labels.cancel}
        primaryButtonText={{ default: labels.delete, loading: labels.deleting }}
      />
    </div>
  );
}
