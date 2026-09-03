import { useCallback, useEffect, useMemo, useState } from "react";
import type { TDataDictionaryItem, TDataDictionaryItemsSort } from "@plane/types";

export const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
const HIGHLIGHT_MS = 1500;

type Options = {
  canEdit: boolean;
  /** 有行在编辑（或新增行打开）时不允许拖拽 */
  isEditing: boolean;
};

/**
 * 值表格的搜索 / 排序 / 分页派生层。全部本地计算（items 由列表接口一次带回且已按 sort_order 排好），
 * 越界回退靠 currentPage = min(page, pageCount) 的派生而不是 effect。
 */
export const useDictionaryItemsView = (items: TDataDictionaryItem[], options: Options) => {
  const { canEdit, isEditing } = options;
  const [search, setSearchState] = useState("");
  const [sort, setSortState] = useState<TDataDictionaryItemsSort>("manual");
  const [pageSize, setPageSizeState] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();

  const sorted = useMemo(() => {
    const filtered = query ? items.filter((item) => item.label.toLowerCase().includes(query)) : items;
    if (sort === "name")
      return [...filtered].sort((a, b) => a.label.localeCompare(b.label, "zh-CN") || a.sort_order - b.sort_order);
    if (sort === "recent")
      return [...filtered].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.sort_order - a.sort_order
      );
    // manual：items 本身就是 sort_order 序
    return filtered;
  }, [items, query, sort]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageOffset = (currentPage - 1) * pageSize;
  const pageItems = useMemo(() => sorted.slice(pageOffset, pageOffset + pageSize), [sorted, pageOffset, pageSize]);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);
  const setSort = useCallback((value: TDataDictionaryItemsSort) => {
    setSortState(value);
    setPage(1);
  }, []);
  const setPageSize = useCallback((value: number) => {
    setPageSizeState(value);
    setPage(1);
  }, []);

  const dragDisabledReason: "search" | "sort" | null = query ? "search" : sort !== "manual" ? "sort" : null;
  const canDrag = canEdit && !isEditing && dragDisabledReason === null;

  /** 新增 / 批量新增后定位到该值所在页并短暂高亮；搜索词挡住它时先清搜索 */
  const revealItem = useCallback(
    (item: TDataDictionaryItem) => {
      if (query && !item.label.toLowerCase().includes(query)) setSearchState("");
      setPendingRevealId(item.id);
    },
    [query]
  );

  useEffect(() => {
    if (!pendingRevealId) return;
    const index = sorted.findIndex((item) => item.id === pendingRevealId);
    if (index === -1) return;
    setPage(Math.floor(index / pageSize) + 1);
    setHighlightId(pendingRevealId);
    setPendingRevealId(null);
  }, [pendingRevealId, sorted, pageSize]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  /**
   * 当页拖完后 splice 回整字典的顺序。前提是 canDrag：手动顺序且无搜索时，当页正是整表按 sort_order 的连续切片，
   * reorderItem 需要的是整字典的完整有序列表（否则它的归一化兜底会破坏其它页）。
   */
  const toFullOrder = useCallback(
    (pageOrdered: TDataDictionaryItem[]) => {
      const full = [...items];
      full.splice(pageOffset, pageOrdered.length, ...pageOrdered);
      return full;
    },
    [items, pageOffset]
  );

  return {
    search,
    setSearch,
    sort,
    setSort,
    pageSize,
    setPageSize,
    page: currentPage,
    setPage,
    pageCount,
    total,
    pageOffset,
    pageItems,
    canDrag,
    dragDisabledReason,
    highlightId,
    revealItem,
    toFullOrder,
  };
};
