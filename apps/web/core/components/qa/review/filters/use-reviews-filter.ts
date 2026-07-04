/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig } from "@plane/types";
import { reviewFiltersAdapter } from "./adapter";
import type { TReviewFilterExpression, TReviewFilterProperty } from "./types";

type TUseReviewsFilterProps = {
  areAllConfigsInitialized: boolean;
  configs: TFilterConfig<TReviewFilterProperty>[];
  initialExpression?: TReviewFilterExpression;
  instanceKey: string;
  onExpressionChange?: (expression: TReviewFilterExpression) => void;
};

export const useReviewsFilter = ({
  areAllConfigsInitialized,
  configs,
  initialExpression,
  instanceKey,
  onExpressionChange,
}: TUseReviewsFilterProps) => {
  const expressionChangeRef = useRef<TUseReviewsFilterProps["onExpressionChange"]>(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(
    () =>
      new FilterInstance<TReviewFilterProperty, TReviewFilterExpression>({
        adapter: reviewFiltersAdapter,
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
