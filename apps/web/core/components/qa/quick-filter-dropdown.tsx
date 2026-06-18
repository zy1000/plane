"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { cn } from "@plane/utils";

export type QuickFilterItem = {
  key: string;
  label: string;
  dotColor?: string;
  Icon?: LucideIcon;
  count: number;
};

type QuickFilterDropdownProps = {
  items: QuickFilterItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

const Dot = ({ color }: { color: string }) => (
  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
);

const CountChip = ({ count, active }: { count: number; active: boolean }) => (
  <span
    className={cn(
      "inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
      active ? "bg-accent-primary text-on-color" : "bg-surface-2 text-secondary"
    )}
  >
    {count}
  </span>
);

const FilterGlyph = ({ item }: { item: QuickFilterItem }) => {
  const Icon = item.Icon;
  if (item.dotColor) return <Dot color={item.dotColor} />;
  if (Icon) return <Icon className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />;
  return <ListFilter className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />;
};

export const QuickFilterDropdown: React.FC<QuickFilterDropdownProps> = ({ items, activeKey, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const activeItem = items.find((item) => item.key === activeKey) ?? items[0];
  const isFiltering = activeKey !== "all";

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border bg-surface-1 px-2.5 py-1.5 text-xs transition-colors",
          isFiltering
            ? "border-accent-strong text-accent-primary"
            : "border-subtle text-secondary hover:border-strong hover:text-primary"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {activeItem ? <FilterGlyph item={activeItem} /> : null}
          <span className="truncate font-medium">{activeItem?.label ?? "筛选"}</span>
          {activeItem ? <CountChip count={activeItem.count} active={isFiltering} /> : null}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open ? "rotate-180" : "")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-subtle bg-surface-1 p-1 shadow-lg">
          {items.map((item) => {
            const isActive = item.key === activeKey;
            const isZero = item.count === 0 && item.key !== "all";
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSelect(item.key)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors",
                  isActive ? "bg-accent-primary/10 text-accent-primary" : "text-primary hover:bg-surface-2",
                  isZero && !isActive ? "opacity-50" : ""
                )}
              >
                <FilterGlyph item={item} />
                <span className="flex-1 truncate">{item.label}</span>
                <CountChip count={item.count} active={isActive} />
                <Check
                  className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-accent-primary" : "invisible")}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
