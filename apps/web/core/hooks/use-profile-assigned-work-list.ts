import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";
// plane imports
import type {
  IProfileMetricItemsResponse,
  IProfileMetricRequirement,
  IProfileMetricWorkItem,
  TProfileMetricItem,
  TProfileMetricKey,
} from "@plane/types";
// services
import { UserService } from "@/services/user.service";

const userService = new UserService();

export const ASSIGNED_LIST_PAGE_SIZE = 50;

type TUseProfileAssignedList<T extends TProfileMetricItem> = {
  entityType: T["entity_type"];
  metric: TProfileMetricKey;
  userId: string | undefined;
  workspaceSlug: string | undefined;
};

type TUseProfileAssignedWorkList = Omit<TUseProfileAssignedList<IProfileMetricWorkItem>, "entityType">;

/** 按到期日排序、可滚动加载全部的个人待办列表（工作项 / 需求共用） */
export function useProfileAssignedList<T extends TProfileMetricItem>({
  entityType,
  metric,
  userId,
  workspaceSlug,
}: TUseProfileAssignedList<T>) {
  const getKey = (pageIndex: number, previousPageData: IProfileMetricItemsResponse | null) => {
    if (!workspaceSlug || !userId) return null;
    if (previousPageData && previousPageData.data.length < ASSIGNED_LIST_PAGE_SIZE) return null;
    return ["profile-assigned-work-list", workspaceSlug, userId, metric, pageIndex + 1] as const;
  };

  const { data, isLoading, isValidating, setSize, size } = useSWRInfinite(
    getKey,
    ([, slug, user, metricKey, page]) =>
      userService.getUserProfileMetricItems(slug, user, metricKey, {
        page,
        page_size: ASSIGNED_LIST_PAGE_SIZE,
        ordering: "target_date",
      }),
    { revalidateOnFocus: false, revalidateFirstPage: false }
  );

  const count = data?.[0]?.count ?? 0;
  const loadedCount = data?.reduce((total, page) => total + page.data.length, 0) ?? 0;
  const hasMore = !!data && loadedCount < count;
  const isLoadingMore = !!data && data.length < size;

  const loadMore = useCallback(() => {
    if (!hasMore || isValidating) return;
    void setSize((currentSize) => currentSize + 1);
  }, [hasMore, isValidating, setSize]);

  const items = data
    ? data.flatMap((page) => page.data).filter((item): item is T => item.entity_type === entityType)
    : undefined;

  return {
    count,
    hasMore,
    isLoading: isLoading && !data,
    isLoadingMore,
    items,
    loadMore,
  };
}

export function useProfileAssignedWorkList(args: TUseProfileAssignedWorkList) {
  return useProfileAssignedList<IProfileMetricWorkItem>({ ...args, entityType: "work_item" });
}

export function useProfileAssignedRequirementList(args: TUseProfileAssignedWorkList) {
  return useProfileAssignedList<IProfileMetricRequirement>({ ...args, entityType: "requirement" });
}
