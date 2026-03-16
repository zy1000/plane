/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
// components
import { Loader } from "@plane/ui";
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
// ui
// types

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string | string[]) => void;
  searchQuery: string;
  states: IState[] | undefined;
};

export const FilterState = observer(function FilterState(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery, states } = props;

  const [itemsToRender, setItemsToRender] = useState(5);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const appliedFiltersCount = appliedFilters?.length ?? 0;

  // Deduplicate states by name, accumulating all IDs per unique name so that
  // same-named states from different issue types are treated as a single option.
  const stateGroups = useMemo(() => {
    const groups = new Map<string, { state: IState; ids: string[] }>();
    for (const state of states ?? []) {
      const existing = groups.get(state.name);
      if (existing) {
        existing.ids.push(state.id);
      } else {
        groups.set(state.name, { state, ids: [state.id] });
      }
    }
    return Array.from(groups.values());
  }, [states]);

  const sortedOptions = useMemo(() => {
    const filtered = stateGroups.filter(({ state }) =>
      state.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return sortBy(filtered, [({ ids }) => !ids.some((id) => (appliedFilters ?? []).includes(id))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateGroups, searchQuery]);

  const handleViewToggle = () => {
    if (!sortedOptions) return;

    if (itemsToRender === sortedOptions.length) setItemsToRender(5);
    else setItemsToRender(sortedOptions.length);
  };

  return (
    <>
      <FilterHeader
        title={`State${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {sortedOptions ? (
            sortedOptions.length > 0 ? (
              <>
                {sortedOptions.slice(0, itemsToRender).map(({ state, ids }) => (
                  <FilterOption
                    key={state.name}
                    isChecked={ids.some((id) => appliedFilters?.includes(id)) ? true : false}
                    onClick={() => handleUpdate(ids.length === 1 ? ids[0] : ids)}
                    icon={
                      <StateGroupIcon
                        stateGroup={state.group}
                        color={state.color}
                        size={EIconSize.MD}
                        percentage={state?.order}
                      />
                    }
                    title={state.name}
                  />
                ))}
                {sortedOptions.length > 5 && (
                  <button
                    type="button"
                    className="ml-8 text-11 font-medium text-accent-primary"
                    onClick={handleViewToggle}
                  >
                    {itemsToRender === sortedOptions.length ? "View less" : "View all"}
                  </button>
                )}
              </>
            ) : (
              <p className="text-11 text-placeholder italic">No matches found</p>
            )
          ) : (
            <Loader className="space-y-2">
              <Loader.Item height="20px" />
              <Loader.Item height="20px" />
              <Loader.Item height="20px" />
            </Loader>
          )}
        </div>
      )}
    </>
  );
});
