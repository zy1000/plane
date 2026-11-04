/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TPermissionCatalogGroup, TPermissionCatalogModule, TPermissionScope } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { PermissionGroupSearch } from "../ui";
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
import { PermissionRail, useGroupScrollSpy } from "./permission-rail";
import type { TRailSection } from "./permission-rail";
import { BulkActionMenu, CopyFromMenu } from "./toolbar-menus";
import type { TCopySource } from "./toolbar-menus";
import { TypeLimitPopover } from "./type-limit-popover";
import type { TTypeLimitOption } from "./type-limit-popover";
import { usePermissionEditor } from "./use-permission-editor";
import type { TPermissionEditorValue } from "./use-permission-editor";

type Props = {
  /** 按顺序显示的段：工作区权限组 ["project", "workspace"]，项目权限组只有 ["project"] */
  scopes: TPermissionScope[];
  value: TPermissionEditorValue;
  onChange: (next: TPermissionEditorValue) => void;
  /** 类型限定弹层的候选类型（接口 type_options） */
  typeOptions: TTypeLimitOption[];
  /** 类型清单来源的说法：工作区组 / 模板「类型库」，项目自定义组「本项目」 */
  typeSourceLabel?: string;
  readOnly?: boolean;
  /** 工具栏下方的提示（只读原因、项目权限为空等） */
  notice?: ReactNode;
  copySources?: TCopySource[];
  /** 读来源组的权限内容；不传就不显示「复制自…」 */
  loadCopySource?: (sourceId: string) => Promise<TPermissionEditorValue>;
};

const groupId = (group: TPermissionCatalogGroup) => `${group.scope}:${group.label}`;

/**
 * 权限组编辑器（效果图「详情 · 权限」）：左侧分组导航，右侧每个分组一张卡片，模块一行，
 * 行内只列这个模块自己有的动作（勾选块）；分组 / 模块两级三态勾选，「批量勾选」管全选、清空和按动作勾。
 * 工作项 / 缺陷的新建、编辑、删除可按类型限定（挂在勾选块右半截）。
 * 目录全部来自 PERMISSION_CATALOG，加模块、加动作不用改这里。工作区组、模板、项目组共用。
 */
