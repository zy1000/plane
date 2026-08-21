import { useCallback, useMemo, useState } from "react";
import type { TRequirementImportPayload } from "@plane/types";

/**
 * 导入弹窗的勾选状态。
 *
 * 按 `库 -> 条目 ID 集合` 存，而不是把整行存下来：勾整个库时手上只有一串 id
 * （来自「可导入条目」接口），没有行数据。这个形状顺带让「每库已选多少」「按库分组
 * 提交」都变成直接读取。
 *
 * 选中态跨库、跨分页累积，切库不清空 —— 可以攒一批再一次性导入。
 */

export type TSelectionState = "checked" | "indeterminate" | "unchecked";

export const getSelectionState = (picked: number, total: number): TSelectionState => {
  if (total <= 0 || picked <= 0) return "unchecked";
  return picked >= total ? "checked" : "indeterminate";
};

export const useLibraryImportSelection = (itemIdsByLibrary: Map<string, string[]>) => {
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());

  /** 一组条目要么全加、要么全删 —— 本页全选与整库全选共用这一条 */
  const toggleItems = useCallback((libraryId: string, itemIds: string[]) => {
    if (!itemIds.length) return;
    setSelected((current) => {
      const next = new Map(current);
      const picked = new Set(next.get(libraryId) ?? []);
      if (itemIds.every((itemId) => picked.has(itemId))) itemIds.forEach((itemId) => picked.delete(itemId));
      else itemIds.forEach((itemId) => picked.add(itemId));
      if (picked.size) next.set(libraryId, picked);
      else next.delete(libraryId);
      return next;
    });
  }, []);

  const toggleItem = useCallback(
    (libraryId: string, itemId: string) => toggleItems(libraryId, [itemId]),
    [toggleItems]
  );

  const toggleLibrary = useCallback(
    (libraryId: string) => toggleItems(libraryId, itemIdsByLibrary.get(libraryId) ?? []),
    [itemIdsByLibrary, toggleItems]
  );

  const clear = useCallback(() => setSelected(new Map()), []);

  const totalCount = useMemo(() => {
    let total = 0;
    selected.forEach((itemIds) => (total += itemIds.size));
    return total;
  }, [selected]);

  const libraryCount = useMemo(() => selected.size, [selected]);

  /**
   * 组装提交载荷。接口一次只收一个 library_id，所以按库拆开。
   *
   * item_ids 按**库内顺序**排，不是勾选顺序：后端 build_library_import_creates 依次
   * 按传入顺序建行，直接用 Set 的插入顺序会让「勾整库 → 取消一条 → 再勾回来」把那条
   * 挪到产品需求的末尾。
   */
  const toPayloads = useCallback((): TRequirementImportPayload[] => {
    const payloads: TRequirementImportPayload[] = [];
    selected.forEach((picked, library_id) => {
      if (!picked.size) return;
      const order = itemIdsByLibrary.get(library_id) ?? [];
      const known = new Set(order);
      const item_ids = [
        ...order.filter((itemId) => picked.has(itemId)),
        // 可导入集合是打开弹窗那一刻的快照，万一有 id 不在其中也不能丢
        ...[...picked].filter((itemId) => !known.has(itemId)),
      ];
      payloads.push({ library_id, item_ids });
    });
    return payloads;
  }, [itemIdsByLibrary, selected]);

  return {
    selected,
    totalCount,
    libraryCount,
    pickedCountOf: (libraryId: string) => selected.get(libraryId)?.size ?? 0,
    isPicked: (libraryId: string, itemId: string) => Boolean(selected.get(libraryId)?.has(itemId)),
    toggleItem,
    toggleItems,
    toggleLibrary,
    clear,
    toPayloads,
  };
};
