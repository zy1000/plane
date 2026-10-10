"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import useLocalStorage from "@/hooks/use-local-storage";
import { ModuleTree, type TModuleTreeProps } from "./module-tree";

const DEFAULT_WIDTH = 264;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;
/** 四个页面共用一个宽度，切页不跳 */
const WIDTH_STORAGE_KEY = "qa_module_tree_width";

const clampWidth = (value: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));

const IconButton = ({
  tip,
  tipPosition = "bottom",
  onClick,
  children,
}: {
  tip: string;
  tipPosition?: "bottom" | "right";
  onClick: () => void;
  children: ReactNode;
}) => (
  <Tooltip tooltipContent={tip} position={tipPosition}>
    <button
      type="button"
      aria-label={tip}
      onClick={onClick}
      className="flex size-[26px] shrink-0 items-center justify-center rounded-md text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary"
    >
      {children}
    </button>
  </Tooltip>
);

export type TModuleTreePanelProps = Omit<TModuleTreeProps, "query" | "className"> & {
  /** 树头左侧文字，默认「模块」；传了 headerLeft 则不显示 */
  title?: string;
  /** 树头左侧自定义内容（用例库切换 / 分组切换） */
  headerLeft?: ReactNode;
  /** 传了才显示「新建一级模块」按钮 */
  onAddRoot?: () => void;
  searchable?: boolean;
  collapsible?: boolean;
  /** 收起成窄条时竖排显示的文字（通常是当前选中项） */
  railLabel?: string;
  loading?: boolean;
  emptyText?: string;
  className?: string;
};

/**
 * 测试管理左侧目录树的外壳：树头（标题 / 自定义左侧 + 搜索 / 新建 / 收起）、
 * 可拖宽（220–360，记在 localStorage）、可收成 36px 窄条、空态。树本身见 ModuleTree。
 */
export const ModuleTreePanel = ({
  title = "模块",
  headerLeft,
  onAddRoot,
  searchable = true,
  collapsible = true,
  railLabel,
  loading = false,
  emptyText = "还没有模块",
  className,
  ...treeProps
}: TModuleTreePanelProps) => {
  const { storedValue: storedWidth, setValue: storeWidth } = useLocalStorage<number>(
    WIDTH_STORAGE_KEY,
    DEFAULT_WIDTH
  );
  const [width, setWidth] = useState<number>(() => clampWidth(Number(storedWidth) || DEFAULT_WIDTH));
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const dragStartRef = useRef<{ x: number; width: number } | null>(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      setWidth(clampWidth(dragStartRef.current.width + e.clientX - dragStartRef.current.x));
    };
    const onUp = () => {
      if (!dragStartRef.current) return;
      dragStartRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      storeWidth(widthRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [storeWidth]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStartRef.current = { x: e.clientX, width: widthRef.current };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };

  const isEmpty = !loading && treeProps.nodes.length === 0 && !treeProps.editing;
  const noMatch = !loading && query.trim().length > 0 && treeProps.nodes.length > 0;

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex h-full w-9 shrink-0 flex-col items-center gap-2.5 border-r border-subtle bg-surface-1 pt-[7px]",
          className
        )}
      >
        <IconButton tip="展开目录" tipPosition="right" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen className="size-[15px]" strokeWidth={2} />
        </IconButton>
        {railLabel && (
          <span
            className="max-h-[60%] truncate text-12 tracking-[0.08em] text-tertiary [writing-mode:vertical-rl]"
            title={railLabel}
          >
            {railLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("relative flex h-full shrink-0 flex-col border-r border-subtle bg-surface-1", className)}
      style={{ width }}
    >
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-subtle pr-1.5 pl-2">
        {searchOpen ? (
          <>
            <Search className="ml-1 size-[15px] shrink-0 text-tertiary" strokeWidth={2} />
            <input
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="text"
              value={query}
              placeholder="搜索模块"
              aria-label="搜索模块"
              className="h-7 min-w-0 flex-1 bg-transparent px-1.5 text-13 text-primary outline-none placeholder:text-placeholder"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") closeSearch();
              }}
            />
            <IconButton tip="关闭搜索" onClick={closeSearch}>
              <X className="size-[15px]" strokeWidth={2} />
            </IconButton>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center">
              {headerLeft ?? (
                <span className="truncate pl-1.5 text-12 font-medium tracking-wide text-tertiary">{title}</span>
              )}
            </div>
            {searchable && (
              <IconButton tip="搜索模块" onClick={() => setSearchOpen(true)}>
                <Search className="size-[15px]" strokeWidth={2} />
              </IconButton>
            )}
            {onAddRoot && (
              <IconButton tip="新建模块" onClick={onAddRoot}>
                <Plus className="size-[15px]" strokeWidth={2} />
              </IconButton>
            )}
            {collapsible && (
              <IconButton tip="收起目录" onClick={() => setCollapsed(true)}>
                <PanelLeftClose className="size-[15px]" strokeWidth={2} />
              </IconButton>
            )}
          </>
        )}
      </div>

      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        <ModuleTree {...treeProps} query={query} />
        {loading && treeProps.nodes.length === 0 && (
          <div className="px-2 py-3 text-13 text-tertiary">加载中…</div>
        )}
        {isEmpty && (
          <div className="flex flex-col items-center gap-2.5 px-3 pt-12 text-13 text-tertiary">
            <span>{emptyText}</span>
            {onAddRoot && (
              <button
                type="button"
                onClick={onAddRoot}
                className="flex h-[30px] items-center gap-1.5 rounded-md border border-strong bg-surface-1 px-3 text-13 font-medium text-primary hover:bg-layer-transparent-hover"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                新建模块
              </button>
            )}
          </div>
        )}
        {noMatch && <NoMatchHint nodes={treeProps.nodes} query={query} />}
      </div>

      <div
        role="presentation"
        onMouseDown={startResize}
        className="absolute top-0 -right-px z-10 h-full w-[5px] cursor-col-resize transition-colors hover:bg-accent-primary"
      />
    </div>
  );
};

/** 搜索无命中时的提示；过滤逻辑在树里，这里只做一次同样的判断 */
const NoMatchHint = ({ nodes, query }: { nodes: TModuleTreeProps["nodes"]; query: string }) => {
  const q = query.trim().toLowerCase();
  const hasMatch = (list: TModuleTreeProps["nodes"]): boolean =>
    list.some((node) => node.label.toLowerCase().includes(q) || hasMatch(node.children ?? []));
  if (hasMatch(nodes)) return null;
  return <div className="px-2 pt-6 text-center text-13 text-tertiary">没有匹配的模块</div>;
};
