import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { projectRequirementFiltersAdapter } from "./adapter";
import type { TProjectRequirementFilterExpression, TProjectRequirementFilterProperty } from "./types";

type TUseProjectRequirementFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TProjectRequirementFilterProperty>[];
  initialExpression?: TProjectRequirementFilterExpression;
  instanceKey: string;
  onExpressionChange?: (expression: TProjectRequirementFilterExpression) => void;
};

export const useProjectRequirementFilter = ({
  areAllConfigsInitialized,
  configs,
  initialExpression,
  instanceKey,
  onExpressionChange,
}: TUseProjectRequirementFilterProps) => {
  const expressionChangeRef = useRef<TUseProjectRequirementFilterProps["onExpressionChange"]>(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(
    () =>
      new FilterInstance<TProjectRequirementFilterProperty, TProjectRequirementFilterExpression>({
        adapter: projectRequirementFiltersAdapter,
        initialExpression: initialExpression ?? {},
        onExpressionChange: (expression) => expressionChangeRef.current?.(expression),
        options: {
          expression: {
            clearFilterOptions: {
              label: "清除筛选",
              onFilterClear: () => undefined,
            },
          },
        },
      }),
    [initialExpression, instanceKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
