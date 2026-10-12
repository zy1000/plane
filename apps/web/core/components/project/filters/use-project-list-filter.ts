import { useEffect } from "react";
import { useTranslation } from "@plane/i18n";
import type { TFilterConfig, TProjectFilterProperty } from "@plane/types";
import { useProjectFilter } from "@/hooks/store/use-project-filter";

/**
 * 项目列表的筛选实例。实例本身放在 ProjectFilterStore（按工作区键），这样 `filteredProjectIds`
 * 能直接读表达式，表格 / 卡片 / 计数用的是同一份结果；这个 hook 只负责在挂载时把实例建出来，
 * 并把属性配置注册上去（页面根传 configs；页头只拿实例、不传）。
 */
export const useProjectListFilter = (
  workspaceSlug: string | undefined,
  configs?: TFilterConfig<TProjectFilterProperty>[]
) => {
  const { t } = useTranslation();
  const { getRichFilter, getOrCreateRichFilter } = useProjectFilter();
  const filter = workspaceSlug ? getRichFilter(workspaceSlug) : undefined;
  const clearLabel = t("workspace_projects.filters.clear_all");

  useEffect(() => {
    if (!workspaceSlug) return;
    getOrCreateRichFilter(workspaceSlug);
  }, [workspaceSlug, getOrCreateRichFilter]);

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
