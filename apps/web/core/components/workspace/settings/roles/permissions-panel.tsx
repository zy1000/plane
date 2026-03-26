/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import type { IPermission, IWorkspaceRole } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";

type Props = {
  role: IWorkspaceRole | null;
  permissions: IPermission[];
  permissionKeys: string[];
  isLoading: boolean;
  isAdmin: boolean;
  onTogglePermission: (roleId: string, permissionKey: string) => Promise<void>;
};

type TCategoryGroup = {
  category: string;
  permissions: IPermission[];
};

export function PermissionsPanel({ role, permissions, permissionKeys, isLoading, isAdmin, onTogglePermission }: Props) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  // Group permissions by category
  const categoryGroups = useMemo<TCategoryGroup[]>(() => {
    const map = new Map<string, IPermission[]>();
    for (const perm of permissions) {
      const cat = perm.category ?? "其他";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(perm);
    }
    return Array.from(map.entries()).map(([category, perms]) => ({ category, permissions: perms }));
  }, [permissions]);

  const boundKeySet = useMemo(() => new Set(permissionKeys), [permissionKeys]);

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleTogglePermission = async (permissionKey: string) => {
    if (!role || !isAdmin || togglingKey) return;
    setTogglingKey(permissionKey);
    try {
      await onTogglePermission(role.id, permissionKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "更新权限失败";
      setToast({ type: TOAST_TYPE.ERROR, title: "失败", message: msg });
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-subtle px-5 py-3.5">
        <h3 className="text-body-sm-semibold text-primary">
          权限
          {!isLoading && role && (
            <span className="ml-1.5 text-body-xs-regular text-tertiary">
              ({permissionKeys.length}/{permissions.length})
            </span>
          )}
        </h3>
      </div>

      {/* Content */}
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!role ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-layer-1">
              <ShieldCheck className="size-5 text-placeholder" />
            </div>
            <p className="text-body-sm-regular text-tertiary">请在左侧选择一个角色以管理其权限</p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col divide-y divide-subtle">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="px-5 py-4">
                <div className="mb-3 h-4 w-32 animate-pulse rounded bg-layer-transparent-hover" />
                <div className="flex flex-col gap-2.5">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="size-4 shrink-0 animate-pulse rounded bg-layer-transparent-hover" />
                      <div className="h-3 w-40 animate-pulse rounded bg-layer-transparent-hover" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : permissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
            <div className="flex size-10 items-center justify-center rounded-full border border-dashed border-subtle">
              <ShieldCheck className="size-4 text-placeholder" />
            </div>
            <p className="text-body-sm-medium text-secondary">暂无可用权限</p>
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {categoryGroups.map(({ category, permissions: catPerms }) => {
              const isCollapsed = collapsedCategories.has(category);
              const boundCount = catPerms.filter((p) => boundKeySet.has(p.key)).length;
              return (
                <div key={category}>
                  {/* Category Header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-layer-1-hover"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-body-xs-semibold text-secondary">{category}</span>
                      <span className="rounded-full bg-layer-1 px-1.5 py-0.5 text-[11px] text-tertiary">
                        {boundCount}/{catPerms.length}
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-placeholder transition-transform duration-200",
                        isCollapsed && "-rotate-90"
                      )}
                    />
                  </button>

                  {/* Permissions List */}
                  {!isCollapsed && (
                    <ul className="border-t border-subtle bg-canvas px-5 py-2">
                      {catPerms.map((perm) => {
                        const isBound = boundKeySet.has(perm.key);
                        const isToggling = togglingKey === perm.key;
                        return (
                          <li
                            key={perm.key}
                            className={cn(
                              "flex items-start gap-3 rounded-md px-2 py-2 transition-colors duration-150",
                              isAdmin && !isToggling && "cursor-pointer hover:bg-layer-1-hover",
                              isToggling && "opacity-60"
                            )}
                            onClick={() => handleTogglePermission(perm.key)}
                          >
                            <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                              <input
                                type="checkbox"
                                checked={isBound}
                                readOnly
                                disabled={!isAdmin || Boolean(togglingKey)}
                                className="size-4 cursor-pointer rounded border-subtle accent-accent-primary"
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => handleTogglePermission(perm.key)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-body-xs-medium text-primary">{perm.name}</p>
                              {perm.description && perm.description !== perm.name && (
                                <p className="text-[11px] text-tertiary">{perm.description}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
