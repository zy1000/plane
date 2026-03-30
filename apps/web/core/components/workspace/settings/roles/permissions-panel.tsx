/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck, Building2, FolderKanban, Search, CheckSquare, Square, MinusSquare } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import type { IPermission, IWorkspaceRole } from "@plane/types";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";

type Props = {
  role: IWorkspaceRole | null;
  permissions: IPermission[];
  permissionKeys: string[];
  isLoading: boolean;
  isAdmin: boolean;
  searchQuery: string;
  onTogglePermission: (roleId: string, permissionKey: string) => Promise<void>;
};

type TScope = "workspace" | "project";

type TCategoryGroup = {
  category: string;
  permissions: IPermission[];
  boundCount: number;
};

type TScopeGroup = {
  scope: TScope;
  label: string;
  icon: typeof Building2;
  categories: TCategoryGroup[];
  totalPermissions: number;
  totalBound: number;
};

type TSearchResultCategory = { category: string; permissions: IPermission[] };
type TSearchResultScope = {
  scope: TScope;
  label: string;
  icon: typeof Building2;
  categories: TSearchResultCategory[];
  total: number;
};

const SCOPE_CONFIG: Record<TScope, { label: string; icon: typeof Building2 }> = {
  workspace: { label: "工作区", icon: Building2 },
  project: { label: "项目", icon: FolderKanban },
};

