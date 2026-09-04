"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderClosed, Inbox, Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementImportableItem, TRequirementLibrary, TRequirementModule } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { getSelectionState, type useLibraryImportSelection } from "./use-library-import-selection";

/**
 * 导入弹窗左侧的「需求类型 → 标准库 → 模块」三层可勾选树。
 *
 * 三层其实是同一批可导条目的三种切法，所以这里只负责把 id 归堆并渲染，勾选状态一律
 * 上交给 useLibraryImportSelection（它按 `库 -> 条目 id 集合` 存，不认识树）。
 *
 * 计数口径只有一个：**可导入**（本产品还没导过的）。模块树接口自带的 count 是库内
 * 全量、不排除已导入的，所以模块级数字只能靠 useImportableLibraryItems 返回的
 * module_id 现算 —— 树接口只用来提供层级与模块名。
 *
 * 模块树按需拉：展开哪个库才拉哪个库（ensureModules 自带去重与缓存）。
 */

/** 未挂靠模块的条目归到这个键下；同时也是列表接口 module_id 的取值 */
export const UNASSIGNED_MODULE_ID = "none";

/** 选中的树节点。moduleId 为 null = 整个库（含未归类） */
export type TImportTreeNode = {
  libraryId: string;
  moduleId: string | null;
};

type TModuleNode = {
  moduleId: string;
  name: string;
  isUnassigned: boolean;
  /** 本模块与全部后代下的可导条目 */
  itemIds: string[];
  children: TModuleNode[];
};

type TLibraryNode = {
  library: TRequirementLibrary;
  itemIds: string[];
  modules: TModuleNode[];
};

type TTypeGroup = {
  typeId: string;
  name: string;
  logoProps: TRequirementLibrary["requirement_type_detail"]["logo_props"];
  libraries: TLibraryNode[];
};

const typeKey = (id: string) => `type:${id}`;
const libraryKey = (id: string) => `lib:${id}`;
const moduleKey = (libraryId: string, moduleId: string) => `mod:${libraryId}:${moduleId}`;

/** 可导条目按模块归堆，保持库内顺序 */
const groupItemsByModule = (items: TRequirementImportableItem[]) => {
  const byModule = new Map<string, string[]>();
  for (const item of items) {
    const key = item.module_id ?? UNASSIGNED_MODULE_ID;
    const bucket = byModule.get(key);
    if (bucket) bucket.push(item.id);
    else byModule.set(key, [item.id]);
  }
  return byModule;
};

/** 子树里一条可导条目都没有的模块直接不出现 —— 数字全是「可导入」，0 的节点没有意义 */
const buildModuleNodes = (modules: TRequirementModule[], byModule: Map<string, string[]>): TModuleNode[] =>
  modules.reduce<TModuleNode[]>((nodes, module) => {
    const children = buildModuleNodes(module.children ?? [], byModule);
    const itemIds = [...(byModule.get(module.id) ?? []), ...children.flatMap((child) => child.itemIds)];
    if (itemIds.length) {
      nodes.push({ moduleId: module.id, name: module.name, isUnassigned: false, itemIds, children });
    }
    return nodes;
  }, []);

/** 命中的模块保留整棵子树；没命中的靠后代命中被留下 */
const filterModuleNodes = (nodes: TModuleNode[], keyword: string): TModuleNode[] =>
  nodes.reduce<TModuleNode[]>((kept, node) => {
    if (node.name.toLowerCase().includes(keyword)) {
      kept.push(node);
      return kept;
    }
    const children = filterModuleNodes(node.children, keyword);
    if (children.length) kept.push({ ...node, children });
    return kept;
  }, []);

/** 面包屑用：从模块树里取出一条从根到该模块的名称路径 */
export const findModuleNamePath = (
  modules: TRequirementModule[],
  moduleId: string | null | undefined
): string[] => {
  if (!moduleId) return [];
  for (const node of modules) {
    if (node.id === moduleId) return [node.name];
    const nested = findModuleNamePath(node.children ?? [], moduleId);
    if (nested.length) return [node.name, ...nested];
  }
  return [];
};

