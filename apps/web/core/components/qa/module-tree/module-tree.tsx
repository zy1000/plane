"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { DownOutlined } from "@ant-design/icons";
import { LayoutGrid } from "lucide-react";
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

const INDENT = 20;
const BASE_PADDING = 8;
const SLOT = 20;
/** 连线取 border-strong，与 antd Tree showLine 的 colorBorder 同档 */
const LINE_CLASS = "pointer-events-none absolute border-strong";

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
 * 测试管理各页面共用的模块树主体：固定首行「全部」、antd Tree showLine + 向下箭头式的连线与展开符、
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
  /** 纯平铺的分组列表（执行人 / 类型等）不画叶子连线 */
  const hasHierarchy = useMemo(() => nodes.some((node) => node.children?.length), [nodes]);

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
    if (target.key === sourceKey || isInSubtree(dragNode, target.key)) return null;
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
        buttonClassName="size-[22px] rounded-md text-tertiary hover:bg-layer-transparent-active aria-expanded:bg-layer-transparent-active aria-expanded:text-primary"
        optionsClassName="min-w-[160px]"
      >
        {items.map((item) => (
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
        ))}
      </CustomMenu>
    </span>
  );

  /** 祖先层的兄弟竖线：ends[i] 表示第 i 层祖先是同级末位，末位下方不再续线（同 antd indent-unit-end） */
  const renderIndentLines = (ends: boolean[]) =>
    ends.map((end, i) =>
      end ? null : (
        <span
          key={i}
          aria-hidden
          className={cn(LINE_CLASS, "top-0 bottom-0 w-0 border-l")}
          style={{ left: BASE_PADDING + i * INDENT + SLOT / 2 }}
        />
      )
    );

  /** 叶子连线：非末位 ├，末位 └ */
  const renderLeafLine = (isLast: boolean) => (
    <>
      <span
        aria-hidden
        className={cn(LINE_CLASS, "top-0 w-0 border-l", isLast ? "bottom-1/2" : "bottom-0")}
        style={{ left: SLOT / 2 }}
      />
      <span aria-hidden className={cn(LINE_CLASS, "top-1/2 h-0 border-t")} style={{ left: SLOT / 2, width: SLOT / 2 - 2 }} />
    </>
  );

  const renderSlot = (node: TModuleTreeNode | null, expanded: boolean, isLast: boolean): ReactNode => {
    if (!node) return root?.icon ?? <LayoutGrid className="size-3.5" strokeWidth={2} />;
    if (node.children?.length)
      return (
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? "收起" : "展开"}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(node.key);
          }}
          className="flex size-[18px] items-center justify-center rounded text-secondary hover:bg-layer-transparent-active hover:text-primary"
        >
          <DownOutlined className={cn("text-[10px] transition-transform", !expanded && "-rotate-90")} />
        </button>
      );
    if (node.leading) return node.leading;
    return hasHierarchy ? renderLeafLine(isLast) : null;
  };

  const renderSlotBox = (content: ReactNode, className?: string) => (
    <span
      className={cn("relative flex shrink-0 items-center justify-center self-stretch", className)}
      style={{ width: SLOT }}
    >
      {content}
    </span>
  );

  const renderInputRow = (depth: number, ends: boolean[], slot: ReactNode, initialValue?: string) => (
    <div className="relative flex h-7 items-center pr-1" style={{ paddingLeft: BASE_PADDING + depth * INDENT }}>
      {renderIndentLines(ends)}
      {renderSlotBox(slot)}
      <div className="ml-1 min-w-0 flex-1">
        <ModuleTreeInput
          initialValue={initialValue}
          onCommit={(value) => onEditCommit?.(value)}
          onCancel={() => onEditCancel?.()}
        />
      </div>
    </div>
  );

  const renderRow = (
    node: TModuleTreeNode | null,
    depth: number,
    ends: boolean[],
    expanded: boolean,
    isLast: boolean
  ) => {
    const isRoot = node === null;
    const key = node?.key ?? rootKey;
    const label = node?.label ?? root?.label ?? "";
    const count = node ? node.count : root?.count;
    const hasChildren = Boolean(node?.children?.length);
    const isSelected = selectedKey === key;
    const menuItems = node && getMenuItems ? getMenuItems(node) : [];
    const canDrag = !isRoot && dragMode !== "none" && node?.draggable !== false;
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
          "group/row relative flex h-7 cursor-pointer items-center pr-1 text-13 outline-none select-none",
          isDragging && "opacity-40"
        )}
        style={{ paddingLeft: indent }}
      >
        {renderIndentLines(ends)}
        {renderSlotBox(
          renderSlot(node, expanded, isLast),
          isRoot ? (isSelected ? "text-accent-primary" : "text-secondary") : undefined
        )}
        {/* 同 antd：选中 / 悬停底色只铺在标题上，展开符与连线留在外面 */}
        <div
          className={cn(
            "ml-1 flex h-6 min-w-0 flex-1 items-center rounded-md pr-1.5 pl-1",
            isSelected
              ? "bg-accent-subtle font-medium text-accent-primary"
              : "text-primary group-hover/row:bg-layer-transparent-hover",
            dropHere === "into" && "bg-accent-subtle ring-1 ring-accent-strong ring-inset"
          )}
        >
          {node?.icon && <span className="mr-1 flex shrink-0 items-center text-tertiary">{node.icon}</span>}
          <span className={cn("min-w-0 flex-1 truncate", node?.emphasis && "font-medium")}>
            {renderHighlighted(label, query)}
          </span>
          {typeof count === "number" && (
            <span
              className={cn(
                "shrink-0 pl-2 text-12 tabular-nums",
                isSelected ? "text-accent-primary" : "text-tertiary",
                menuItems.length > 0 && "group-hover/row:hidden group-has-[[aria-expanded=true]]/row:hidden"
              )}
            >
              {count}
            </span>
          )}
          {menuItems.length > 0 && renderMenu(menuItems)}
        </div>
        {(dropHere === "before" || dropHere === "after") && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1.5 h-0.5 rounded-full bg-accent-primary"
            style={{ left: indent + SLOT / 2, [dropHere === "before" ? "top" : "bottom"]: -1 }}
          >
            <span className="absolute top-[-2.5px] left-[-7px] size-[7px] rounded-full bg-accent-primary" />
          </span>
        )}
      </div>
    );
  };

  /** ends：各层祖先是否同级末位；creatingAtEnd：列表末尾还挂着新建输入行，原末位不再画 └ */
  const renderNodes = (list: TModuleTreeNode[], depth: number, ends: boolean[], creatingAtEnd = false): ReactNode =>
    list.map((node, index) => {
      const isLast = index === list.length - 1 && !creatingAtEnd;
      const hasChildren = Boolean(node.children?.length);
      const creatingHere = editing?.kind === "create" && editing.parentKey === node.key;
      const expanded = (hasChildren && (searching || expandedSet.has(node.key))) || creatingHere;
      const renaming = editing?.kind === "rename" && editing.key === node.key;
      const childEnds = [...ends, isLast];
      return (
        <Fragment key={node.key}>
          {renaming
            ? renderInputRow(depth, ends, renderSlot(node, expanded, isLast), editing.initialValue)
            : renderRow(node, depth, ends, expanded, isLast)}
          {expanded && (
            <>
              {renderNodes(node.children ?? [], depth + 1, childEnds, creatingHere)}
              {creatingHere && renderInputRow(depth + 1, childEnds, hasHierarchy ? renderLeafLine(true) : null)}
            </>
          )}
        </Fragment>
      );
    });

  const creatingAtRoot = editing?.kind === "create" && editing.parentKey === rootKey;

  return (
    <div
      role="tree"
      className={cn("flex flex-col", className)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      {root && (
        <>
          {renderRow(null, 0, [], true, true)}
          <div className="my-1 border-t border-subtle" />
        </>
      )}
      {renderNodes(visibleNodes, 0, [], creatingAtRoot)}
      {creatingAtRoot && renderInputRow(0, [], hasHierarchy ? renderLeafLine(true) : null)}
    </div>
  );
};
