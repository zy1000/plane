/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilterInstance, workItemFiltersAdapter } from "@plane/shared-state";
import type { TFilterConfig, TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";

type TProps = {
  instanceKey: string;
  configs: TFilterConfig<TWorkItemFilterProperty>[];
  onExpressionChange: (expression: TWorkItemFilterExpression) => void;
};

/**
 * 产品工作项页的筛选实例。表达式沿用工作项富筛选的格式（workItemFiltersAdapter），
 * 原样 JSON 化发给后端，由 IssueComplexFilterBackend 解析，不需要另写转换。
 */
export const useProductWorkItemsFilter = ({ instanceKey, configs, onExpressionChange }: TProps) => {
  const expressionChangeRef = useRef(onExpressionChange);

  useEffect(() => {
    expressionChangeRef.current = onExpressionChange;
  }, [onExpressionChange]);

  const filter = useMemo(
    () =>
      new FilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>({
        adapter: workItemFiltersAdapter,
        initialExpression: {},
        onExpressionChange: (expression) => expressionChangeRef.current(expression),
      }),
    // 换产品时重建实例，条件不带到别的产品
    [instanceKey]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [configs, filter]);

  return filter;
};
