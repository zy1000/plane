import { useCallback, useMemo, useState } from "react";
import type { TRequirementImportPayload } from "@plane/types";

/**
 * 导入弹窗的勾选状态。
 *
 * 按 `库 -> 条目 ID 集合` 存，而不是把整行存下来：勾一个模块或整个库时手上只有一串
 * id（来自「可导入条目」接口），没有行数据。这个形状顺带让「每库已选多少」「按库分组
 * 提交」都变成直接读取。
 *
 * 左侧树上的节点（需求类型 / 标准库 / 模块）都只是「一批 id」的不同切法，所以这里不
 * 认识树，只提供按 id 批操作的原语：单库一批走 toggleItems，跨库一批（需求类型节点）
 * 走 toggleGroups。
 *
 * 选中态跨库、跨模块、跨分页累积，切节点不清空 —— 可以攒一批再一次性导入。
 */

export type TSelectionState = "checked" | "indeterminate" | "unchecked";

export const getSelectionState = (picked: number, total: number): TSelectionState => {
  if (total <= 0 || picked <= 0) return "unchecked";
  return picked >= total ? "checked" : "indeterminate";
};

export const useLibraryImportSelection = (itemIdsByLibrary: Map<string, string[]>) => {
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());

  /**
   * 一批 id 要么全加、要么全删。
   *
   * `groups` 里一个库一项，允许跨库 —— 需求类型节点下挂着多个库，勾它必须整体判定
   * 「是不是已经全选了」，否则会出现「已经全选的库被清掉、没选的库被选上」的对调。
   */
  const toggleGroups = useCallback((groups: { libraryId: string; itemIds: string[] }[]) => {
    const effective = groups.filter((group) => group.itemIds.length);
    if (!effective.length) return;
    setSelected((current) => {
      const isAllPicked = effective.every((group) =>
        group.itemIds.every((itemId) => current.get(group.libraryId)?.has(itemId))
      );
      const next = new Map(current);
      for (const { libraryId, itemIds } of effective) {
        const picked = new Set(next.get(libraryId) ?? []);
        if (isAllPicked) itemIds.forEach((itemId) => picked.delete(itemId));
        else itemIds.forEach((itemId) => picked.add(itemId));
        if (picked.size) next.set(libraryId, picked);
        else next.delete(libraryId);
      }
      return next;
    });
  }, []);

  /** 单库的一批 —— 本页全选、模块节点、整库全选都走这条 */
  const toggleItems = useCallback(
    (libraryId: string, itemIds: string[]) => toggleGroups([{ libraryId, itemIds }]),
    [toggleGroups]
  );

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
    /** 某一批 id 里已经选了几条 —— 模块 / 需求类型节点的三态与徽标数字都靠它 */
    pickedCountIn: (libraryId: string, itemIds: string[]) => {
      const picked = selected.get(libraryId);
      if (!picked?.size) return 0;
      return itemIds.reduce((count, itemId) => (picked.has(itemId) ? count + 1 : count), 0);
    },
    isPicked: (libraryId: string, itemId: string) => Boolean(selected.get(libraryId)?.has(itemId)),
    toggleItem,
    toggleItems,
    toggleGroups,
    toggleLibrary,
    clear,
    toPayloads,
  };
};
