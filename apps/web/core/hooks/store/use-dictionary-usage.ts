import { useCallback, useEffect, useState } from "react";
import type { TDataDictionaryItemUsage, TDataDictionaryUsageEntity } from "@plane/types";
import { DataDictionaryService } from "@/services/data-dictionary.service";

const dataDictionaryService = new DataDictionaryService();

export type TDictionaryUsageMap = Map<string, TDataDictionaryItemUsage>;

/**
 * 设置页「引用」列的数据：切换字典即重拉；新增的值必然是 0，不用刷；
 * 删除被 409 挡住说明数据过期，调 refresh 纠正 blocking。
 */
export const useDictionaryUsage = (workspaceSlug: string | undefined, dictionaryId: string | undefined) => {
  const [usage, setUsage] = useState<TDictionaryUsageMap | null>(null);
  const [entity, setEntity] = useState<TDataDictionaryUsageEntity>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<boolean>(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!workspaceSlug || !dictionaryId) {
      setUsage(null);
      setEntity(null);
      return;
    }
    // 快速切换字典时，旧请求的响应不能覆盖新字典的数据
    let cancelled = false;
    setIsLoading(true);
    setError(false);
    dataDictionaryService
      .getUsage(workspaceSlug, dictionaryId)
      .then((response) => {
        if (cancelled) return;
        setEntity(response.entity);
        setUsage(new Map(response.items.map((item) => [item.item_id, item])));
      })
      .catch(() => {
        if (cancelled) return;
        setUsage(null);
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, dictionaryId, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { usage, entity, isLoading, error, refresh };
};
