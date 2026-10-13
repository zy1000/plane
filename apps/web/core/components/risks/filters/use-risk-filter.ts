import { useEffect, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { riskFiltersAdapter } from "./adapter";
import type { TRiskFilterExpression, TRiskFilterProperty } from "./types";

/**
 * 筛选行的实例。条件按项目记在本地：下次进来还是上次的筛选。
 * 筛选全在前端做 —— 一个项目的风险是几十条量级，没有必要再打一次接口。
 */
export const useRiskFilter = ({
  configs,
  projectId,
}: {
  configs: TFilterConfig<TRiskFilterProperty>[];
  projectId: string;
}) => {
  const { t } = useTranslation();
  const storageKey = `risks-filter:${projectId}`;
  const clearLabel = t("risk.summary.clear_filters");

  const filter = useMemo(
    () =>
      new FilterInstance<TRiskFilterProperty, TRiskFilterExpression>({
        adapter: riskFiltersAdapter,
        initialExpression: getValueFromLocalStorage(storageKey, {}) as TRiskFilterExpression,
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
