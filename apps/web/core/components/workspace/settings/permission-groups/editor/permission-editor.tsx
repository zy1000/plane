/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { TPermissionCatalogModule, TPermissionScope } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  SCOPE_LABELS,
  filterGroups,
  getActionKeys,
  getActionsInGroups,
  getGroupKeys,
  getModuleKeys,
  getScopeGroups,
  getScopeKeys,
} from "./catalog";
import { BulkActionMenu, CopyFromMenu } from "./toolbar-menus";
import type { TCopySource } from "./toolbar-menus";
import { TypeLimitPopover } from "./type-limit-popover";
import type { TTypeLimitOption } from "./type-limit-popover";
import { usePermissionEditor } from "./use-permission-editor";
import type { TPermissionEditorValue } from "./use-permission-editor";

const TEXT_BUTTON =
  "inline-flex h-8 shrink-0 items-center rounded-md border border-subtle bg-surface-1 px-3 text-13 font-medium text-primary transition-colors hover:bg-layer-1-hover";

type Props = {
  /** 工作区权限组两段都有；项目权限组模板 / 项目权限组只有 project */
  scopes: TPermissionScope[];
  defaultScope?: TPermissionScope;
  value: TPermissionEditorValue;
  onChange: (next: TPermissionEditorValue) => void;
  /** 类型限定弹层的候选类型（接口 type_options） */
  typeOptions: TTypeLimitOption[];
  /** 类型清单来源的说法：工作区组 / 模板「类型库」，项目自定义组「本项目」 */
  typeSourceLabel?: string;
  readOnly?: boolean;
  /** 只读时卡片上方的说明（如「管理员组拥有全部权限，不能修改」） */
  notice?: ReactNode;
  copySources?: TCopySource[];
  /** 读来源组的权限内容；不传就不显示「复制自…」 */
  loadCopySource?: (sourceId: string) => Promise<TPermissionEditorValue>;
};

/**
 * 权限组编辑器（效果图「权限组详情 › 权限」）：每个模块一行，行内只列这个模块自己有的动作；
 * 分组 / 行 / 表头三级三态勾选，「按动作勾选」一次勾一列，工作项 / 缺陷的新建、编辑、删除可按类型限定。
 * 目录全部来自 PERMISSION_CATALOG，以后加模块、加动作不用改这里。工作区组、模板、项目组共用。
 */
