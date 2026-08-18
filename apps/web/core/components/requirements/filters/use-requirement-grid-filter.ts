import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig, TRequirementFilter } from "@plane/types";
import { requirementGridFiltersAdapter } from "./adapter";
import { getRequirementFiltersFromExpression } from "./expression-to-requirement-filters";
import type { TRequirementGridFilterExpression, TRequirementGridFilterProperty } from "./types";

type TUseRequirementGridFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TRequirementGridFilterProperty>[];
  initialFilters?: TRequirementFilter[];
  instanceKey: string;
  onFiltersChange?: (filters: TRequirementFilter[]) => void;
};

export const useRequirementGridFilter = ({
  areAllConfigsInitialized,
  configs,
  initialFilters,
  instanceKey,
  onFiltersChange,
}: TUseRequirementGridFilterProps) => {
  const filtersChangeRef = useRef<TUseRequirementGridFilterProps["onFiltersChange"]>(onFiltersChange);
  const initialFiltersRef = useRef(initialFilters);

  useEffect(() => {
    filtersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  initialFiltersRef.current = initialFilters;

  const filter = useMemo(
    () =>
      new FilterInstance<TRequirementGridFilterProperty, TRequirementGridFilterExpression>({
        adapter: requirementGridFiltersAdapter,
        initialExpression: { filters: initialFiltersRef.current ?? [] },
        onExpressionChange: (expression) => {
          filtersChangeRef.current?.(getRequirementFiltersFromExpression(expression));
        },
        options: {
          expression: {
            clearFilterOptions: {
              label: "清除筛选",
              onFilterClear: () => undefined,
            },
          },
        },
      }),
    [instanceKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
