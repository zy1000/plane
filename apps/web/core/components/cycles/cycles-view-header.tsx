/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { SlidersHorizontal } from "lucide-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { IconButton } from "@plane/propel/icon-button";
import { useTranslation } from "@plane/i18n";
import { SearchIcon, CloseIcon } from "@plane/propel/icons";
import type { TCycleDisplayProperties, TCycleOrderByOptions } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
// hooks
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
// local imports
import { CycleDisplayFiltersSelection } from "./dropdowns";
import { useCycleListFilter } from "./filters/use-cycle-list-filter";

type Props = {
  projectId: string;
};

type TCycleListDisplayFilters = {
  group_by?: "state" | "owned_by" | "release" | "none";
  order_by?: TCycleOrderByOptions;
  display_properties?: TCycleDisplayProperties;
};

export const CyclesViewHeader = observer(function CyclesViewHeader(props: Props) {
  const { projectId } = props;
  // refs
  const inputRef = useRef<HTMLInputElement>(null);
  // hooks
  const { currentProjectDisplayFilters, searchQuery, updateDisplayFilters, updateSearchQuery } = useCycleFilter();
  const { t } = useTranslation();
  // 筛选实例在 store 里按项目一份；页头只拿实例，属性配置由列表页根注册
  const filter = useCycleListFilter(projectId);
  // states
  const [isSearchOpen, setIsSearchOpen] = useState(searchQuery !== "" ? true : false);
  // outside click detector hook
  useOutsideClickDetector(inputRef, () => {
    if (isSearchOpen && searchQuery.trim() === "") setIsSearchOpen(false);
  });

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (searchQuery && searchQuery.trim() !== "") updateSearchQuery("");
      else {
        setIsSearchOpen(false);
        inputRef.current?.blur();
      }
    }
  };

  const handleDisplayFiltersUpdate = useCallback(
    (displayFilters: Partial<TCycleListDisplayFilters>) => {
      if (!projectId) return;
      updateDisplayFilters(projectId, displayFilters as Parameters<typeof updateDisplayFilters>[1]);
    },
    [projectId, updateDisplayFilters]
  );

  useEffect(() => {
    if (searchQuery.trim() !== "") setIsSearchOpen(true);
  }, [searchQuery]);

  return (
    <div className="flex items-center gap-2">
      {!isSearchOpen ? (
        <IconButton
          variant="ghost"
          size="lg"
          onClick={() => {
            setIsSearchOpen(true);
            inputRef.current?.focus();
          }}
          icon={SearchIcon}
        />
      ) : (
        <div
          className={cn(
            "ml-auto flex w-0 items-center justify-start gap-1 overflow-hidden rounded-md border border-transparent bg-surface-1 text-placeholder opacity-0 transition-[width] ease-linear",
            {
              "w-64 border-subtle px-2.5 py-1.5 opacity-100": isSearchOpen,
            }
          )}
        >
          <SearchIcon className="h-3.5 w-3.5" />
          <input
            ref={inputRef}
            className="w-full max-w-[234px] border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => updateSearchQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {isSearchOpen && (
            <button
              type="button"
              className="grid place-items-center"
              onClick={() => {
                updateSearchQuery("");
                setIsSearchOpen(false);
              }}
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <FiltersToggle filter={filter} enableQuickAddFilter={false} />
      <FiltersDropdown
        title={t("common.display")}
        placement="bottom-end"
        miniIcon={<SlidersHorizontal className="size-3.5" />}
      >
        <CycleDisplayFiltersSelection
          displayFilters={currentProjectDisplayFilters ?? {}}
          handleDisplayFiltersUpdate={handleDisplayFiltersUpdate}
        />
      </FiltersDropdown>
    </div>
  );
});
