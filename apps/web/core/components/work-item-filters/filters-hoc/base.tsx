/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { v4 as uuidv4 } from "uuid";
// plane imports
import type { TSaveViewOptions, TUpdateViewOptions } from "@plane/constants";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import type { IIssueFilters, TWorkItemFilterExpression } from "@plane/types";
// store hooks
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
// plane web imports
import type { TWorkItemFiltersEntityProps } from "@/plane-web/hooks/work-item-filters/use-work-item-filters-config";
import { useWorkItemFiltersConfig } from "@/plane-web/hooks/work-item-filters/use-work-item-filters-config";
// local imports
import type { TSharedWorkItemFiltersHOCProps, TSharedWorkItemFiltersProps } from "./shared";

type TAdditionalWorkItemFiltersProps = {
  saveViewOptions?: TSaveViewOptions<TWorkItemFilterExpression>;
  updateViewOptions?: TUpdateViewOptions<TWorkItemFilterExpression>;
} & TWorkItemFiltersEntityProps;

type TWorkItemFiltersHOCProps = TSharedWorkItemFiltersHOCProps & TAdditionalWorkItemFiltersProps;

export const WorkItemFiltersHOC = observer(function WorkItemFiltersHOC(props: TWorkItemFiltersHOCProps) {
  const { children, initialWorkItemFilters } = props;

  // Only initialize filter instance when initial work item filters are defined
  if (!initialWorkItemFilters)
    return <>{typeof children === "function" ? children({ filter: undefined }) : children}</>;

  return (
    <WorkItemFilterRoot {...props} initialWorkItemFilters={initialWorkItemFilters}>
      {children}
    </WorkItemFilterRoot>
  );
});

type TWorkItemFilterProps = TSharedWorkItemFiltersProps &
  TAdditionalWorkItemFiltersProps & {
    initialWorkItemFilters: IIssueFilters;
    children: React.ReactNode | ((props: { filter: IWorkItemFilterInstance }) => React.ReactNode);
  };

const WorkItemFilterRoot = observer(function WorkItemFilterRoot(props: TWorkItemFilterProps) {
  const {
    children,
    entityType,
    entityId,
    filtersToShowByLayout,
    initialWorkItemFilters,
    isTemporary,
    deleteOnUnmount,
    saveViewOptions,
    updateFilters,
    updateViewOptions,
    showOnMount,
    filterRowHiddenOnMount,
    ...entityConfigProps
  } = props;
  // store hooks
  const { getOrCreateFilter, deleteFilter } = useWorkItemFilters();
  // derived values
  const workItemEntityID = useMemo(
    () => (isTemporary ? `TEMP-${entityId ?? uuidv4()}` : entityId),
    [isTemporary, entityId]
  );
  // memoize initial values to prevent re-computations when reference changes
  const initialUserFilters = useMemo(() => initialWorkItemFilters.richFilters, [initialWorkItemFilters]);
  const workItemFiltersConfig = useWorkItemFiltersConfig({
    allowedFilters: filtersToShowByLayout ? filtersToShowByLayout : [],
    ...entityConfigProps,
  });
  // Hold the latest creation params in a ref so re-acquiring the instance does
  // not force the lifecycle effect to re-run on every option/callback change.
  const latestParams = { initialUserFilters, updateFilters, saveViewOptions, updateViewOptions, showOnMount, filterRowHiddenOnMount };
  const createParamsRef = useRef(latestParams);
  createParamsRef.current = latestParams;

  // Acquire (or create) the filter instance from the shared store. Idempotent:
  // returns the already-registered instance or creates and registers a new one.
  const acquireFilter = useCallback(() => {
    const params = createParamsRef.current;
    return getOrCreateFilter({
      entityType,
      entityId: workItemEntityID,
      initialExpression: params.initialUserFilters,
      onExpressionChange: params.updateFilters,
      expressionOptions: {
        saveViewOptions: params.saveViewOptions,
        updateViewOptions: params.updateViewOptions,
      },
      showOnMount: params.showOnMount,
      filterRowHiddenOnMount: params.filterRowHiddenOnMount,
    });
  }, [getOrCreateFilter, entityType, workItemEntityID]);

  const [workItemLayoutFilter, setWorkItemLayoutFilter] = useState(acquireFilter);

  // Lifecycle: re-register the instance on every mount and delete it only on a
  // real teardown. React StrictMode (dev) runs effects as setup → cleanup →
  // setup; re-acquiring on setup keeps the shared store populated after the
  // cleanup's deleteFilter, so external consumers (e.g. the header filter
  // toggle, which looks the instance up via getFilter) can always find it.
  useEffect(() => {
    setWorkItemLayoutFilter(acquireFilter());
    return () => {
      if (isTemporary !== true && deleteOnUnmount !== true) return;
      deleteFilter(entityType, workItemEntityID);
    };
  }, [acquireFilter, deleteFilter, deleteOnUnmount, entityType, isTemporary, workItemEntityID]);

  // Keep callbacks/options on the live instance in sync when they change.
  useEffect(() => {
    workItemLayoutFilter.onExpressionChange = updateFilters;
    workItemLayoutFilter.updateExpressionOptions({ saveViewOptions, updateViewOptions });
  }, [workItemLayoutFilter, updateFilters, saveViewOptions, updateViewOptions]);

  useEffect(() => {
    workItemLayoutFilter.configManager.setAreConfigsReady(workItemFiltersConfig.areAllConfigsInitialized);
    workItemLayoutFilter.configManager.registerAll(workItemFiltersConfig.configs);
  }, [
    workItemFiltersConfig.areAllConfigsInitialized,
    workItemFiltersConfig.configs,
    workItemLayoutFilter.configManager,
  ]);

  return <>{typeof children === "function" ? children({ filter: workItemLayoutFilter }) : children}</>;
});