export function PermissionGroupEditor(props: Props) {
  const {
    scopes,
    defaultScope,
    value,
    onChange,
    typeOptions,
    typeSourceLabel = "类型库",
    readOnly = false,
    notice,
    copySources = [],
    loadCopySource,
  } = props;
  const [activeScope, setActiveScope] = useState<TPermissionScope>(
    defaultScope && scopes.includes(defaultScope) ? defaultScope : (scopes[scopes.length - 1] ?? "project")
  );
  const [query, setQuery] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const { keySet, stateOf, toggleKeys, setKeys, setTypeExclusions, replaceKeys } = usePermissionEditor(
    value,
    onChange
  );

  const scopeKeys = useMemo(() => getScopeKeys(activeScope), [activeScope]);
  const visibleGroups = useMemo(() => filterGroups(getScopeGroups(activeScope), query), [activeScope, query]);
  const visibleKeys = useMemo(() => visibleGroups.flatMap(getGroupKeys), [visibleGroups]);
  const bulkItems = useMemo(
    () =>
      getActionsInGroups(visibleGroups).map((action) => {
        const keys = getActionKeys(visibleGroups, action.action);
        return {
          action: action.action,
          label: action.label,
          total: keys.length,
          checked: keys.filter((key) => keySet.has(key)).length,
        };
      }),
    [visibleGroups, keySet]
  );
  const optionsByModule = useMemo(() => {
    const map: Record<string, TTypeLimitOption[]> = {};
    for (const option of typeOptions) (map[option.module] ??= []).push(option);
    return map;
  }, [typeOptions]);

  const countIn = (scope: TPermissionScope) => {
    const keys = getScopeKeys(scope);
    return { checked: keys.filter((key) => keySet.has(key)).length, total: keys.length };
  };
  const activeCount = countIn(activeScope);
  const headerState = stateOf(visibleKeys);

  const handleCopy = async (source: TCopySource) => {
    if (!loadCopySource) return;
    setIsCopying(true);
    try {
      const content = await loadCopySource(source.id);
      replaceKeys(scopeKeys, content);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `已复制「${source.name}」的${SCOPE_LABELS[activeScope]}`,
        message: "保存后生效",
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "复制失败", message: "读取来源权限组失败，请重试" });
    } finally {
      setIsCopying(false);
    }
  };

  const renderModule = (module: TPermissionCatalogModule) => {
    const moduleKeys = getModuleKeys(module);
    const moduleState = stateOf(moduleKeys);
    return (
      <div
        key={module.key}
        className="grid min-h-11 grid-cols-[180px_minmax(0,1fr)] items-center gap-x-4 border-b border-subtle py-2 last:border-b-0"
      >
        <label className={cn("flex items-center gap-2.5", !readOnly && "cursor-pointer")}>
          <Checkbox
            checked={moduleState === "all"}
            indeterminate={moduleState === "some"}
            disabled={readOnly}
            onChange={() => toggleKeys(moduleKeys)}
          />
          <span className="truncate text-13 font-medium text-primary">{module.label}</span>
        </label>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {module.actions.map((action) => {
            const checked = keySet.has(action.key);
            const options = optionsByModule[module.key] ?? [];
            return (
              <span key={action.key} className="inline-flex items-center gap-2">
                <label className={cn("inline-flex items-center gap-2", !readOnly && "cursor-pointer")}>
                  <Checkbox
                    checked={checked}
                    disabled={readOnly}
                    onChange={() => setKeys(checked ? [] : [action.key], checked ? [action.key] : [])}
                  />
                  <span className={cn("text-13", checked ? "text-primary" : "text-tertiary")}>{action.label}</span>
                </label>
                {action.type_limitable && checked && options.length > 0 && (
                  <TypeLimitPopover
                    actionLabel={action.label}
                    moduleKey={module.key}
                    options={options}
                    excluded={value.type_limits?.[action.key] ?? []}
                    sourceLabel={typeSourceLabel}
                    disabled={readOnly}
                    onChange={(excluded) => setTypeExclusions(action.key, excluded)}
                  />
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {scopes.length > 1 ? (
          <div className="inline-flex shrink-0 rounded-lg border border-subtle bg-surface-1 p-0.5">
            {scopes.map((scope) => {
              const { checked, total } = countIn(scope);
              const isActive = scope === activeScope;
              return (
                <button
                  key={scope}
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-md px-3.5 text-13 font-medium transition-colors",
                    isActive ? "bg-accent-primary text-on-color" : "text-secondary hover:bg-layer-1-hover"
                  )}
                  onClick={() => setActiveScope(scope)}
                >
                  {SCOPE_LABELS[scope]}
                  <span className={cn("text-12 tabular-nums", isActive ? "text-on-color opacity-80" : "text-tertiary")}>
                    {checked}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <span className="inline-flex items-center gap-2 text-13 font-medium text-primary">
            {SCOPE_LABELS[activeScope]}
            <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-12 text-accent-primary tabular-nums">
              {activeCount.checked}/{activeCount.total}
            </span>
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex h-8 w-52 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
              placeholder="搜索模块"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>
                <X className="size-3 text-placeholder hover:text-primary" />
              </button>
            )}
          </div>
          {!readOnly && (
            <>
              <BulkActionMenu
                items={bulkItems}
                onToggle={(action) => toggleKeys(getActionKeys(visibleGroups, action))}
              />
              {loadCopySource && <CopyFromMenu sources={copySources} isLoading={isCopying} onSelect={handleCopy} />}
              <button type="button" className={TEXT_BUTTON} onClick={() => setKeys(visibleKeys, [])}>
                全部勾选
              </button>
              <button type="button" className={TEXT_BUTTON} onClick={() => setKeys([], visibleKeys)}>
                全部清空
              </button>
            </>
          )}
        </div>
      </div>

      {notice}

      <div className="rounded-lg border border-subtle bg-surface-1 px-5 pb-2">
        <div className="flex h-12 items-center gap-2.5 border-b border-subtle">
          <Checkbox
            checked={headerState === "all"}
            indeterminate={headerState === "some"}
            disabled={readOnly || visibleKeys.length === 0}
            onChange={() => toggleKeys(visibleKeys)}
          />
          <span className="text-13 font-medium text-secondary">模块</span>
          <span className="ml-auto text-12 text-tertiary tabular-nums">
            已勾 {activeCount.checked} / {activeCount.total}
          </span>
        </div>
        {visibleGroups.length === 0 ? (
          <p className="py-10 text-center text-13 text-placeholder">没有匹配的模块</p>
        ) : (
          visibleGroups.map((group) => {
            const groupKeys = getGroupKeys(group);
            const groupState = stateOf(groupKeys);
            return (
              <section key={`${group.scope}-${group.label}`} className="pt-3">
                <label
                  className={cn(
                    "flex h-8 items-center gap-2.5 border-b border-subtle",
                    !readOnly && "cursor-pointer"
                  )}
                >
                  <Checkbox
                    checked={groupState === "all"}
                    indeterminate={groupState === "some"}
                    disabled={readOnly}
                    onChange={() => toggleKeys(groupKeys)}
                  />
                  <span className="text-12 font-medium text-tertiary">{group.label}</span>
                </label>
                {group.modules.map(renderModule)}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
