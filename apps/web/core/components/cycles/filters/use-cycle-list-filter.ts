import { useEffect } from "react";
import { useTranslation } from "@plane/i18n";
import type { TFilterConfig } from "@plane/types";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
import type { TCycleFilterProperty } from "./types";
import { useCycleFiltersConfig } from "./use-cycle-filters-config";

/**
 * 迭代列表的筛选实例。实例本身放在 CycleFilterStore（按项目键），这样 `getFilteredCycleIds`
 * 能直接读表达式做本地匹配，列表 / 空态 / 计数用的是同一份结果；这个 hook 只负责在挂载时把实例建出来，
 * 并把属性配置注册上去（页面根传 configs；页头只拿实例、不传）。
 */
export const useCycleListFilter = (projectId: string, configs?: TFilterConfig<TCycleFilterProperty>[]) => {
  const { t } = useTranslation();
  const { getRichFilter, getOrCreateRichFilter } = useCycleFilter();
  const filter = getRichFilter(projectId);
  const clearLabel = t("project_cycles.filters.clear_all");

  useEffect(() => {
    getOrCreateRichFilter(projectId);
  }, [projectId, getOrCreateRichFilter]);

  useEffect(() => {
    if (!filter) return;
    filter.updateExpressionOptions({ clearFilterOptions: { label: clearLabel, onFilterClear: () => undefined } });
  }, [filter, clearLabel]);

  useEffect(() => {
    if (!filter || !configs) return;
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [filter, configs]);

  return filter;
};

/** 列表页根调一次：拼筛选属性配置并注册到项目的筛选实例上，返回实例给 FiltersRow */
export const useCycleListFiltering = (workspaceSlug: string, projectId: string) => {
  const configs = useCycleFiltersConfig({ workspaceSlug, projectId });
  return useCycleListFilter(projectId, configs);
};
