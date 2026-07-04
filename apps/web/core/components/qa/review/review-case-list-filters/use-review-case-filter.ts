/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { reviewCaseFiltersAdapter } from "./adapter";
import type { TReviewCaseFilterExpression, TReviewCaseFilterProperty } from "./types";

type TUseReviewCaseFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TReviewCaseFilterProperty>[];
  initialExpression?: TReviewCaseFilterExpression;
  instanceKey: string;
  onExpressionChange?: (expression: TReviewCaseFilterExpression) => void;
};

export const useReviewCaseFilter = ({
  areAllConfigsInitialized,
  configs,
  initialExpression,
  instanceKey,
  onExpressionChange,
}: TUseReviewCaseFilterProps) => {
  const expressionChangeRef = useRef<TUseReviewCaseFilterProps["onExpressionChange"]>(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(
    () => {
      void instanceKey;
      return new FilterInstance<TReviewCaseFilterProperty, TReviewCaseFilterExpression>({
        adapter: reviewCaseFiltersAdapter,
        initialExpression: initialExpression ?? {},
        onExpressionChange: (expression) => expressionChangeRef.current?.(expression),
      });
    },
    [initialExpression, instanceKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(areAllConfigsInitialized);
  }, [areAllConfigsInitialized, configs, filter]);

  return filter;
};
