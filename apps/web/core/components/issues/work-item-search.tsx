/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { IconButton } from "@plane/propel/icon-button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { TWorkItemFilterProperty } from "@plane/types";
import { EIssuesStoreType, EXTENDED_EQUALITY_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";

type TWorkItemSearchProps = {
  entityType: EIssuesStoreType;
  entityId: string;
  className?: string;
};

const NAME_FILTER_PROPERTY: TWorkItemFilterProperty = "name";
const NAME_FILTER_OPERATOR = EXTENDED_EQUALITY_OPERATOR.CONTAINS;

export const WorkItemSearch = observer(function WorkItemSearch(props: TWorkItemSearchProps) {
  const { className, entityId, entityType } = props;
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  // store hooks
  const { getFilter } = useWorkItemFilters();
  const filter = getFilter(entityType, entityId);
  // derived values
  const searchCondition = filter?.findFirstConditionByPropertyAndOperator(NAME_FILTER_PROPERTY, NAME_FILTER_OPERATOR);
  const appliedSearchQuery = typeof searchCondition?.value === "string" ? searchCondition.value : "";
  // states
  const [isSearchOpen, setIsSearchOpen] = useState(() => appliedSearchQuery.trim().length > 0);
  const [inputValue, setInputValue] = useState(appliedSearchQuery);

  const applySearchQuery = useCallback(
    (query: string) => {
      if (!filter) return;

      const trimmedQuery = query.trim();
      const existingCondition = filter.findFirstConditionByPropertyAndOperator(NAME_FILTER_PROPERTY, NAME_FILTER_OPERATOR);

      if (!trimmedQuery) {
        if (existingCondition) filter.removeCondition(existingCondition.id);
        return;
      }

      if (existingCondition) {
        filter.updateConditionValue(existingCondition.id, trimmedQuery);
        return;
      }

      filter.addCondition(
        LOGICAL_OPERATOR.AND,
        {
          property: NAME_FILTER_PROPERTY,
          operator: NAME_FILTER_OPERATOR,
          value: trimmedQuery,
        },
        false
      );
    },
    [filter]
  );

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setInputValue(appliedSearchQuery);
    if (appliedSearchQuery.trim().length > 0) setIsSearchOpen(true);
  }, [appliedSearchQuery]);

  useOutsideClickDetector(inputRef, () => {
    if (isSearchOpen && inputValue.trim() === "") setIsSearchOpen(false);
  });

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmedQuery = inputValue.trim();
      setInputValue(trimmedQuery);
      applySearchQuery(trimmedQuery);
      return;
    }

    if (e.key === "Escape") {
      if (inputValue.trim() !== "") {
        setInputValue("");
        applySearchQuery("");
      } else {
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className={cn("flex items-center", className)}>
      {!isSearchOpen && (
        <IconButton
          variant="ghost"
          size="lg"
          className="-mr-1"
          onClick={() => {
            setIsSearchOpen(true);
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          icon={SearchIcon}
        />
      )}
      <div
        className={cn(
          "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
          {
            "w-30 border-subtle px-2.5 py-1.5 opacity-100 md:w-64": isSearchOpen,
          }
        )}
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <input
          ref={inputRef}
          className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
          placeholder="搜索工作项名称"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        {isSearchOpen && (
          <button
            type="button"
            className="grid place-items-center"
            onClick={() => {
              setInputValue("");
              applySearchQuery("");
              setIsSearchOpen(false);
            }}
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
});
