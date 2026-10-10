import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import type { IFilterInstance } from "@plane/shared-state";
import type { TExternalFilter, TFilterProperty } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { AddFilterButton } from "@/components/rich-filters/add-filters/button";

export type TDetailTab = "matrix" | "items" | "activity" | "comments";

/**
 * Tab 条：左边四个 Tab（数量直接写在名字后面），右边是当前 Tab 自己的工具
 * （矩阵与明细的搜索、筛选，矩阵的产品翻页与加轴，变更历史的类型筛选）。
 */
export const DetailTabBar = ({
  tabs,
  active,
  onChange,
  tools,
}: {
  tabs: { key: TDetailTab; label: string; count?: number }[];
  active: TDetailTab;
  onChange: (tab: TDetailTab) => void;
  tools?: ReactNode;
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-x-1 border-b border-subtle pr-5 pl-3">
    {tabs.map((entry) => {
      const isActive = entry.key === active;
      return (
        <button
          key={entry.key}
          type="button"
          className={cn(
            "-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 text-13 transition-colors",
            isActive
              ? "border-accent-strong font-semibold text-primary"
              : "border-transparent font-medium text-secondary hover:text-primary"
          )}
          onClick={() => onChange(entry.key)}
        >
          {entry.label}
          {typeof entry.count === "number" && (
            <span className="font-normal text-placeholder tabular-nums">{entry.count}</span>
          )}
        </button>
      );
    })}
    {tools && <div className="ml-auto flex items-center gap-2 py-1.5">{tools}</div>}
  </div>
);

/** Tab 条右侧的下拉筛选：「显示 全部 ▾」。选项后面可以带数量 */
export const TabBarSelect = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) => {
  const current = options.find((option) => option.key === value) ?? options[0];
  return (
    <CustomMenu
      customButton={
        <span className="flex h-7.5 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 whitespace-nowrap text-primary hover:bg-layer-1">
          <span className="text-tertiary">{label}</span>
          <span className="max-w-40 truncate">{current?.label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
        </span>
      }
      placement="bottom-end"
      maxHeight="lg"
      closeOnSelect
    >
      {options.map((option) => (
        <CustomMenu.MenuItem
          key={option.key}
          onClick={() => onChange(option.key)}
          className="flex min-w-32 items-center gap-2"
        >
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {typeof option.count === "number" && (
            <span className="text-12 text-placeholder tabular-nums">{option.count}</span>
          )}
          <Check
            className={cn("size-3.5 shrink-0 text-accent-primary", option.key !== value && "invisible")}
            strokeWidth={2.4}
          />
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};

/** Tab 条右侧常驻的搜索框：矩阵与明细共用一个搜索词，按编号或名称收窄 */
export const TabBarSearch = ({
  value,
  placeholder,
  clearLabel,
  onChange,
}: {
  value: string;
  placeholder: string;
  clearLabel: string;
  onChange: (value: string) => void;
}) => (
  <label className="flex h-7 w-56 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
    <Search className="size-3.5 shrink-0 text-placeholder" />
    <input
      value={value}
      aria-label={placeholder}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && value) onChange("");
      }}
      className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
    />
    {value && (
      <button
        type="button"
        aria-label={clearLabel}
        className="grid size-4 shrink-0 place-items-center rounded text-placeholder hover:text-secondary"
        onClick={() => onChange("")}
      >
        <X className="size-3" />
      </button>
    )}
  </label>
);

/**
 * Tab 条上的「筛选」：还没有条件时点开直接选属性（选完筛选行出现）；
 * 有条件后显示条数、点一下收起 / 展开筛选行。
 */
export const TabBarFilterButton = observer(function TabBarFilterButton<
  P extends TFilterProperty,
  E extends TExternalFilter,
>({ filter, label }: { filter: IFilterInstance<P, E>; label: string }) {
  const count = filter.allConditionsForDisplay.length;
  if (count === 0 && !filter.isVisible) {
    return (
      <AddFilterButton
        filter={filter}
        buttonConfig={{
          label,
          variant: "secondary",
          size: "lg",
          iconConfig: { shouldShowIcon: true, iconComponent: ListFilter },
        }}
        onFilterSelect={() => filter.toggleVisibility(true)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-expanded={filter.isVisible}
      onClick={() => filter.toggleVisibility()}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md border px-2 text-13 font-medium whitespace-nowrap",
        count > 0
          ? "border-accent-subtle-1 bg-accent-subtle text-accent-primary"
          : "border-subtle bg-surface-1 text-secondary hover:bg-layer-1"
      )}
    >
      <ListFilter className="size-4" />
      {label}
      {count > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent-primary px-1 text-11 font-semibold text-on-color tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
});
