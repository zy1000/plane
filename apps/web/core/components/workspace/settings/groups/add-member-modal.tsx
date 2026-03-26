/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import type { IWorkspaceGroupMember } from "@plane/types";
import { Avatar, Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { XIcon } from "lucide-react";

type TMemberOption = {
  id: string;
  memberId: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
};

type Props = {
  isOpen: boolean;
  memberOptions: TMemberOption[];
  existingMembers: IWorkspaceGroupMember[];
  onClose: () => void;
  onAdd: (memberIds: string[]) => Promise<void>;
};

export function AddMemberModal({ isOpen, memberOptions, existingMembers, onClose, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const existingMemberIds = useMemo(
    () => new Set(existingMembers.map((m) => m.member)),
    [existingMembers]
  );

  const filtered = useMemo(
    () =>
      memberOptions.filter(
        (opt) =>
          !existingMemberIds.has(opt.memberId) &&
          (opt.displayName.toLowerCase().includes(search.toLowerCase()) ||
            opt.email?.toLowerCase().includes(search.toLowerCase()))
      ),
    [memberOptions, existingMemberIds, search]
  );

  const selectedCount = selectedIds.size;
  const isAllSelected = filtered.length > 0 && filtered.every((opt) => selectedIds.has(opt.memberId));
  const isIndeterminate = !isAllSelected && filtered.some((opt) => selectedIds.has(opt.memberId));

  const toggleMember = (memberId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((opt) => opt.memberId)));
    }
  };

  const handleAdd = async () => {
    if (selectedCount === 0) return;
    setIsAdding(true);
    try {
      await onAdd(Array.from(selectedIds));
      onClose();
    } finally {
      setIsAdding(false);
    }
  };

  // 不传 handleClose：点击遮罩 / Escape 不会关闭；通过右上角关闭、取消或添加成功调用 onClose
  return (
    <ModalCore isOpen={isOpen} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="min-w-0 flex-1 text-body-lg-medium text-primary pt-0.5">添加成员</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isAdding}
            className={cn(
              "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-placeholder transition-colors duration-200",
              "hover:bg-layer-1-hover hover:text-secondary",
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong",
              isAdding && "pointer-events-none opacity-50"
            )}
            aria-label="关闭"
          >
            <XIcon className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 transition-colors duration-150 focus-within:border-[var(--color-border-medium)] focus-within:bg-surface-0">
            <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索成员姓名或邮箱..."
              className="min-w-0 flex-1 bg-transparent text-body-sm-regular text-primary outline-none placeholder:text-placeholder"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="shrink-0 text-placeholder hover:text-secondary transition-colors duration-150 cursor-pointer"
              >
                <svg viewBox="0 0 16 16" fill="none" className="size-3.5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Select all row */}
        {filtered.length > 0 && (
          <div
            className="mx-5 mb-1 flex items-center gap-3 rounded-md px-3 py-2 bg-surface-1 cursor-pointer"
            onClick={toggleAll}
          >
            <Checkbox
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onChange={toggleAll}
              onClick={(e) => e.stopPropagation()}
              className="focus:outline-none"
            />
            <span className="text-body-sm-medium text-secondary select-none">
              全选（{filtered.length} 人）
            </span>
          </div>
        )}

        {/* Member list — 使用 vertical-scrollbar + scrollbar-sm 显示可见滚动条（见 packages/tailwind-config/index.css） */}
        <div className="vertical-scrollbar scrollbar-sm max-h-[min(52vh,30rem)] px-5 pr-3 [scrollbar-gutter:stable]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <svg viewBox="0 0 40 40" fill="none" className="size-10 text-placeholder" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M26 26l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-body-sm-regular text-tertiary">
                {search ? `没有匹配"${search}"的成员` : "所有成员均已在组中"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {filtered.map((opt) => {
                const isSelected = selectedIds.has(opt.memberId);
                return (
                  <div
                    key={opt.memberId}
                    onClick={() => toggleMember(opt.memberId)}
                    className={cn(
                      "flex items-center gap-3 py-2.5 rounded-md px-2 -mx-2 cursor-pointer transition-colors duration-150",
                      isSelected ? "bg-accent-primary/5" : "hover:bg-surface-1"
                    )}
                  >
                    {/* Checkbox */}
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleMember(opt.memberId)}
                      onClick={(e) => e.stopPropagation()}
                      className="focus:outline-none"
                    />

                    {/* Avatar + Info */}
                    <Avatar name={opt.displayName} src={opt.avatarUrl} size={28} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm-medium text-primary">{opt.displayName}</p>
                      {opt.email && (
                        <p className="truncate text-body-xs-regular text-tertiary">{opt.email}</p>
                      )}
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-[11px] font-medium text-accent-primary">
                        已选
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-subtle px-5 py-4 mt-2">
          {/* Selection count */}
          <div className="flex items-center gap-2">
            {selectedCount > 0 ? (
              <>
                <span className="flex size-5 items-center justify-center rounded-full bg-accent-primary text-[11px] font-semibold text-on-color">
                  {selectedCount}
                </span>
                <span className="text-body-sm-regular text-secondary">
                  已选 <span className="font-medium text-primary">{selectedCount}</span> 位成员
                </span>
              </>
            ) : (
              <span className="text-body-sm-regular text-tertiary">暂无成员</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isAdding}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              loading={isAdding}
              disabled={selectedCount === 0 || isAdding}
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