type TProps = {
  libraries: TRequirementLibrary[];
  itemsByLibrary: Map<string, TRequirementImportableItem[]>;
  treesByLibrary: Map<string, TRequirementModule[]>;
  ensureModules: (libraryId: string) => void;
  search: string;
  selection: ReturnType<typeof useLibraryImportSelection>;
  activeNode: TImportTreeNode | null;
  onSelectNode: (node: TImportTreeNode) => void;
  /** 每次打开弹窗自增。模块树缓存被清空了，展开状态要跟着回到初始，并重拉当前这个库 */
  revision: number;
};

export const RequirementImportLibraryTree = ({
  libraries,
  itemsByLibrary,
  treesByLibrary,
  ensureModules,
  search,
  selection,
  activeNode,
  onSelectNode,
  revision,
}: TProps) => {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const keyword = search.trim().toLowerCase();

  const groups = useMemo<TTypeGroup[]>(() => {
    const byType = new Map<string, TTypeGroup>();
    for (const library of libraries) {
      const items = itemsByLibrary.get(library.id) ?? [];
      const byModule = groupItemsByModule(items);
      const modules = buildModuleNodes(treesByLibrary.get(library.id) ?? [], byModule);
      const unassigned = byModule.get(UNASSIGNED_MODULE_ID) ?? [];
      if (unassigned.length) {
        modules.push({
          moduleId: UNASSIGNED_MODULE_ID,
          name: t("requirement_modules.unassigned"),
          isUnassigned: true,
          itemIds: unassigned,
          children: [],
        });
      }
      const typeId = library.requirement_type_id;
      const group = byType.get(typeId) ?? {
        typeId,
        name: library.requirement_type_detail?.name ?? "",
        logoProps: library.requirement_type_detail?.logo_props,
        libraries: [],
      };
      group.libraries.push({ library, itemIds: items.map((item) => item.id), modules });
      byType.set(typeId, group);
    }
    return [...byType.values()];
  }, [itemsByLibrary, libraries, t, treesByLibrary]);

  const visibleGroups = useMemo<TTypeGroup[]>(() => {
    if (!keyword) return groups;
    return groups.reduce<TTypeGroup[]>((kept, group) => {
      const typeMatches = group.name.toLowerCase().includes(keyword);
      const libraryNodes = group.libraries.reduce<TLibraryNode[]>((acc, node) => {
        // 库名或需求类型命中就整库保留，否则只留命中的模块分支
        if (typeMatches || node.library.name.toLowerCase().includes(keyword)) {
          acc.push(node);
          return acc;
        }
        const modules = filterModuleNodes(node.modules, keyword);
        if (modules.length) acc.push({ ...node, modules });
        return acc;
      }, []);
      if (libraryNodes.length) kept.push({ ...group, libraries: libraryNodes });
      return kept;
    }, []);
  }, [groups, keyword]);

  /* 需求类型默认展开：它只是分组标题，收起来会让人以为一个库都没有 */
  useEffect(() => {
    if (!groups.length) return;
    setExpandedKeys((current) => {
      const next = new Set(current);
      groups.forEach((group) => next.add(typeKey(group.typeId)));
      return next.size === current.size ? current : next;
    });
  }, [groups]);

  /*
   * 重新打开弹窗时模块树缓存被清空了（库里的模块可能已经改过），把展开状态收回到只剩
   * 需求类型分组 —— 否则那些还展开着的库会挂着一棵已经不存在的树，且没有触发重拉的时机。
   * 紧接着的 effect 会把当前这个库重新展开并拉一次。
   */
  useEffect(() => {
    setExpandedKeys(new Set(groups.map((group) => typeKey(group.typeId))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  /* 当前正在看的库展开并把模块树备好 —— 打开弹窗时自动选中的那个库直接见到模块 */
  useEffect(() => {
    const id = activeNode?.libraryId;
    if (!id) return;
    ensureModules(id);
    setExpandedKeys((current) => (current.has(libraryKey(id)) ? current : new Set(current).add(libraryKey(id))));
  }, [activeNode?.libraryId, ensureModules, revision]);

  /*
   * 搜索要能命中模块名，但模块树是按需拉的：没展开过的库手上根本没有树，模块名就永远
   * 匹配不上，而且它会因为「库名不匹配」被过滤掉，再也没机会加载。所以真的输入了关键字
   * 时，把还有东西可导的库补齐（ensureModules 自带去重，同一个库只会拉一次）。
   */
  useEffect(() => {
    if (!keyword) return;
    libraries.forEach((library) => {
      if ((itemsByLibrary.get(library.id)?.length ?? 0) > 0) ensureModules(library.id);
    });
  }, [ensureModules, itemsByLibrary, keyword, libraries]);

  // 搜索期间一律展开：命中的模块可能埋在好几层里，还要用户手点就没意义了
  const isExpanded = (key: string) => Boolean(keyword) || expandedKeys.has(key);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!visibleGroups.length) {
    return (
      <p className="px-2 py-8 text-center text-12 text-secondary">
        {keyword
          ? t("workspace_products.requirements.import_modal.no_search_result")
          : t("workspace_products.requirements.import_modal.empty_libraries")}
      </p>
    );
  }

  const renderModule = (libraryId: string, node: TModuleNode, depth: number) => {
    const key = moduleKey(libraryId, node.moduleId);
    const expanded = isExpanded(key);
    const picked = selection.pickedCountIn(libraryId, node.itemIds);
    const isActive = activeNode?.libraryId === libraryId && activeNode.moduleId === node.moduleId;
    return (
      <li key={key}>
        <TreeRow
          depth={depth}
          isActive={isActive}
          hasChildren={node.children.length > 0}
          isExpanded={expanded}
          onToggleExpand={() => toggleExpanded(key)}
          state={getSelectionState(picked, node.itemIds.length)}
          onToggleCheck={() => selection.toggleItems(libraryId, node.itemIds)}
          icon={
            node.isUnassigned ? (
              <Inbox className="size-3.5 shrink-0" />
            ) : (
              <FolderClosed className="size-3.5 shrink-0" />
            )
          }
          name={node.name}
          pickedCount={picked}
          availableCount={node.itemIds.length}
          onSelect={() => onSelectNode({ libraryId, moduleId: node.moduleId })}
          selectLabel={t("workspace_products.requirements.import_modal.select_all_module", { module: node.name })}
        />
        {expanded && node.children.length > 0 && (
          <ul>{node.children.map((child) => renderModule(libraryId, child, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <ul>
      {visibleGroups.map((group) => {
        const groupKey = typeKey(group.typeId);
        const expanded = isExpanded(groupKey);
        const available = group.libraries.reduce((sum, node) => sum + node.itemIds.length, 0);
        const picked = group.libraries.reduce((sum, node) => sum + selection.pickedCountOf(node.library.id), 0);
        return (
          <li key={groupKey}>
            <TreeRow
              depth={0}
              isHeading
              hasChildren
              isExpanded={expanded}
              onToggleExpand={() => toggleExpanded(groupKey)}
              state={getSelectionState(picked, available)}
              isCheckDisabled={available === 0}
              onToggleCheck={() =>
                selection.toggleGroups(
                  group.libraries.map((node) => ({ libraryId: node.library.id, itemIds: node.itemIds }))
                )
              }
              icon={<TypeIcon iconProps={group.logoProps?.icon} className="size-3.5 rounded" iconClassName="size-2.5" />}
              name={group.name}
              pickedCount={picked}
              availableCount={available}
              // 需求类型只是分组标题，没有对应的条目列表 —— 点它就是展开/收起
              onSelect={() => toggleExpanded(groupKey)}
              selectLabel={t("workspace_products.requirements.import_modal.select_all_type", { type: group.name })}
            />
            {expanded && (
              <ul>
                {group.libraries.map((node) => {
                  const key = libraryKey(node.library.id);
                  const libraryExpanded = isExpanded(key);
                  const pickedInLibrary = selection.pickedCountOf(node.library.id);
                  const libraryAvailable = node.itemIds.length;
                  return (
                    <li key={key}>
                      <TreeRow
                        depth={1}
                        isActive={activeNode?.libraryId === node.library.id && activeNode.moduleId === null}
                        hasChildren={libraryAvailable > 0}
                        isExpanded={libraryExpanded}
                        onToggleExpand={() => {
                          ensureModules(node.library.id);
                          toggleExpanded(key);
                        }}
                        state={getSelectionState(pickedInLibrary, libraryAvailable)}
                        isCheckDisabled={libraryAvailable === 0}
                        onToggleCheck={() => selection.toggleLibrary(node.library.id)}
                        icon={<Library className="size-3.5 shrink-0" />}
                        name={node.library.name}
                        pickedCount={pickedInLibrary}
                        availableCount={libraryAvailable}
                        /* 「本来就是空库」和「都导进来了」是两回事，别用同一句话打发 */
                        emptyHint={
                          libraryAvailable > 0
                            ? undefined
                            : t(
                                node.library.item_count === 0
                                  ? "workspace_products.requirements.import_modal.library_tag_empty"
                                  : "workspace_products.requirements.import_modal.library_tag_drained"
                              )
                        }
                        onSelect={() => onSelectNode({ libraryId: node.library.id, moduleId: null })}
                        selectLabel={t("workspace_products.requirements.import_modal.select_all_library", {
                          library: node.library.name,
                        })}
                      />
                      {libraryExpanded && node.modules.length > 0 && (
                        <ul>{node.modules.map((module) => renderModule(node.library.id, module, 2))}</ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
};

type TRowProps = {
  depth: number;
  isHeading?: boolean;
  isActive?: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  state: ReturnType<typeof getSelectionState>;
  isCheckDisabled?: boolean;
  onToggleCheck: () => void;
  icon: React.ReactNode;
  name: string;
  pickedCount: number;
  availableCount: number;
  /** 不可导时右侧显示的说明，取代数字 */
  emptyHint?: string;
  onSelect?: () => void;
  selectLabel: string;
};

/**
 * 树上的一行。
 *
 * 展开箭头 / 勾选框 / 行主体是三个并列的可点区域，不能相互嵌套 —— 套进同一个
 * <button> 里是 interactive content 嵌套，点勾选会连带触发切换节点，各浏览器行为
 * 还不一致（与旧版库列表同样的坑）。
 */
const TreeRow = ({
  depth,
  isHeading = false,
  isActive = false,
  hasChildren,
  isExpanded,
  onToggleExpand,
  state,
  isCheckDisabled = false,
  onToggleCheck,
  icon,
  name,
  pickedCount,
  availableCount,
  emptyHint,
  onSelect,
  selectLabel,
}: TRowProps) => (
  <div
    className={cn(
      "flex h-8 items-center gap-1.5 rounded-md pr-2 transition-colors",
      isActive ? "bg-accent-subtle/50" : "hover:bg-layer-1",
      isCheckDisabled && !isActive && "hover:bg-transparent"
    )}
    style={{ paddingLeft: `${depth * 16 + 2}px` }}
  >
    <button
      type="button"
      onClick={onToggleExpand}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded text-tertiary",
        hasChildren ? "hover:bg-layer-2 hover:text-primary" : "invisible"
      )}
      tabIndex={hasChildren ? 0 : -1}
      aria-label={name}
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <ChevronRight className={cn("size-3 transition-transform", isExpanded && "rotate-90")} />
    </button>
    <Checkbox
      checked={state === "checked"}
      indeterminate={state === "indeterminate"}
      disabled={isCheckDisabled}
      onChange={onToggleCheck}
      aria-label={selectLabel}
    />
    <button
      type="button"
      onClick={onSelect}
      disabled={!onSelect}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 text-left",
        onSelect ? "cursor-pointer" : "cursor-default"
      )}
    >
      <span className={cn("shrink-0", isActive ? "text-accent-primary" : "text-tertiary")}>{icon}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isHeading ? "text-11 font-semibold tracking-wide text-primary" : "text-12",
          !isHeading && (isActive ? "font-medium text-primary" : "text-secondary"),
          availableCount === 0 && "text-tertiary"
        )}
      >
        {name}
      </span>
    </button>
    {emptyHint ? (
      <span className="shrink-0 text-10 text-tertiary">{emptyHint}</span>
    ) : pickedCount > 0 ? (
      /* 勾过之后数字换成「已选几条」—— 选的过程中用户关心的是这个，没勾时才关心还剩几条 */
      <span className="shrink-0 rounded-full bg-accent-primary px-1.5 text-10 font-medium text-on-color tabular-nums">
        {pickedCount}
      </span>
    ) : (
      <span className="shrink-0 text-10 text-tertiary tabular-nums">{availableCount}</span>
    )}
  </div>
);
