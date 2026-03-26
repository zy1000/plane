/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon, UsersRound } from "lucide-react";
import type { IWorkspaceGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { CountChip } from "@/components/common/count-chip";
import { GroupFormModal } from "./group-form-modal";

type Props = {
  groups: IWorkspaceGroup[];
  totalGroupCount: number;
  isLoading: boolean;
  isAdmin: boolean;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
  onCreate: (data: { name: string; description: string }) => Promise<IWorkspaceGroup>;
  onUpdate: (groupId: string, data: { name: string; description: string }) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
};

export function GroupsSidebar({
  groups,
  totalGroupCount,
  isLoading,
  isAdmin,
  selectedGroupId,
  onSelectGroup,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<IWorkspaceGroup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IWorkspaceGroup | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const filteredGroups = searchQuery.trim()
    ? groups.filter(
        (g) =>
          g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : groups;

  const isSearchNoResults = filteredGroups.length === 0 && totalGroupCount > 0;

  const handleCreate = async (data: { name: string; description: string }) => {
    const newGroup = await onCreate(data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已创建", message: `团队「${newGroup.name}」已创建` });
    onSelectGroup(newGroup.id);
  };

  const handleUpdate = async (data: { name: string; description: string }) => {
    if (!editingGroup) return;
    await onUpdate(editingGroup.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "团队信息已更新" });
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
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已删除", message: `团队「${pendingDelete.name}」已删除` });
      closeDeleteModal();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
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
          <h4 className="flex items-center gap-2 text-body-sm-semibold text-primary">
            团队
            <CountChip count={totalGroupCount} className="h-4" />
          </h4>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200 hover:bg-layer-1-hover hover:text-primary"
              aria-label="新建团队"
              title="新建团队"
            >
              <PlusIcon className="size-3.5" />
            </button>
          )}
        </div>
        {/* Search */}
        <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 border-none bg-transparent text-body-xs-regular outline-none placeholder:text-placeholder"
            placeholder="搜索团队..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Groups List */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-1.5 [scrollbar-gutter:stable]">
        {filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-layer-1">
              <UsersRound className="size-4 text-placeholder" />
            </div>
            {isSearchNoResults ? (
              <p className="text-body-xs-regular text-tertiary">没有匹配的团队</p>
            ) : (
              <>
                <p className="text-body-xs-regular text-tertiary">暂无团队</p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="mt-2 cursor-pointer text-body-xs-medium text-custom-primary-100 transition-colors hover:underline"
                  >
                    点击新建
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filteredGroups.map((group) => {
              const isSelected = selectedGroupId === group.id;
              return (
                <li
                  key={group.id}
                  onClick={() => onSelectGroup(group.id)}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors duration-150",
                    isSelected
                      ? "bg-accent-primary/8 text-accent-primary"
                      : "hover:bg-layer-1-hover"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "min-w-0 flex-1 truncate text-body-xs-semibold",
                        isSelected ? "text-accent-primary" : "text-primary"
                      )}
                    >
                      {group.name}
                    </p>
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
                            setEditingGroup(group);
                          }}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 hover:bg-layer-1-hover hover:text-primary"
                          aria-label="编辑团队"
                          title="编辑"
                        >
                          <PencilIcon className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(group);
                          }}
                          className="flex size-5 cursor-pointer items-center justify-center rounded text-placeholder transition-colors duration-150 hover:bg-red-500/10 hover:text-red-600"
                          aria-label="删除团队"
                          title="删除"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Description */}
                  {group.description?.trim() && (
                    <p className="truncate text-body-xs-regular text-tertiary">{group.description}</p>
                  )}
                  {/* Member / Role counts */}
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-tertiary">
                      <UsersRound className="size-2.5" />
                      {group.member_count}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-tertiary">
                      <svg viewBox="0 0 14 14" fill="none" className="size-2.5" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M7 1.5L2 4v3c0 2.76 2.13 5.35 5 5.97C9.87 12.35 12 9.76 12 7V4L7 1.5z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {group.role_count}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* New Group Button (bottom) */}
      {isAdmin && groups.length > 0 && (
        <div className="shrink-0 border-t border-subtle p-2">
          <Button
            variant="primary"
            prependIcon={<PlusIcon />}
            onClick={() => setShowCreateModal(true)}
            className="w-full justify-center"
          >
            新建团队
          </Button>
        </div>
      )}

      {/* Modals */}
      <GroupFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
      <GroupFormModal
        isOpen={Boolean(editingGroup)}
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSubmit={handleUpdate}
      />
      <AlertModalCore
        isOpen={!!pendingDelete}
        handleClose={closeDeleteModal}
        handleSubmit={handleConfirmDelete}
        isSubmitting={isDeleteSubmitting}
        title="删除此团队？"
        content={
          pendingDelete ? (
            <>
              确定要删除团队{" "}
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
