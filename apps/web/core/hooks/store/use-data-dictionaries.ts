import { useCallback, useEffect, useState } from "react";
import type {
  TCreateDataDictionaryItemPayload,
  TCreateDataDictionaryPayload,
  TDataDictionary,
  TDataDictionaryItem,
  TUpdateDataDictionaryItemPayload,
  TUpdateDataDictionaryPayload,
} from "@plane/types";
import { DataDictionaryService } from "@/services/data-dictionary.service";

const dataDictionaryService = new DataDictionaryService();

/** 与 Label.sort_order 同一套步长：追加到末尾时 +10000，拖拽时取邻居中点 */
const SORT_ORDER_STEP = 10000;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load data dictionaries.";
  }
  return "Unable to load data dictionaries.";
};

const sortItems = (items: TDataDictionaryItem[]) => [...items].sort((a, b) => a.sort_order - b.sort_order);

/**
 * 拖拽后给被移动项算一个新的 sort_order。
 * 返回 null 表示中点算不出严格介于两邻居之间的值（邻居相等 / 浮点塌缩 / next 为 0），调用方应整体归一化。
 */
const computeMovedSortOrder = (orderedItems: TDataDictionaryItem[], movedId: string): number | null => {
  const index = orderedItems.findIndex((item) => item.id === movedId);
  if (index === -1) return null;
  const prev = orderedItems[index - 1]?.sort_order;
  const next = orderedItems[index + 1]?.sort_order;
  let value: number;
  if (prev !== undefined && next !== undefined) value = (prev + next) / 2;
  else if (next !== undefined) value = next / 2;
  else if (prev !== undefined) value = prev + SORT_ORDER_STEP;
  else return orderedItems[index].sort_order;
  const aboveLow = prev === undefined || value > prev;
  const belowHigh = next === undefined || value < next;
  return aboveLow && belowHigh ? value : null;
};

type TUseDataDictionariesOptions = {
  /** 默认 true。产品弹窗查看态等只读场景传 false，避免无谓请求。 */
  autoFetch?: boolean;
};

export const useDataDictionaries = (workspaceSlug: string | undefined, options?: TUseDataDictionariesOptions) => {
  const autoFetch = options?.autoFetch ?? true;
  const [dictionaries, setDictionaries] = useState<TDataDictionary[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && autoFetch));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDictionaries = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await dataDictionaryService.list(workspaceSlug);
      setDictionaries(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    if (!autoFetch) return;
    void fetchDictionaries().catch(() => undefined);
  }, [autoFetch, fetchDictionaries]);

  const getDictionaryByKey = useCallback(
    (key: string) => dictionaries.find((dictionary) => dictionary.key === key),
    [dictionaries]
  );

  const patchDictionary = useCallback(
    (dictionaryId: string, patch: (dictionary: TDataDictionary) => TDataDictionary) => {
      setDictionaries((current) =>
        current.map((dictionary) => (dictionary.id === dictionaryId ? patch(dictionary) : dictionary))
      );
    },
    []
  );

  const createDictionary = useCallback(
    async (payload: TCreateDataDictionaryPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await dataDictionaryService.create(workspaceSlug, payload);
        setDictionaries((current) => [...current, response]);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const updateDictionary = useCallback(
    async (dictionaryId: string, payload: TUpdateDataDictionaryPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await dataDictionaryService.update(workspaceSlug, dictionaryId, payload);
        // 更新接口也会带 items 回来；万一没带，保留本地的
        patchDictionary(dictionaryId, (dictionary) => ({ ...dictionary, ...response, items: response.items ?? dictionary.items }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [patchDictionary, workspaceSlug]
  );

  const deleteDictionary = useCallback(
    async (dictionaryId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await dataDictionaryService.deleteDictionary(workspaceSlug, dictionaryId);
        setDictionaries((current) => current.filter((dictionary) => dictionary.id !== dictionaryId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const createItem = useCallback(
    async (dictionaryId: string, payload: TCreateDataDictionaryItemPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await dataDictionaryService.createItem(workspaceSlug, dictionaryId, payload);
        patchDictionary(dictionaryId, (dictionary) => ({ ...dictionary, items: sortItems([...dictionary.items, response]) }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [patchDictionary, workspaceSlug]
  );

  const updateItem = useCallback(
    async (dictionaryId: string, itemId: string, payload: TUpdateDataDictionaryItemPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await dataDictionaryService.updateItem(workspaceSlug, dictionaryId, itemId, payload);
        patchDictionary(dictionaryId, (dictionary) => ({
          ...dictionary,
          items: sortItems(dictionary.items.map((item) => (item.id === itemId ? response : item))),
        }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [patchDictionary, workspaceSlug]
  );

  const deleteItem = useCallback(
    async (dictionaryId: string, itemId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await dataDictionaryService.deleteItem(workspaceSlug, dictionaryId, itemId);
        patchDictionary(dictionaryId, (dictionary) => ({
          ...dictionary,
          items: dictionary.items.filter((item) => item.id !== itemId),
        }));
      } finally {
        setIsMutating(false);
      }
    },
    [patchDictionary, workspaceSlug]
  );

  /**
   * 拖拽排序：`orderedItems` 是拖完后的完整顺序，`movedItem` 是被拖的那一项（Sortable.onChange 的两个参数原样传入）。
   * 乐观更新本地顺序；中点算不出来时对整个字典按 (i+1)*STEP 归一化；失败则重新拉取回滚。
   */
  const reorderItem = useCallback(
    async (dictionaryId: string, orderedItems: TDataDictionaryItem[], movedItem: TDataDictionaryItem) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const movedSortOrder = computeMovedSortOrder(orderedItems, movedItem.id);
      const optimisticItems =
        movedSortOrder === null
          ? orderedItems.map((item, index) => ({ ...item, sort_order: (index + 1) * SORT_ORDER_STEP }))
          : orderedItems.map((item) => (item.id === movedItem.id ? { ...item, sort_order: movedSortOrder } : item));
      patchDictionary(dictionaryId, (dictionary) => ({ ...dictionary, items: optimisticItems }));
      setIsMutating(true);
      try {
        if (movedSortOrder === null) {
          await Promise.all(
            optimisticItems.map((item) =>
              dataDictionaryService.updateItem(workspaceSlug, dictionaryId, item.id, { sort_order: item.sort_order })
            )
          );
        } else {
          await dataDictionaryService.updateItem(workspaceSlug, dictionaryId, movedItem.id, {
            sort_order: movedSortOrder,
          });
        }
      } catch (requestError) {
        await fetchDictionaries().catch(() => undefined);
        throw requestError;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDictionaries, patchDictionary, workspaceSlug]
  );

  return {
    dictionaries,
    isLoading,
    isMutating,
    error,
    fetchDictionaries,
    getDictionaryByKey,
    createDictionary,
    updateDictionary,
    deleteDictionary,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
  };
};
