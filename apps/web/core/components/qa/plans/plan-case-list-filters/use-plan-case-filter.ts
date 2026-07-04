/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { planCaseFiltersAdapter } from "./adapter";
import type { TPlanCaseFilterExpression, TPlanCaseFilterProperty } from "./types";

type TUsePlanCaseFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TPlanCaseFilterProperty>[];
  initialExpression?: TPlanCaseFilterExpression;
  instanceKey: string;
  onExpressionChange?: (expression: TPlanCaseFilterExpression) => void;
};

export const usePlanCaseFilter = ({
  areAllConfigsInitialized,
  configs,
  initialExpression,
  instanceKey,
  onExpressionChange,
}: TUsePlanCaseFilterProps) => {
  const expressionChangeRef = useRef<TUsePlanCaseFilterProps["onExpressionChange"]>(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(() => {
    void instanceKey;
    return new FilterInstance<TPlanCaseFilterProperty, TPlanCaseFilterExpression>({
      adapter: planCaseFiltersAdapter,
      initialExpression: initialExpression ?? {},
      onExpressionChange: (expression) => expressionChangeRef.current?.(expression),
    });
  }, [initialExpression, instanceKey]);

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
