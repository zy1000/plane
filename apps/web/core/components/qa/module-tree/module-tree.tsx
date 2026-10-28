"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight, Folder, ListChecks } from "lucide-react";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { ModuleTreeInput } from "./module-tree-input";
import { filterModuleTree, indexModuleTree, isInSubtree } from "./module-tree-utils";
import type {
  TModuleTreeDragMode,
  TModuleTreeDropEvent,
  TModuleTreeDropPosition,
  TModuleTreeEditing,
  TModuleTreeMenuItem,
  TModuleTreeNode,
} from "./types";
import { MODULE_TREE_ROOT_KEY } from "./types";

/**
 * 行样式与项目研发需求页的树（requirements/module-tree/project-requirement-tree.tsx）同一套紧凑数值：
 * 行高 28、13 号常规字（选中加粗）、图标 14、每层缩进 16、不画连接线
 */
const INDENT = 16;
const BASE_PADDING = 6;
/** 箭头位 14 + 间距 4，拖拽指示线从图标处起 */
const SLOT = 18;

export type TModuleTreeRoot = {
  key?: string;
  label: string;
  count?: number;
  icon?: ReactNode;
};

export type TModuleTreeProps = {
  /** 固定首行「全部 xx」，不传则不渲染 */
  root?: TModuleTreeRoot;
  nodes: TModuleTreeNode[];
  selectedKey: string;
  onSelect: (key: string) => void;
  expandedKeys: string[];
  onExpandedKeysChange: (keys: string[]) => void;
  /** 搜索词：过滤 + 高亮 + 强制展开 */
  query?: string;
  editing?: TModuleTreeEditing;
  onEditCommit?: (value: string) => void;
  onEditCancel?: () => void;
  getMenuItems?: (node: TModuleTreeNode) => TModuleTreeMenuItem[];
  dragMode?: TModuleTreeDragMode;
  onDrop?: (event: TModuleTreeDropEvent) => void;
  className?: string;
};

type TDropTarget = { key: string; position: TModuleTreeDropPosition };

const renderHighlighted = (label: string, query: string): ReactNode => {
  const q = query.trim();
  if (!q) return label;
  const index = label.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return label;
  return (
    <>
      {label.slice(0, index)}
      <span className="font-semibold text-accent-primary">{label.slice(index, index + q.length)}</span>
      {label.slice(index + q.length)}
    </>
  );
};

/**
 * 各页面共用的模块树主体：固定首行「全部」（与一级节点平级）、箭头 + 图标 + 名称 + 计数的行、
 * 悬停出 ⋯ 菜单、行内新建 / 重命名、可选拖拽（换父 / 排序）。数据、请求和权限都由调用方负责。
 */
