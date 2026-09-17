import { useEffect, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { tailoringFiltersAdapter } from "./adapter";
import type { TTailoringFilterExpression, TTailoringFilterProperty } from "./types";

/**
 * 筛选行的实例，照工作项的 rich filter。条件按项目记在本地，下次进来还是上次的筛选；
 * 一个项目的裁剪表是几张到几十张的量级，筛选全在前端做。
 */
export const useTailoringFilter = ({
  configs,
  projectId,
}: {
  configs: TFilterConfig<TTailoringFilterProperty>[];
  projectId: string;
}) => {
  const { t } = useTranslation();
  const storageKey = `review-tailorings-filter:${projectId}`;
  const clearLabel = t("review_tailoring.filters.clear_all");

  const filter = useMemo(
    () =>
      new FilterInstance<TTailoringFilterProperty, TTailoringFilterExpression>({
        adapter: tailoringFiltersAdapter,
        initialExpression: getValueFromLocalStorage(storageKey, {}) as TTailoringFilterExpression,
        onExpressionChange: (expression) => setValueIntoLocalStorage(storageKey, expression),
        options: {
          expression: {
            clearFilterOptions: { label: clearLabel, onFilterClear: () => undefined },
          },
        },
      }),
    // 实例只跟着项目换；文案在建实例时取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [configs, filter]);

  return filter;
};
