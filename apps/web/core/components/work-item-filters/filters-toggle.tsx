/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { TWorkItemFilterExpression } from "@plane/types";
import type { EIssuesStoreType } from "@plane/types";
// components
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
// hooks
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";

type TWorkItemFiltersToggleProps = {
  entityType: EIssuesStoreType;
  entityId: string;
  initialExpression?: TWorkItemFilterExpression;
  filterRowHiddenOnMount?: boolean;
};

export const WorkItemFiltersToggle = observer(function WorkItemFiltersToggle(props: TWorkItemFiltersToggleProps) {
  const { entityType, entityId, initialExpression: initialExpressionProp, filterRowHiddenOnMount } = props;
  // store hooks
  const { getFilter } = useWorkItemFilters();
  const initialExpression = initialExpressionProp;
  const existingFilter = getFilter(entityType, entityId);
  const filter = existingFilter;

  return <FiltersToggle filter={filter} />;
});
