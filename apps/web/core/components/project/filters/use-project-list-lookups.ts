import { useCallback, useMemo } from "react";
import type { TDataDictionary, TDataDictionaryItem, TDataDictionaryItemLite } from "@plane/types";
import { EProjectDictionaryKey } from "@plane/types";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";

export type TProjectDictionaryField = "status" | "project_type" | "business_unit";

const DICTIONARY_KEY_BY_FIELD: Record<TProjectDictionaryField, EProjectDictionaryKey> = {
  status: EProjectDictionaryKey.STATUS,
  project_type: EProjectDictionaryKey.PROJECT_TYPE,
  business_unit: EProjectDictionaryKey.BUSINESS_UNIT,
};

export type TProjectListLookups = {
  isLoading: boolean;
  getDictionary: (field: TProjectDictionaryField) => TDataDictionary | undefined;
  /**
   * 按字典值 id 取值。轻量列表接口只回 id 不回 `*_detail`，表格与筛选选项都靠这里把 id 翻成文字 / 颜色；
   * 字典没到或 id 已不在字典里（值被删了）时回退到项目自带的 `*_detail`。
   */
  resolveItem: (
    field: TProjectDictionaryField,
    id: string | null | undefined,
    fallback?: TDataDictionaryItemLite | null
  ) => { item: TDataDictionaryItemLite; dictionary: Pick<TDataDictionary, "is_colored"> | null } | undefined;
};

const toLite = (item: TDataDictionaryItem, dictionary: TDataDictionary): TDataDictionaryItemLite => ({
  id: item.id,
  label: item.label,
  dictionary: item.dictionary,
  color: item.color,
  is_colored: dictionary.is_colored,
});

/** 项目列表页一次拉全量字典，表格列与筛选选项共用；页面根调一次往下传，别在每行里各拉一份 */
export const useProjectListLookups = (workspaceSlug: string | undefined): TProjectListLookups => {
  const { dictionaries, isLoading } = useDataDictionaries(workspaceSlug);

  const byField = useMemo(() => {
    const map = new Map<TProjectDictionaryField, { dictionary: TDataDictionary; items: Map<string, TDataDictionaryItemLite> }>();
    for (const field of Object.keys(DICTIONARY_KEY_BY_FIELD) as TProjectDictionaryField[]) {
      const dictionary = dictionaries.find((entry) => entry.key === DICTIONARY_KEY_BY_FIELD[field]);
      if (!dictionary) continue;
      map.set(field, {
        dictionary,
        items: new Map(dictionary.items.map((item) => [item.id, toLite(item, dictionary)])),
      });
    }
    return map;
  }, [dictionaries]);

  const getDictionary = useCallback((field: TProjectDictionaryField) => byField.get(field)?.dictionary, [byField]);

  const resolveItem = useCallback<TProjectListLookups["resolveItem"]>(
    (field, id, fallback) => {
      if (!id) return undefined;
      const entry = byField.get(field);
      const item = entry?.items.get(id);
      if (item && entry) return { item, dictionary: entry.dictionary };
      if (fallback) return { item: fallback, dictionary: null };
      return undefined;
    },
    [byField]
  );

  return { isLoading, getDictionary, resolveItem };
};
