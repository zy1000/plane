/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ShieldCheck, XIcon } from "lucide-react";
import type { IWorkspaceGroupRole, IWorkspaceRole } from "@plane/types";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  isOpen: boolean;
  availableRoles: IWorkspaceRole[];
  existingRoles: IWorkspaceGroupRole[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
  onAdd: (roleIds: string[]) => Promise<{
    succeededIds: string[];
    failures: { targetId: string; message: string }[];
  }>;
};

const getPermissionCount = (role: IWorkspaceRole) => {
  if (!role.permissions || typeof role.permissions !== "object") return 0;
  const permissionKeys = role.permissions.permission_keys;
  return Array.isArray(permissionKeys) ? permissionKeys.filter((key) => typeof key === "string").length : 0;
};

export function AddRoleModal({
  isOpen,
  availableRoles,
  existingRoles,
  isLoading,
  error,
  onRetry,
  onClose,
  onAdd,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedIds(new Set());
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const existingRoleIds = useMemo(() => new Set(existingRoles.map((groupRole) => groupRole.role)), [existingRoles]);
  const filteredRoles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return availableRoles.filter(
      (role) =>
        !existingRoleIds.has(role.id) &&
        (!normalizedQuery ||
          role.name.toLowerCase().includes(normalizedQuery) ||
          role.description?.toLowerCase().includes(normalizedQuery))
    );
  }, [availableRoles, existingRoleIds, searchQuery]);

  const toggleRole = (roleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    try {
      const result = await onAdd([...selectedIds]);
      if (result.failures.length === 0) {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "角色已添加",
          message: `已为团队分配 ${result.succeededIds.length} 个角色`,
        });
        onClose();
        return;
      }

      setSelectedIds(new Set(result.failures.map((failure) => failure.targetId)));
      setToast({
        type: result.succeededIds.length > 0 ? TOAST_TYPE.WARNING : TOAST_TYPE.ERROR,
        title: result.succeededIds.length > 0 ? "部分角色添加成功" : "添加角色失败",
        message:
          result.succeededIds.length > 0
            ? `已添加 ${result.succeededIds.length} 个，${result.failures.length} 个添加失败，请重试`
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
      width={EModalWidth.XL}
    >
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <h3 className="text-body-lg-medium text-primary">添加团队角色</h3>
            <p className="mt-1 text-13 leading-5 text-secondary">所选角色的权限将自动授予团队中的全部成员。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isAdding}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-placeholder hover:bg-layer-1-hover hover:text-primary disabled:opacity-50"
            aria-label="关闭"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 focus-within:border-accent-strong">
            <SearchIcon className="size-3.5 shrink-0 text-placeholder" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索角色名称或描述"
              className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex size-5 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary"
                aria-label="清除角色搜索"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div className="vertical-scrollbar scrollbar-sm max-h-[min(52vh,32rem)] min-h-64 overflow-y-auto border-y border-subtle px-5 [scrollbar-gutter:stable]">
          {isLoading ? (
            <div className="divide-y divide-subtle">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 py-3">
                  <div className="size-4 rounded bg-layer-transparent-hover" />
                  <div className="size-9 rounded-lg bg-layer-transparent-hover" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="h-3.5 w-28 rounded bg-layer-transparent-hover" />
                    <div className="h-3 w-48 rounded bg-layer-transparent-hover" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <RotateCcw className="mb-3 size-5 text-danger-primary" />
              <p className="text-13 font-medium text-primary">可用角色加载失败</p>
              <p className="mt-1 max-w-72 text-13 text-secondary">{error}</p>
              <Button variant="secondary" className="mt-4" prependIcon={<RotateCcw />} onClick={onRetry}>
                重新加载
              </Button>
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <ShieldCheck className="mb-3 size-6 text-placeholder" />
              <p className="text-13 font-medium text-primary">
                {searchQuery ? "没有匹配的角色" : availableRoles.length === 0 ? "暂无可用角色" : "所有角色均已分配"}
              </p>
              <p className="mt-1 text-13 text-secondary">
                {searchQuery ? "尝试更换搜索关键词。" : "可以前往权限设置创建新的工作区角色。"}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-subtle">
              {filteredRoles.map((role) => {
                const isSelected = selectedIds.has(role.id);
                return (
                  <li key={role.id}>
                    <label
                      htmlFor={`workspace-group-role-${role.id}`}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-3 text-left transition-colors",
                        isSelected ? "bg-accent-subtle" : "hover:bg-layer-1-hover"
                      )}
                    >
                      <Checkbox
                        id={`workspace-group-role-${role.id}`}
                        checked={isSelected}
                        onChange={() => toggleRole(role.id)}
                      />
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1 text-secondary">
                        <ShieldCheck className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-13 font-medium text-primary">{role.name}</p>
                          {role.is_system && (
                            <span className="rounded-md bg-layer-1 px-1.5 py-0.5 text-11 text-secondary">系统角色</span>
                          )}
                          <span className="text-11 text-tertiary tabular-nums">{getPermissionCount(role)} 项权限</span>
                        </div>
                        <p className="mt-0.5 truncate text-13 text-secondary">
                          {role.description?.trim() || "暂无角色描述"}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <p className="text-13 text-secondary">
            {selectedIds.size > 0 ? `已选择 ${selectedIds.size} 个角色` : "请选择要分配的角色"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isAdding}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              loading={isAdding}
              disabled={selectedIds.size === 0 || isAdding}
            >
              添加{selectedIds.size > 0 ? ` ${selectedIds.size} 个角色` : ""}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