export function PermissionGroupEditor(props: Props) {
  const {
    scopes,
    value,
    onChange,
    typeOptions,
    typeSourceLabel = "类型库",
    readOnly = false,
    notice,
    copySources = [],
    loadCopySource,
  } = props;
  const [query, setQuery] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  const { keySet, stateOf, toggleKeys, setKeys, setTypeExclusions, replaceKeys } = usePermissionEditor(
    value,
    onChange
  );

  const sections = useMemo(
    () => scopes.map((scope) => ({ scope, groups: filterGroups(getScopeGroups(scope), query) })),
    [scopes, query]
  );
  const visibleGroups = useMemo(() => sections.flatMap((section) => section.groups), [sections]);
  const visibleKeys = useMemo(() => visibleGroups.flatMap(getGroupKeys), [visibleGroups]);
  const allScopeKeys = useMemo(() => scopes.flatMap(getScopeKeys), [scopes]);
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

  const countOf = (keys: string[]) => ({ checked: keys.filter((key) => keySet.has(key)).length, total: keys.length });

  const railSections = useMemo<TRailSection[]>(
    () =>
      sections.map(({ scope, groups }) => ({
        label: SCOPE_LABELS[scope],
        ...countOf(getScopeKeys(scope)),
        items: groups.map((group) => ({ id: groupId(group), label: group.label, ...countOf(getGroupKeys(group)) })),
      })),
    // countOf 只读 keySet
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, keySet]
  );
  const { activeId, register, scrollTo } = useGroupScrollSpy(visibleGroups.map(groupId));

  const handleCopy = async (source: TCopySource) => {
    if (!loadCopySource) return;
    setIsCopying(true);
    try {
      const content = await loadCopySource(source.id);
      replaceKeys(allScopeKeys, content);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已复制「${source.name}」的权限`, message: "保存后生效" });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "复制失败", message: "读取来源权限组失败，请重试" });
    } finally {
      setIsCopying(false);
    }
  };

  const renderAction = (module: TPermissionCatalogModule, action: TPermissionCatalogModule["actions"][number]) => {
    const checked = keySet.has(action.key);
    const options = optionsByModule[module.key] ?? [];
    return (
      <div
        key={action.key}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border pr-3 pl-2.5 text-14 whitespace-nowrap transition-colors",
          checked ? "border-accent-subtle bg-accent-subtle text-primary" : "border-subtle bg-surface-1 text-tertiary",
          !readOnly && !checked && "hover:border-strong"
        )}
      >
        <label className={cn("inline-flex items-center gap-2", !readOnly && "cursor-pointer")}>
          <Checkbox
            checked={checked}
            disabled={readOnly}
            onChange={() => setKeys(checked ? [] : [action.key], checked ? [action.key] : [])}
          />
          {action.label}
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
      </div>
    );
  };

  const renderModule = (module: TPermissionCatalogModule) => {
    const moduleState = stateOf(getModuleKeys(module));
    return (
      <div
        key={module.key}
        className="grid grid-cols-[132px_minmax(0,1fr)] items-start gap-x-4 border-b border-subtle px-5 py-3 last:border-b-0"
      >
        <label
          className={cn(
            "flex h-8 items-center gap-2.5 text-14 font-medium whitespace-nowrap text-primary",
            !readOnly && "cursor-pointer"
          )}
        >
          <Checkbox
            checked={moduleState === "all"}
            indeterminate={moduleState === "some"}
            disabled={readOnly}
            onChange={() => toggleKeys(getModuleKeys(module))}
          />
          <span className="truncate">{module.label}</span>
        </label>
        <div className="flex flex-wrap gap-2">{module.actions.map((action) => renderAction(module, action))}</div>
      </div>
    );
  };

  const renderGroup = (group: TPermissionCatalogGroup) => {
    const keys = getGroupKeys(group);
    const groupState = stateOf(keys);
    const { checked, total } = countOf(keys);
    const id = groupId(group);
    return (
      <section
        key={id}
        ref={register(id)}
        data-group-id={id}
        className="scroll-mt-4 rounded-xl border border-subtle bg-surface-1"
      >
        <label
          className={cn(
            "flex h-[52px] items-center gap-3 rounded-t-xl border-b border-subtle bg-layer-1 px-5",
            !readOnly && "cursor-pointer"
          )}
        >
          <Checkbox
            checked={groupState === "all"}
            indeterminate={groupState === "some"}
            disabled={readOnly}
            onChange={() => toggleKeys(keys)}
          />
          <span className="text-14 font-semibold text-primary">{group.label}</span>
          <span className="text-13 text-tertiary tabular-nums">
            {checked} / {total}
          </span>
        </label>
        {group.modules.map(renderModule)}
      </section>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-x-7 gap-y-4 md:grid-cols-[184px_minmax(0,1fr)]">
      <div className="hidden md:block">
        <PermissionRail sections={railSections} activeId={activeId} onSelect={scrollTo} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索模块或动作" className="w-60" />
          {!readOnly && (
            <div className="flex items-center gap-2">
              {loadCopySource && <CopyFromMenu sources={copySources} isLoading={isCopying} onSelect={handleCopy} />}
              <BulkActionMenu
                items={bulkItems}
                onToggle={(action) => toggleKeys(getActionKeys(visibleGroups, action))}
                onSelectAll={() => setKeys(visibleKeys, [])}
                onClearAll={() => setKeys([], visibleKeys)}
              />
            </div>
          )}
        </div>

        {notice}

        {visibleGroups.length === 0 ? (
          <p className="rounded-xl border border-subtle py-12 text-center text-14 text-placeholder">没有匹配的模块</p>
        ) : (
          sections
            .filter((section) => section.groups.length > 0)
            .map(({ scope, groups }) => {
              const { checked, total } = countOf(getScopeKeys(scope));
              return (
                <div key={scope} className="flex flex-col gap-4">
                  <div className="mt-1 flex items-baseline gap-2.5">
                    <h2 className="text-16 font-semibold text-primary">{SCOPE_LABELS[scope]}</h2>
                    <span className="text-13 text-tertiary tabular-nums">
                      {checked} / {total}
                    </span>
                  </div>
                  {groups.map(renderGroup)}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
