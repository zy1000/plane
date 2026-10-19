"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ListFilter, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import { FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { AddFilterButton } from "@/components/rich-filters/add-filters/button";
import type { useRequirementGridFilter } from "./filters";
import { RequirementDisplayProperties } from "./requirement-display-properties";

/**
 * 需求数据页视图行右侧的通用按钮外观：32px 高、图标 + 文字、13px 字。
 * propel 的 xl 档是 14px 字，这里用 body-xs 盖回 13（同属一组 typography，后者生效）。
 */
export const REQUIREMENT_TOOLBAR_BUTTON_CLASS = "gap-1.5 rounded-lg px-3 text-body-xs-medium";

type TFilter = ReturnType<typeof useRequirementGridFilter>;

type TProps = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filter: TFilter;
  displayColumns: { id: string; name: string; locked?: boolean }[];
  hiddenIds: string[];
  onToggleDisplay: (id: string) => void;
};

/**
 * 常驻搜索框 + 「筛选」「显示」两个带字按钮。产品需求页的默认视图与类型视图共用，
 * 切视图时右上角这一排长得一样。
 *
 * 筛选沿用 FiltersToggle 的两态：还没有条件且筛选行收着时，点开是「选一个属性」的下拉；
 * 已有条件时点它收放筛选行，并高亮提示「当前有筛选」。
 */
export const RequirementDataToolbar = observer(function RequirementDataToolbar(props: TProps) {
  const { search, onSearchChange, searchPlaceholder, filter, displayColumns, hiddenIds, onToggleDisplay } = props;
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== searchInputRef.current) setSearchInput(search);
  }, [search]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  // 300ms 防抖，避免每敲一个字就打一次接口
  const scheduleSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => onSearchChange(value), 300);
  };

  const commitSearch = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    onSearchChange(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commitSearch(searchInput.trim());
    if (event.key === "Escape") {
      if (searchInput) commitSearch("");
      else searchInputRef.current?.blur();
    }
  };

  const hasConditions = (filter?.allConditionsForDisplay.length ?? 0) > 0;
  const isFilterRowVisible = filter?.isVisible ?? false;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label className="flex h-8 w-[220px] shrink-0 items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-2.5 text-placeholder focus-within:border-accent-strong">
        <SearchIcon className="size-[15px] shrink-0" />
        <input
          ref={searchInputRef}
          className="min-w-0 flex-1 border-none bg-transparent p-0 text-13 text-primary placeholder:text-placeholder focus:outline-none"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
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
      {filter && !hasConditions && !isFilterRowVisible ? (
        <AddFilterButton
          filter={filter}
          buttonConfig={{
            label: t("common.filters"),
            variant: "secondary",
            size: "xl",
            className: REQUIREMENT_TOOLBAR_BUTTON_CLASS,
            iconConfig: { shouldShowIcon: true, iconComponent: ListFilter },
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
          onClick={() => filter?.toggleVisibility()}
          disabled={!filter}
        >
          <ListFilter className="size-[15px] shrink-0" />
          {t("common.filters")}
        </Button>
      )}
      <FiltersDropdown
        title={t("common.display")}
        placement="bottom-end"
        menuButton={
          <span className={cn(getButtonStyling("secondary", "xl"), REQUIREMENT_TOOLBAR_BUTTON_CLASS)}>
            <SlidersHorizontal className="size-[15px] shrink-0" />
            {t("common.display")}
          </span>
        }
      >
        <RequirementDisplayProperties columns={displayColumns} hiddenIds={hiddenIds} onToggle={onToggleDisplay} />
      </FiltersDropdown>
    </div>
  );
});
