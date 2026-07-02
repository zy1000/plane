/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { DATE_BEFORE_FILTER_OPTIONS } from "@plane/constants";
import { isInDateFormat } from "@plane/utils";
// components
import { DateFilterModal } from "@/components/core/filters/date-filter-modal";
import type { TDateFilterModalLabels } from "@/components/core/filters/date-filter-modal";
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";

type Props = {
  appliedFilters: string[] | null;
  customLabel?: string;
  dateModalLabels?: TDateFilterModalLabels;
  handleUpdate: (val: string | string[]) => void;
  noMatchesLabel?: string;
  optionLabels?: Record<string, string>;
  searchQuery: string;
  title?: string;
};

export const FilterCreatedDate = observer(function FilterCreatedDate(props: Props) {
  const {
    appliedFilters,
    customLabel = "Custom",
    dateModalLabels,
    handleUpdate,
    noMatchesLabel = "No matches found",
    optionLabels,
    searchQuery,
    title = "Created date",
  } = props;

  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [isDateFilterModalOpen, setIsDateFilterModalOpen] = useState(false);

  const appliedFiltersCount = appliedFilters?.length ?? 0;

  const getOptionLabel = (option: (typeof DATE_BEFORE_FILTER_OPTIONS)[number]) =>
    optionLabels?.[option.value] ?? option.name;

  const filteredOptions = DATE_BEFORE_FILTER_OPTIONS.filter((d) =>
    getOptionLabel(d).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isCustomDateSelected = () => {
    const isValidDateSelected = appliedFilters?.filter((f) => isInDateFormat(f.split(";")[0])) || [];
    return isValidDateSelected.length > 0 ? true : false;
  };
  const handleCustomDate = () => {
    if (isCustomDateSelected()) {
      const updateAppliedFilters = appliedFilters?.filter((f) => f.includes("-")) || [];
      handleUpdate(updateAppliedFilters);
    } else setIsDateFilterModalOpen(true);
  };

  return (
    <>
      {isDateFilterModalOpen && (
        <DateFilterModal
          handleClose={() => setIsDateFilterModalOpen(false)}
          isOpen={isDateFilterModalOpen}
          labels={dateModalLabels}
          onSelect={(val) => handleUpdate(val)}
          title={title}
        />
      )}
      <FilterHeader
        title={`${title}${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((option) => (
                <FilterOption
                  key={option.value}
                  isChecked={appliedFilters?.includes(option.value) ? true : false}
                  onClick={() => handleUpdate(option.value)}
                  title={getOptionLabel(option)}
                  multiple
                />
              ))}
              <FilterOption
                isChecked={isCustomDateSelected()}
                onClick={handleCustomDate}
                title={customLabel}
                multiple
              />
            </>
          ) : (
            <p className="text-11 text-placeholder italic">{noMatchesLabel}</p>
          )}
        </div>
      )}
    </>
  );
});
