/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import type { TIssueTypeCategory } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { IssueTypeCategoryFormModal } from "./issue-type-category-form-modal";

type Props = {
  categories: TIssueTypeCategory[];
  isLoading: boolean;
  isAdmin: boolean;
  onCreate: (data: Partial<TIssueTypeCategory>) => Promise<TIssueTypeCategory>;
  onUpdate: (categoryId: string, data: Partial<TIssueTypeCategory>) => Promise<TIssueTypeCategory>;
  onDelete: (categoryId: string) => Promise<void>;
};

export function IssueTypeCategoriesList({ categories, isLoading, isAdmin, onCreate, onUpdate, onDelete }: Props) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TIssueTypeCategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TIssueTypeCategory | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const handleCreate = async (data: { name: string; description: string }) => {
    const created = await onCreate({ name: data.name, description: data.description || null });
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已创建", message: `类别「${created.name}」已创建` });
  };

  const handleUpdate = async (data: { name: string; description: string }) => {
    if (!editingCategory) return;
    const updated = await onUpdate(editingCategory.id, { name: data.name, description: data.description || null });
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: `类别「${updated.name}」已更新` });
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
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已删除", message: `类别「${pendingDelete.name}」已删除` });
      closeDeleteModal();
    } catch (error: unknown) {
      const errObj = error as Record<string, string | undefined>;
      const msg = errObj?.msg ?? errObj?.detail ?? "删除失败，请稍后重试";
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: String(msg) });
      setIsDeleteSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
          <div className="h-4 w-24 animate-pulse rounded bg-layer-transparent-hover" />
          <div className="h-8 w-20 animate-pulse rounded bg-layer-transparent-hover" />
        </div>
        <div className="divide-y divide-subtle">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="h-4 w-32 animate-pulse rounded bg-layer-transparent-hover" />
              <div className="h-4 flex-1 animate-pulse rounded bg-layer-transparent-hover" />
              <div className="h-4 w-12 animate-pulse rounded bg-layer-transparent-hover" />
              <div className="h-4 w-16 animate-pulse rounded bg-layer-transparent-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full overflow-hidden rounded-lg border border-subtle bg-surface-1">
        {/* Table Header */}
        <div className="flex items-center justify-between border-b border-subtle px-6 py-4">
          <h3 className="text-body-sm-medium text-primary">
            工作项类别
            <span className="ml-2 text-caption-md-regular text-tertiary">({categories.length})</span>
          </h3>
          {isAdmin && (
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowCreateModal(true)}
              prependIcon={<Plus className="size-3.5" />}
            >
              新建类别
            </Button>
          )}
        </div>

        {/* Column labels */}
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_80px_80px] items-center gap-4 border-b border-subtle bg-surface-2 px-6 py-2.5 text-caption-md-medium text-tertiary">
          <span>名称</span>
          <span>描述</span>
          <span>类型</span>
          {isAdmin && <span className="text-right">操作</span>}
        </div>

        {/* Rows */}
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-layer-1">
              <Layers className="size-5 text-placeholder" />
            </div>
            <p className="text-body-sm-medium text-tertiary">暂无工作项类别</p>
            <p className="mt-1 text-caption-sm-regular text-placeholder">
              {isAdmin ? "点击右上角「新建类别」开始创建" : "当前工作区尚未配置工作项类别"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {categories.map((category) => (
              <div
                key={category.id}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_80px_80px] items-center gap-4 px-6 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span className="truncate text-body-sm-medium text-primary">{category.name}</span>
                <span className="truncate text-body-sm-regular text-tertiary">
                  {category.description || <span className="text-placeholder">—</span>}
                </span>
                <span>
                  {category.is_system ? (
                    <span className="inline-flex items-center rounded-full bg-accent-primary/10 px-2 py-0.5 text-caption-sm-medium text-accent-primary">
                      系统
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-layer-1 px-2 py-0.5 text-caption-sm-medium text-tertiary">
                      自定义
                    </span>
                  )}
                </span>
                {isAdmin && (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingCategory(category)}
                      disabled={category.is_system}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors hover:bg-layer-1-hover hover:text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                      title={category.is_system ? "系统类别不可编辑" : "编辑"}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(category)}
                      disabled={category.is_system}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors hover:bg-danger-primary/10 hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-40"
                      title={category.is_system ? "系统类别不可删除" : "删除"}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <IssueTypeCategoryFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreate}
      />
      <IssueTypeCategoryFormModal
        isOpen={Boolean(editingCategory)}
        category={editingCategory}
        onClose={() => setEditingCategory(null)}
        onSubmit={handleUpdate}
      />
      <AlertModalCore
        isOpen={!!pendingDelete}
        handleClose={closeDeleteModal}
        handleSubmit={handleConfirmDelete}
        isSubmitting={isDeleteSubmitting}
        title="删除此类别？"
        content={
          pendingDelete ? (
            <>
              确定要删除类别{" "}
              <span className="font-semibold text-primary">「{pendingDelete.name}」</span>{" "}
              吗？此操作不可恢复。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "删除", loading: "删除中…" }}
      />
    </>
  );
}
