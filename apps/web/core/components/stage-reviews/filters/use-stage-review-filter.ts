import { useEffect, useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { stageReviewFiltersAdapter } from "./adapter";
import type { TStageReviewFilterExpression, TStageReviewFilterProperty } from "./types";

/**
 * 筛选行的实例。条件按项目记在本地：切阶段不清空，下次进来还是上次的筛选。
 * 筛选全在前端做 —— 一个阶段是几十条量级，没有必要再打一次接口。
 */
export const useStageReviewFilter = ({
  areAllConfigsInitialized,
  configs,
  projectId,
}: {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TStageReviewFilterProperty>[];
  projectId: string;
}) => {
  const { t } = useTranslation();
  const storageKey = `stage-reviews-filter:${projectId}`;
  const clearLabel = t("stage_review.list.clear_filters");

  const filter = useMemo(
    () =>
      new FilterInstance<TStageReviewFilterProperty, TStageReviewFilterExpression>({
        adapter: stageReviewFiltersAdapter,
        initialExpression: getValueFromLocalStorage(storageKey, {}) as TStageReviewFilterExpression,
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
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
