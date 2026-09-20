/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import { FilterItem } from "@/components/rich-filters/filter-item/root";

type TPlanCaseFiltersInlineProps<K extends TFilterProperty, E extends TExternalFilter> = {
  filter: IFilterInstance<K, E>;
};

/**
 * 已选筛选条件的行内展示：接在页头信息后面，没有条件时整段不渲染，
 * 不再单独占一行。
 */
export const PlanCaseFiltersInline = observer(function PlanCaseFiltersInline<
  K extends TFilterProperty,
  E extends TExternalFilter,
>({ filter }: TPlanCaseFiltersInlineProps<K, E>) {
  const conditions = filter.allConditionsForDisplay;
  if (conditions.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span aria-hidden className="h-4 w-px shrink-0 bg-subtle" />
      {conditions.map((condition) => (
        <FilterItem key={condition.id} filter={filter} condition={condition} />
      ))}
      {filter.canClearFilters && (
        <button
          type="button"
          onClick={filter.clearFilters}
          className="rounded px-1 text-12 text-accent-primary transition-colors hover:text-accent-primary-hover"
        >
          清除
        </button>
      )}
    </div>
  );
});
