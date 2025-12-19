import { observer } from "mobx-react";
// plane imports
import type { EIssuesStoreType } from "@plane/types";
// components
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";

type TWorkItemFiltersToggleProps = {
  entityType: EIssuesStoreType;
  entityId: string;
};

export const WorkItemFiltersToggle = observer(function WorkItemFiltersToggle(props: TWorkItemFiltersToggleProps) {
  const { entityType, entityId } = props;
  // store hooks
  const { getFilter, getOrCreateFilter } = useWorkItemFilters();
  const { issuesFilter } = useIssues(entityType);

  const filtersFromStore =
    (issuesFilter as any)?.getIssueFilters?.(entityId) ?? (issuesFilter as any)?.issueFilters ?? undefined;
  const initialExpression = filtersFromStore?.richFilters;

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
