/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { caseFiltersAdapter } from "./adapter";
import type { TCaseFilterExpression, TCaseFilterProperty } from "./types";

type TUseCasesFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TCaseFilterProperty>[];
  initialExpression?: TCaseFilterExpression;
  instanceKey: string;
  onExpressionChange?: (expression: TCaseFilterExpression) => void;
};

export const useCasesFilter = ({
  areAllConfigsInitialized,
  configs,
  initialExpression,
  instanceKey,
  onExpressionChange,
}: TUseCasesFilterProps) => {
  const expressionChangeRef = useRef<TUseCasesFilterProps["onExpressionChange"]>(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(
    () =>
      new FilterInstance<TCaseFilterProperty, TCaseFilterExpression>({
        adapter: caseFiltersAdapter,
        initialExpression: initialExpression ?? {},
        onExpressionChange: (expression) => expressionChangeRef.current?.(expression),
      }),
    [initialExpression, instanceKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
