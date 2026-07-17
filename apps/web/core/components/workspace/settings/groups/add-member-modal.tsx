/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { IWorkspaceGroupMember } from "@plane/types";
import { Avatar, Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
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
  onAdd: (memberIds: string[]) => Promise<{
    succeededIds: string[];
    failures: { targetId: string; message: string }[];
  }>;
};

export function AddMemberModal({ isOpen, memberOptions, existingMembers, onClose, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIds(new Set());
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const existingMemberIds = useMemo(() => new Set(existingMembers.map((m) => m.member)), [existingMembers]);

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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((option) => next.delete(option.memberId));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...filtered.map((option) => option.memberId)]));
    }
  };

  const handleAdd = async () => {
    if (selectedCount === 0) return;
    setIsAdding(true);
    try {
      const result = await onAdd(Array.from(selectedIds));
      if (result.failures.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "成员已添加",
          message: `已将 ${result.succeededIds.length} 位成员加入团队`,
        });
        onClose();
        return;
      }

      setSelectedIds(new Set(result.failures.map((failure) => failure.targetId)));
      setToast({
        type: result.succeededIds.length > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
        title: result.succeededIds.length > 0 ? "部分成员添加成功" : "添加成员失败",
        message:
          result.succeededIds.length > 0
            ? `已添加 ${result.succeededIds.length} 位，${result.failures.length} 位添加失败，请重试`
            : result.failures[0]?.message || "请稍后重试",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={isAdding ? undefined : onClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XXL}
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <h3 className="text-body-lg-medium min-w-0 flex-1 pt-0.5 text-primary">添加成员</h3>
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
          <div className="focus-within:bg-surface-0 flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 transition-colors duration-150 focus-within:border-[var(--color-border-medium)]">
            <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索成员姓名或邮箱..."
              className="min-w-0 flex-1 bg-transparent text-body-sm-regular text-primary outline-none placeholder:text-placeholder"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="shrink-0 cursor-pointer text-placeholder transition-colors duration-150 hover:text-secondary"
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
          <label
            htmlFor="workspace-group-select-all-members"
            className="mx-5 mb-1 flex cursor-pointer items-center gap-3 rounded-md bg-surface-1 px-3 py-2"
          >
            <Checkbox
              id="workspace-group-select-all-members"
              checked={isAllSelected}
              indeterminate={isIndeterminate}
              onChange={toggleAll}
            />
            <span className="text-body-sm-medium text-secondary select-none">全选（{filtered.length} 人）</span>
          </label>
        )}

        {/* Member list — 使用 vertical-scrollbar + scrollbar-sm 显示可见滚动条（见 packages/tailwind-config/index.css） */}
        <div className="vertical-scrollbar scrollbar-sm max-h-[min(52vh,30rem)] px-5 pr-3 [scrollbar-gutter:stable]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <svg
                viewBox="0 0 40 40"
                fill="none"
                className="size-10 text-placeholder"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="18" cy="18" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M26 26l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-body-sm-regular text-tertiary">
                {search ? `没有匹配"${search}"的成员` : "所有工作区成员均已在团队中"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {filtered.map((opt) => {
                const isSelected = selectedIds.has(opt.memberId);
                return (
                  <label
                    key={opt.memberId}
                    htmlFor={`workspace-group-member-${opt.memberId}`}
                    className={cn(
                      "-mx-2 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-150",
                      isSelected ? "bg-accent-primary/5" : "hover:bg-surface-1"
                    )}
                  >
                    {/* Checkbox */}
                    <Checkbox
                      id={`workspace-group-member-${opt.memberId}`}
                      checked={isSelected}
                      onChange={() => toggleMember(opt.memberId)}
                    />

                    {/* Avatar + Info */}
                    <Avatar name={opt.displayName} src={opt.avatarUrl} size={28} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm-medium text-primary">{opt.displayName}</p>
                      {opt.email && <p className="truncate text-body-xs-regular text-tertiary">{opt.email}</p>}
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <span className="shrink-0 rounded-full bg-accent-primary/10 px-2 py-0.5 text-[11px] font-medium text-accent-primary">
                        已选
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between border-t border-subtle px-5 py-4">
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
              <span className="text-body-sm-regular text-tertiary">请选择要加入团队的成员</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isAdding}>
              取消
            </Button>
            <Button variant="primary" onClick={handleAdd} loading={isAdding} disabled={selectedCount === 0 || isAdding}>
              添加{selectedCount > 0 ? ` ${selectedCount} 位成员` : ""}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