export function PermissionsPanel({
  role,
  permissions,
  permissionKeys,
  isLoading,
  isAdmin,
  searchQuery,
  onTogglePermission,
}: Props) {
  const { t } = useTranslation();
  const [activeScope, setActiveScope] = useState<TScope>("workspace");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const isSearching = searchQuery.trim().length > 0;

  const boundKeySet = useMemo(() => new Set(permissionKeys), [permissionKeys]);

  const scopeGroups = useMemo<TScopeGroup[]>(() => {
    const scopeMap = new Map<TScope, Map<string, IPermission[]>>();
    for (const perm of permissions) {
      const scope = (perm.scope ?? "workspace") as TScope;
      if (!scopeMap.has(scope)) scopeMap.set(scope, new Map());
      const catMap = scopeMap.get(scope)!;
      const cat = perm.category ?? "其他";
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(perm);
    }
    return (["workspace", "project"] as TScope[]).map((scope) => {
      const catMap = scopeMap.get(scope) ?? new Map<string, IPermission[]>();
      const categories: TCategoryGroup[] = Array.from(catMap.entries()).map(([category, perms]) => ({
        category,
        permissions: perms,
        boundCount: perms.filter((p) => boundKeySet.has(p.key)).length,
      }));
      return {
        scope,
        ...SCOPE_CONFIG[scope],
        categories,
        totalPermissions: categories.reduce((sum, c) => sum + c.permissions.length, 0),
        totalBound: categories.reduce((sum, c) => sum + c.boundCount, 0),
      };
    });
  }, [permissions, boundKeySet]);

  // 只展示有权限数据的 scope tab
  const visibleScopeGroups = useMemo(
    () => scopeGroups.filter((g) => g.totalPermissions > 0),
    [scopeGroups]
  );

  // 当 permissions 变化（角色切换）时，自动切到第一个有数据的 scope
  const prevRoleId = useRef<string | null>(null);
  useEffect(() => {
    const roleId = role?.id ?? null;
    if (roleId !== prevRoleId.current && visibleScopeGroups.length > 0) {
      setActiveScope(visibleScopeGroups[0].scope);
      setActiveCategory(null);
      prevRoleId.current = roleId;
    }
  }, [role?.id, visibleScopeGroups]);

  const currentScopeGroup = useMemo(
    () => scopeGroups.find((g) => g.scope === activeScope) ?? null,
    [scopeGroups, activeScope]
  );

  // Derive effective active category; returns stable string so it doesn't fluctuate
  // when only boundCount changes (permission toggle).
  const effectiveActiveCategory = useMemo<string | null>(() => {
    const cats = currentScopeGroup?.categories ?? [];
    if (cats.length === 0) return null;
    if (activeCategory && cats.find((c) => c.category === activeCategory)) return activeCategory;
    return cats[0].category;
  }, [currentScopeGroup, activeCategory]);

  const activeCategoryGroup = useMemo<TCategoryGroup | null>(
    () =>
      currentScopeGroup && effectiveActiveCategory
        ? (currentScopeGroup.categories.find((c) => c.category === effectiveActiveCategory) ?? null)
        : null,
    [currentScopeGroup, effectiveActiveCategory]
  );

  // Cross-scope search results (only visible scopes, grouped scope → category)
  const crossScopeResults = useMemo<TSearchResultScope[]>(() => {
    if (!isSearching) return [];
    const query = searchQuery.toLowerCase();
    return visibleScopeGroups
      .map((group) => {
        const categories = group.categories
          .map(({ category, permissions: perms }) => ({
            category,
            permissions: perms.filter(
              (p) =>
                p.name.toLowerCase().includes(query) ||
                p.key.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            ),
          }))
          .filter((c) => c.permissions.length > 0);
        return {
          scope: group.scope,
          label: group.label,
          icon: group.icon,
          categories,
          total: categories.reduce((sum, c) => sum + c.permissions.length, 0),
        };
      })
      .filter((g) => g.categories.length > 0);
  }, [isSearching, scopeGroups, searchQuery]);

  const totalSearchHits = useMemo(
    () => crossScopeResults.reduce((sum, g) => sum + g.total, 0),
    [crossScopeResults]
  );

  // Per-category match counts for the left nav during search (current scope only)
  const categoryMatchCounts = useMemo<Map<string, number>>(() => {
    if (!isSearching || !currentScopeGroup) return new Map();
    const query = searchQuery.toLowerCase();
    return new Map(
      currentScopeGroup.categories.map(({ category, permissions: perms }) => [
        category,
        perms.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.key.toLowerCase().includes(query) ||
            (p.description && p.description.toLowerCase().includes(query))
        ).length,
      ])
    );
  }, [isSearching, currentScopeGroup, searchQuery]);

  const handleTogglePermission = useCallback(
    async (permissionKey: string) => {
      if (!role || !isAdmin || togglingKey) return;
      setTogglingKey(permissionKey);
      try {
        await onTogglePermission(role.id, permissionKey);
      } catch (err: unknown) {
        if (isProjectPermissionError(err)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          const msg = err instanceof Error ? err.message : "更新权限失败";
          setToast({ type: TOAST_TYPE.ERROR, title: "失败", message: msg });
        }
      } finally {
        setTogglingKey(null);
      }
    },
    [role, isAdmin, togglingKey, onTogglePermission, t]
  );

  const handleToggleCategoryAll = useCallback(
    async (categoryPerms: IPermission[]) => {
      if (!role || !isAdmin || togglingKey) return;
      const allBound = categoryPerms.every((p) => boundKeySet.has(p.key));
      const targetPerms = allBound
        ? categoryPerms.filter((p) => boundKeySet.has(p.key))
        : categoryPerms.filter((p) => !boundKeySet.has(p.key));
      for (const perm of targetPerms) {
        setTogglingKey(perm.key);
        try {
          await onTogglePermission(role.id, perm.key);
        } catch (err: unknown) {
          if (isProjectPermissionError(err)) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
              message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
                ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
                : undefined,
            });
          } else {
            setToast({ type: TOAST_TYPE.ERROR, title: "失败", message: "更新权限失败" });
          }
          break;
        }
      }
      setTogglingKey(null);
    },
    [role, isAdmin, togglingKey, boundKeySet, onTogglePermission, t]
  );

  // --- Empty state: no role selected ---
  if (!role) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-layer-1">
          <ShieldCheck className="size-5 text-placeholder" />
        </div>
        <p className="text-body-sm-regular text-tertiary">请在左侧选择一个角色以管理其权限</p>
      </div>
    );
  }

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 gap-1 border-b border-subtle px-5 pt-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-9 w-20 animate-pulse rounded-t-md bg-layer-transparent-hover" />
          ))}
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex w-48 shrink-0 flex-col gap-1 border-r border-subtle p-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md px-3 py-2.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-layer-transparent-hover" />
                <div className="mt-1 h-0.5 w-full animate-pulse rounded-full bg-layer-transparent-hover" />
              </div>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-2 p-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-layer-transparent-hover" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Empty permissions ---
  if (permissions.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 py-16 px-6 text-center">
        <div className="flex size-10 items-center justify-center rounded-full border border-dashed border-subtle">
          <ShieldCheck className="size-4 text-placeholder" />
        </div>
        <p className="text-body-sm-medium text-secondary">暂无可用权限</p>
      </div>
    );
  }

  const activeCatAllBound =
    !!activeCategoryGroup &&
    activeCategoryGroup.permissions.length > 0 &&
    activeCategoryGroup.boundCount === activeCategoryGroup.permissions.length;
  const activeCatSomeBound =
    !!activeCategoryGroup &&
    activeCategoryGroup.boundCount > 0 &&
    activeCategoryGroup.boundCount < activeCategoryGroup.permissions.length;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {/* ── Scope Tabs（仅展示有数据的 scope）── */}
      <div className="flex shrink-0 items-end gap-0 border-b border-subtle px-5">
        {visibleScopeGroups.map((group) => {
          const isActive = activeScope === group.scope;
          const Icon = group.icon;
          return (
            <button
              key={group.scope}
              type="button"
              onClick={() => setActiveScope(group.scope)}
              className={cn(
                "relative flex cursor-pointer items-center gap-1.5 px-3.5 py-2.5 text-body-xs-medium transition-colors duration-150",
                isActive ? "text-primary" : "text-tertiary hover:text-secondary"
              )}
            >
              <Icon className="size-3.5" />
              <span>{group.label}</span>
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums",
                  isActive ? "bg-accent-primary/10 text-accent-primary" : "bg-layer-1 text-tertiary"
                )}
              >
                {isSearching
                  ? `${(crossScopeResults.find((g) => g.scope === group.scope)?.total ?? 0)} 项`
                  : `${group.totalBound}/${group.totalPermissions}`}
              </span>
              {isActive && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full bg-accent-primary" />
              )}
            </button>
          );
        })}

        {/* Search hint */}
        {isSearching && (
          <span className="ml-auto self-center pr-1 text-[11px] text-tertiary">
            全部 <span className="font-medium text-primary tabular-nums">{totalSearchHits}</span> 项
          </span>
        )}
      </div>

      {/* ── Two-Pane Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: Category Nav */}
        <div className="vertical-scrollbar scrollbar-sm flex w-[196px] shrink-0 flex-col overflow-y-auto border-r border-subtle py-2 [scrollbar-gutter:stable]">
          {!currentScopeGroup || currentScopeGroup.categories.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-tertiary">暂无分类</p>
          ) : (
            currentScopeGroup.categories.map(({ category, permissions: catPerms, boundCount }) => {
              const isActive = !isSearching && effectiveActiveCategory === category;
              const matchCount = isSearching ? (categoryMatchCounts.get(category) ?? 0) : null;
              const hasNoMatch = isSearching && matchCount === 0;
              const allBound = catPerms.length > 0 && boundCount === catPerms.length;
              const progressScale = catPerms.length > 0 ? Math.min(boundCount / catPerms.length, 1) : 0;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={cn(
                    "group relative mx-2 flex cursor-pointer flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-all duration-150",
                    isActive ? "bg-accent-primary/8" : "hover:bg-layer-1-hover",
                    hasNoMatch && "opacity-35"
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-accent-primary" />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-body-xs-medium",
                        isActive ? "text-accent-primary" : "text-primary"
                      )}
                    >
                      {category}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-[10px]",
                        isSearching
                          ? matchCount && matchCount > 0
                            ? "font-medium text-accent-primary"
                            : "text-tertiary"
                          : isActive
                            ? allBound
                              ? "text-success-primary"
                              : "text-accent-primary/70"
                            : "text-tertiary"
                      )}
                    >
                      {isSearching ? `${matchCount}` : `${boundCount}/${catPerms.length}`}
                    </span>
                  </div>
                  {!isSearching && (
                    <div
                      className={cn(
                        "relative h-1 w-full overflow-hidden rounded-full",
                        allBound ? "bg-success-subtle" : "bg-layer-1"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-300",
                          allBound
                            ? "bg-success-primary"
                            : boundCount > 0
                              ? isActive
                                ? "bg-accent-primary"
                                : "bg-accent-primary/50"
                              : "bg-transparent"
                        )}
                        style={{ transform: `scaleX(${progressScale})` }}
                      />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Right: Search Results OR Category Detail */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {isSearching ? (
            /* ── Cross-scope Search Results ── */
            <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-5 pb-5 [scrollbar-gutter:stable]">
              {crossScopeResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-2 flex size-9 items-center justify-center rounded-full bg-layer-1">
                    <Search className="size-4 text-placeholder" />
                  </div>
                  <p className="text-body-xs-regular text-tertiary">没有匹配的权限项</p>
                </div>
              ) : (
                <div className="flex flex-col gap-5 pt-4">
                  {crossScopeResults.map(({ scope, label, icon: Icon, categories }) => (
                    <div key={scope}>
                      {/* Scope divider */}
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className="size-3.5 text-tertiary" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
                          {label}
                        </span>
                        <div className="h-px flex-1 bg-subtle" />
                      </div>

                      {/* Categories under this scope */}
                      <div className="flex flex-col gap-3">
                        {categories.map(({ category, permissions: matchedPerms }) => (
                          <div key={category}>
                            <p className="mb-1 px-1 text-[10px] font-medium text-tertiary">{category}</p>
                            <ul className="overflow-hidden rounded-lg border border-subtle">
                              {matchedPerms.map((perm) => {
                                const isBound = boundKeySet.has(perm.key);
                                const isToggling = togglingKey === perm.key;
                                return (
                                  <li
                                    key={perm.key}
                                    className={cn(
                                      "group flex items-center gap-3 px-3 py-2.5 transition-colors duration-150",
                                      "border-b border-subtle/60 last:border-0",
                                      isAdmin && !isToggling && "cursor-pointer hover:bg-layer-1-hover",
                                      isToggling && "opacity-50",
                                      isBound && "bg-accent-primary/4"
                                    )}
                                    onClick={() => handleTogglePermission(perm.key)}
                                  >
                                    <div className="flex size-4 shrink-0 items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={isBound}
                                        readOnly
                                        disabled={!isAdmin || Boolean(togglingKey)}
                                        className="size-3.5 cursor-pointer rounded border-subtle accent-accent-primary"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => handleTogglePermission(perm.key)}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className={cn(
                                          "text-body-xs-medium",
                                          isBound ? "text-primary" : "text-secondary"
                                        )}
                                      >
                                        {perm.name}
                                      </p>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !activeCategoryGroup ? (
            /* ── No category selected ── */
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-body-xs-regular text-tertiary">请在左侧选择一个分类</p>
            </div>
          ) : (
            /* ── Normal Category Detail ── */
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-subtle px-5 py-3">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-body-xs-semibold text-primary">
                    {activeCategoryGroup.category}
                  </h4>
                  <p className="text-[11px] tabular-nums text-tertiary">
                    已启用 {activeCategoryGroup.boundCount} / {activeCategoryGroup.permissions.length} 项权限
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => void handleToggleCategoryAll(activeCategoryGroup.permissions)}
                    disabled={Boolean(togglingKey)}
                    className={cn(
                      "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150",
                      activeCatAllBound
                        ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                        : activeCatSomeBound
                          ? "border-accent-primary/20 bg-accent-primary/5 text-accent-primary hover:bg-accent-primary/10"
                          : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1-hover",
                      togglingKey && "pointer-events-none opacity-50"
                    )}
                  >
                    {activeCatAllBound ? (
                      <CheckSquare className="size-3.5" />
                    ) : activeCatSomeBound ? (
                      <MinusSquare className="size-3.5" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                    <span>{activeCatAllBound ? "取消全选" : "全选"}</span>
                  </button>
                )}
              </div>

              <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto px-5 pb-5 [scrollbar-gutter:stable]">
                <ul className="flex flex-col gap-0.5 pt-2">
                  {activeCategoryGroup.permissions.map((perm) => {
                    const isBound = boundKeySet.has(perm.key);
                    const isToggling = togglingKey === perm.key;
                    return (
                      <li
                        key={perm.key}
                        className={cn(
                          "group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150",
                          isAdmin && !isToggling && "cursor-pointer hover:bg-layer-1-hover",
                          isToggling && "opacity-50",
                          isBound && "bg-accent-primary/4"
                        )}
                        onClick={() => handleTogglePermission(perm.key)}
                      >
                        <div className="flex size-4 shrink-0 items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isBound}
                            readOnly
                            disabled={!isAdmin || Boolean(togglingKey)}
                            className="size-3.5 cursor-pointer rounded border-subtle accent-accent-primary"
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => handleTogglePermission(perm.key)}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-body-xs-medium transition-colors duration-150",
                              isBound ? "text-primary" : "text-secondary"
                            )}
                          >
                            {perm.name}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