export const ModuleTree = ({
  root,
  nodes,
  selectedKey,
  onSelect,
  expandedKeys,
  onExpandedKeysChange,
  query = "",
  editing = null,
  onEditCommit,
  onEditCancel,
  getMenuItems,
  dragMode = "none",
  onDrop,
  className,
}: TModuleTreeProps) => {
  const rootKey = root?.key ?? MODULE_TREE_ROOT_KEY;
  const searching = query.trim().length > 0;
  const visibleNodes = useMemo(() => filterModuleTree(nodes, query), [nodes, query]);
  const { nodeByKey, parentByKey } = useMemo(() => indexModuleTree(nodes), [nodes]);
  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TDropTarget | null>(null);

  const toggleExpand = useCallback(
    (key: string) => {
      if (searching) return;
      onExpandedKeysChange(expandedSet.has(key) ? expandedKeys.filter((k) => k !== key) : [...expandedKeys, key]);
    },
    [expandedKeys, expandedSet, onExpandedKeysChange, searching]
  );

  const resetDrag = () => {
    setDragKey(null);
    setDropTarget(null);
  };

  /** 把悬停位置换算成真正要提交的落点；不合法返回 null */
  const resolveDrop = (
    sourceKey: string,
    target: TModuleTreeNode | null,
    position: TModuleTreeDropPosition,
    targetExpanded: boolean
  ): TModuleTreeDropEvent | null => {
    const dragNode = nodeByKey.get(sourceKey);
    if (!dragNode) return null;
    if (!target) {
      // 「全部」只能作为落点：移到一级；本来就在一级且不是排序则是空操作
      if (dragMode === "reparent" && parentByKey.get(sourceKey) === null) return null;
      return { dragKey: sourceKey, targetKey: rootKey, position: "into" };
    }
    if (target.virtual || target.key === sourceKey || isInSubtree(dragNode, target.key)) return null;
    if (position === "into") {
      if (dragMode === "reparent" && parentByKey.get(sourceKey) === target.key) return null;
      return { dragKey: sourceKey, targetKey: target.key, position: "into" };
    }
    if (dragMode !== "sort") return null;
    // 展开着的父级下沿：指示线落在它第一个子节点之上，等价于插到第一个子节点前
    const firstChild = target.children?.[0];
    if (position === "after" && targetExpanded && firstChild) {
      if (firstChild.key === sourceKey) return null;
      return { dragKey: sourceKey, targetKey: firstChild.key, position: "before" };
    }
    return { dragKey: sourceKey, targetKey: target.key, position };
  };

  const computePosition = (event: DragEvent<HTMLDivElement>, isRoot: boolean): TModuleTreeDropPosition => {
    if (dragMode !== "sort" || isRoot) return "into";
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  };

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    target: TModuleTreeNode | null,
    targetExpanded: boolean
  ) => {
    if (!dragKey || dragMode === "none") return;
    const position = computePosition(event, target === null);
    const resolved = resolveDrop(dragKey, target, position, targetExpanded);
    if (!resolved) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const key = target?.key ?? rootKey;
    setDropTarget((prev) => (prev?.key === key && prev.position === position ? prev : { key, position }));
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, target: TModuleTreeNode | null, targetExpanded: boolean) => {
    if (!dragKey) return;
    event.preventDefault();
    const position = computePosition(event, target === null);
    const resolved = resolveDrop(dragKey, target, position, targetExpanded);
    resetDrag();
    if (resolved) onDrop?.(resolved);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, node: TModuleTreeNode | null) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node?.key ?? rootKey);
      return;
    }
    if (!node?.children?.length) return;
    if (event.key === "ArrowRight" && !expandedSet.has(node.key)) {
      event.preventDefault();
      toggleExpand(node.key);
    } else if (event.key === "ArrowLeft" && expandedSet.has(node.key)) {
      event.preventDefault();
      toggleExpand(node.key);
    }
  };

  const renderMenu = (items: TModuleTreeMenuItem[]) => (
    <span
      className="ml-1 hidden shrink-0 group-hover/row:flex has-[[aria-expanded=true]]:flex"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CustomMenu
        ellipsis
        closeOnSelect
        placement="bottom-end"
        ariaLabel="更多操作"
        buttonClassName="size-5 rounded-md text-tertiary hover:bg-layer-transparent-active aria-expanded:bg-layer-transparent-active aria-expanded:text-primary"
        optionsClassName="min-w-[160px]"
      >
        {items.map((item) =>
          item.note ? (
            <div
              key={item.key}
              className="mx-1 mt-1 flex w-56 items-start gap-2 border-t border-subtle px-1 pb-1 pt-2 text-12 leading-[18px] text-tertiary"
            >
              {item.icon && <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">{item.icon}</span>}
              <span className="min-w-0 whitespace-normal">{item.label}</span>
            </div>
          ) : (
            <CustomMenu.MenuItem
              key={item.key}
              disabled={item.disabled}
              onClick={item.onClick}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-13",
                item.danger ? "text-danger-primary" : "text-primary"
              )}
            >
              {item.icon && <span className="flex size-3.5 shrink-0 items-center justify-center">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </CustomMenu.MenuItem>
          )
        )}
      </CustomMenu>
    </span>
  );

  const renderChevron = (node: TModuleTreeNode | null, expanded: boolean) => {
    if (!node?.children?.length) return <span className="size-3.5 shrink-0" />;
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label={expanded ? "收起" : "展开"}
        onClick={(e) => {
          e.stopPropagation();
          toggleExpand(node.key);
        }}
        className="grid size-3.5 shrink-0 place-items-center rounded-sm text-tertiary hover:text-primary"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
    );
  };

  /** 图标位：头像 / 色点等 leading 优先，其次节点自带图标；「全部」默认清单图标，其余默认文件夹 */
  const renderIcon = (node: TModuleTreeNode | null, isSelected: boolean) => (
    <span className={cn("grid size-3.5 shrink-0 place-items-center", isSelected ? "text-primary" : "text-tertiary")}>
      {node
        ? (node.leading ?? node.icon ?? <Folder className="size-3.5" />)
        : (root?.icon ?? <ListChecks className="size-3.5" />)}
    </span>
  );

  const renderInputRow = (depth: number, chevron: ReactNode, initialValue?: string) => (
    <div
      className="flex h-7 items-center gap-1 pr-1.5"
      style={{ paddingLeft: BASE_PADDING + depth * INDENT }}
    >
      {chevron}
      <div className="flex min-w-0 flex-1 items-center gap-[7px]">
        <span className="grid size-3.5 shrink-0 place-items-center text-tertiary">
          <Folder className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <ModuleTreeInput
            initialValue={initialValue}
            onCommit={(value) => onEditCommit?.(value)}
            onCancel={() => onEditCancel?.()}
          />
        </div>
      </div>
    </div>
  );

  const renderRow = (node: TModuleTreeNode | null, depth: number, expanded: boolean) => {
    const isRoot = node === null;
    const key = node?.key ?? rootKey;
    const label = node?.label ?? root?.label ?? "";
    const count = node ? node.count : root?.count;
    const hasChildren = Boolean(node?.children?.length);
    const isSelected = selectedKey === key;
    const isMuted = Boolean(node?.muted) && !isSelected;
    const menuItems = node && !node.virtual && getMenuItems ? getMenuItems(node) : [];
    const canDrag = !isRoot && dragMode !== "none" && !node?.virtual && node?.draggable !== false;
    const isDragging = dragKey === key;
    const dropHere = dropTarget?.key === key ? dropTarget.position : null;
    const indent = BASE_PADDING + depth * INDENT;

    return (
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={0}
        title={label}
        draggable={canDrag}
        onClick={() => onSelect(key)}
        onKeyDown={(e) => handleRowKeyDown(e, node)}
        onDragStart={(e) => {
          if (!canDrag) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", key);
          setDragKey(key);
        }}
        onDragEnd={resetDrag}
        onDragOver={(e) => handleDragOver(e, node, expanded)}
        onDrop={(e) => handleDrop(e, node, expanded)}
        className={cn(
          "group/row relative flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md pr-1.5 outline-none select-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-accent-strong focus-visible:ring-inset",
          isSelected
            ? "bg-layer-transparent-active text-primary"
            : isMuted
              ? "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
              : "text-secondary hover:bg-layer-transparent-hover hover:text-primary",
          dropHere === "into" && "bg-accent-subtle ring-1 ring-accent-strong ring-inset",
          isDragging && "opacity-40"
        )}
        style={{ paddingLeft: indent }}
      >
        {renderChevron(node, expanded)}
        <div className="flex h-full min-w-0 flex-1 items-center gap-[7px]">
          {renderIcon(node, isSelected)}
          <span className={cn("min-w-0 flex-1 truncate text-13", isSelected && "font-medium")}>
            {renderHighlighted(label, query)}
          </span>
          {typeof count === "number" && (
            // 不走 cn：它会把 text-xs / text-center 与 text-primary 当成同组，把字号吞掉
            <span
              className={`min-w-[24px] shrink-0 text-center text-xs tabular-nums ${
                isSelected ? "font-medium text-primary" : isMuted ? "text-placeholder" : "text-tertiary"
              } ${menuItems.length > 0 ? "group-hover/row:hidden group-has-[[aria-expanded=true]]/row:hidden" : ""}`}
            >
              {count}
            </span>
          )}
          {menuItems.length > 0 && renderMenu(menuItems)}
        </div>
        {(dropHere === "before" || dropHere === "after") && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1.5 z-[1] h-0.5 rounded-full bg-accent-primary"
            style={{ left: indent + SLOT, [dropHere === "before" ? "top" : "bottom"]: -1.5 }}
          >
            <span className="absolute top-[-2.5px] left-[-6px] size-[7px] rounded-full bg-accent-primary" />
          </span>
        )}
      </div>
    );
  };

  const renderNodes = (list: TModuleTreeNode[], depth: number): ReactNode =>
    list.map((node) => {
      const hasChildren = Boolean(node.children?.length);
      const creatingHere = editing?.kind === "create" && editing.parentKey === node.key;
      const expanded = (hasChildren && (searching || expandedSet.has(node.key))) || creatingHere;
      const renaming = editing?.kind === "rename" && editing.key === node.key;
      return (
        <Fragment key={node.key}>
          {renaming
            ? renderInputRow(depth, renderChevron(node, expanded), editing.initialValue)
            : renderRow(node, depth, expanded)}
          {expanded && (
            <>
              {renderNodes(node.children ?? [], depth + 1)}
              {creatingHere && renderInputRow(depth + 1, renderChevron(null, false))}
            </>
          )}
        </Fragment>
      );
    });

  const creatingAtRoot = editing?.kind === "create" && editing.parentKey === rootKey;

  return (
    <div
      role="tree"
      className={cn("flex flex-col gap-px", className)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      {root && renderRow(null, 0, true)}
      {renderNodes(visibleNodes, 0)}
      {creatingAtRoot && renderInputRow(0, renderChevron(null, false))}
    </div>
  );
};
