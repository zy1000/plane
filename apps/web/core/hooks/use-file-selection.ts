"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * 列表多选：维护选中的 id 集合，并在数据刷新后自动剔除已不存在的项，
 * 避免删除/翻页后残留脏 id 被带进批量操作。
 */
export const useFileSelection = <T extends { id: string }>(items: T[]) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const availableIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    const available = new Set(availableIds);
    setSelectedIds((prev) => {
      const next = prev.filter((id) => available.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [availableIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => (prev.length === availableIds.length ? [] : [...availableIds]));
  }, [availableIds]);

  const clear = useCallback(() => setSelectedIds([]), []);

  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds]);

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    isSelected,
    isAllSelected: availableIds.length > 0 && selectedIds.length === availableIds.length,
    isPartiallySelected: selectedIds.length > 0 && selectedIds.length < availableIds.length,
    toggle,
    toggleAll,
    clear,
  };
};
