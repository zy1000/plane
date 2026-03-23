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
import { useIssues } from "@/hooks/store/use-issues";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";

type TWorkItemFiltersToggleProps = {
  entityType: EIssuesStoreType;
  entityId: string;
  initialExpression?: TWorkItemFilterExpression;
};

export const WorkItemFiltersToggle = observer(function WorkItemFiltersToggle(props: TWorkItemFiltersToggleProps) {
  const { entityType, entityId, initialExpression: initialExpressionProp } = props;
  // store hooks
  const { getFilter, getOrCreateFilter } = useWorkItemFilters();
  const { issuesFilter } = useIssues(entityType);

  const filtersFromStore =
    (issuesFilter as any)?.getIssueFilters?.(entityId) ?? (issuesFilter as any)?.issueFilters ?? undefined;
  const initialExpression = initialExpressionProp ?? filtersFromStore?.richFilters;

  const filter =
    initialExpression === undefined
      ? getFilter(entityType, entityId)
      : getOrCreateFilter({
          entityType,
          entityId,
          initialExpression,
        });

  return <FiltersToggle filter={filter} />;
});
