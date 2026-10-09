import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@plane/hooks";

/**
 * 哪些评审收起了下面的评审活动。默认全部展开，只记收起的 id；同显示设置按「作用域 + 人」
 * 存在本地（`storageScope` 见 `getStageReviewStorageScope`），刷新、切组回来还是原样。
 */
export const useCollapsedStageReviews = (storageScope: string, userId: string | undefined) => {
  const { storedValue, setValue } = useLocalStorage<string[]>(
    `stage-reviews-collapsed:v1:${storageScope}:${userId ?? "anonymous"}`,
    []
  );
  const collapsedIds = useMemo(() => new Set(storedValue ?? []), [storedValue]);

  const toggle = useCallback(
    (reviewId: string) =>
      setValue(
        collapsedIds.has(reviewId) ? [...collapsedIds].filter((id) => id !== reviewId) : [...collapsedIds, reviewId]
      ),
    [collapsedIds, setValue]
  );

  /** 表头「全部展开 / 收起」：只动传进来的这批（当前这一组里能折叠的评审），别的组不受影响 */
  const setCollapsed = useCallback(
    (reviewIds: string[], collapsed: boolean) => {
      const next = new Set(collapsedIds);
      reviewIds.forEach((id) => (collapsed ? next.add(id) : next.delete(id)));
      setValue([...next]);
    },
    [collapsedIds, setValue]
  );

  return { collapsedIds, toggle, setCollapsed };
};
