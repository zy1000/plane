import { useEffect, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterInstance } from "@plane/shared-state";
import type { IFilterInstance } from "@plane/shared-state";
import type { TProduct } from "@plane/types";
import { useUser } from "@/hooks/store/user";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { productFiltersAdapter } from "./adapter";
import type { TProductFilterExpression, TProductFilterProperty } from "./types";
import { useProductFiltersConfig } from "./use-product-filters-config";

export type TProductRichFilter = IFilterInstance<TProductFilterProperty, TProductFilterExpression>;

const getFilterStorageKey = (workspaceSlug: string) => `products-filter:v1:${workspaceSlug}`;

/**
 * 产品列表的筛选实例。产品列表没有 MobX store，实例挂在 ProductsProvider 上按工作区建一个，
 * 页头（漏斗按钮）与列表（筛选行 + 匹配）拿的是同一份；条件记在本地，下次进来还是上次的筛选。
 */
export const useProductListFilterInstance = (workspaceSlug: string): TProductRichFilter =>
  useMemo(() => {
    const storageKey = getFilterStorageKey(workspaceSlug);
    return new FilterInstance<TProductFilterProperty, TProductFilterExpression>({
      adapter: productFiltersAdapter,
      initialExpression: getValueFromLocalStorage(storageKey, {}) as TProductFilterExpression,
      onExpressionChange: (expression) => setValueIntoLocalStorage(storageKey, expression),
    });
  }, [workspaceSlug]);

/**
 * 列表页根调一次：按已加载的产品拼筛选属性并注册到实例上。
 * 返回当前用户 id 给匹配器换「我」。
 */
export const useProductListFiltering = (workspaceSlug: string, filter: TProductRichFilter, products: TProduct[]) => {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const configs = useProductFiltersConfig({ workspaceSlug, products, currentUser: currentUser ?? undefined });
  const clearLabel = t("workspace_products.filters.clear_all");

  useEffect(() => {
    filter.updateExpressionOptions({ clearFilterOptions: { label: clearLabel, onFilterClear: () => undefined } });
  }, [filter, clearLabel]);

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [filter, configs]);

  return { currentUserId: currentUser?.id };
};
