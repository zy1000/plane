/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { IFilterInstance } from "@plane/shared-state";
import type { TWorkItemFilterExpression, TWorkItemFilterProperty } from "@plane/types";
import { cn } from "@plane/utils";
import { REQUIREMENT_TOOLBAR_BUTTON_CLASS } from "@/components/requirements/requirement-data-toolbar";
import { AddFilterButton } from "@/components/rich-filters/add-filters/button";

type TProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filter: IFilterInstance<TWorkItemFilterProperty, TWorkItemFilterExpression>;
};

/**
 * 常驻搜索框（300ms 防抖，回车立即搜、Esc 清空）+「筛选」按钮，外观同产品需求页工具栏。
 * 筛选沿用 FiltersToggle 的两态：没有条件时点开是「选一个属性」，有条件时收放筛选行。
 */
export const ProductWorkItemsToolbar = observer(function ProductWorkItemsToolbar(props: TProps) {
  const { search, onSearchChange, filter } = props;
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const placeholder = t("workspace_products.work_items.search_placeholder");

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  const scheduleSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearchChange(value.trim()), 300);
  };

  const commitSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    onSearchChange(value.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commitSearch(searchInput);
    if (event.key === "Escape") {
      if (searchInput) commitSearch("");
      else searchInputRef.current?.blur();
    }
  };

  const hasConditions = filter.allConditionsForDisplay.length > 0;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="flex h-7 w-[220px] shrink-0 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5 text-placeholder focus-within:border-accent-strong">
        <SearchIcon className="size-[15px] shrink-0" />
        <input
          ref={searchInputRef}
          className="min-w-0 flex-1 border-none bg-transparent p-0 text-13 text-primary placeholder:text-placeholder focus:outline-none"
          placeholder={placeholder}
          aria-label={placeholder}
          value={searchInput}
          onChange={(event) => scheduleSearch(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {searchInput && (
          <button
            type="button"
            className="grid shrink-0 place-items-center text-tertiary hover:text-primary"
            onClick={() => commitSearch("")}
            aria-label={t("common.clear")}
          >
            <CloseIcon className="size-3" />
          </button>
        )}
      </label>
      {!hasConditions && !filter.isVisible ? (
        <AddFilterButton
          filter={filter}
          buttonConfig={{
            label: t("common.filters"),
            variant: "secondary",
            size: "xl",
            className: REQUIREMENT_TOOLBAR_BUTTON_CLASS,
            iconConfig: { shouldShowIcon: false },
          }}
          onFilterSelect={() => filter.toggleVisibility(true)}
        />
      ) : (
        <Button
          variant="secondary"
          size="xl"
          className={cn(
            REQUIREMENT_TOOLBAR_BUTTON_CLASS,
            hasConditions && "border-accent-subtle bg-accent-subtle text-accent-primary hover:bg-accent-subtle-hover"
          )}
          onClick={() => filter.toggleVisibility()}
        >
          {t("common.filters")}
        </Button>
      )}
    </div>
  );
});
