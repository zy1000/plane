/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { cn } from "@plane/utils";

export type TChipOption = {
  id: string;
  label: string;
  /** 选项右侧的灰字，如「1 人」「模板」 */
  hint?: string;
};

type Props = {
  options: TChipOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** 固定显示、不能去掉的标签（如每个项目成员都有的「项目成员」权限组） */
  fixedChips?: TChipOption[];
  /** 选中标签的配色：neutral 灰底（角色），accent 主色浅底（权限组） */
  tone?: "neutral" | "accent";
  className?: string;
  /** 在弹窗里用时传弹窗内的容器：浮层挂到弹窗里面，否则弹窗的焦点锁会抢走搜索框焦点 */
  portalContainerRef?: React.RefObject<HTMLElement>;
};

/** 角色 / 权限组这类几十个以内的选项：字段里显示标签，点开搜索勾选 */
export function OptionMultiSelect(props: Props) {
  const {
    options,
    value,
    onChange,
    placeholder = "请选择",
    searchPlaceholder = "搜索",
    disabled = false,
    fixedChips = [],
    tone = "neutral",
    className,
    portalContainerRef,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const optionMap = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const selected = value.map((id) => optionMap.get(id)).filter((option): option is TChipOption => Boolean(option));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  const chipClass =
    tone === "accent"
      ? "border-accent-subtle-1 bg-accent-subtle text-accent-primary"
      : "border-subtle bg-layer-1 text-primary";

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (disabled) return;
        setIsOpen(open);
        if (!open) setQuery("");
      }}
    >
      <Popover.Button
        disabled={disabled}
        className={cn(
          "flex min-h-10 w-full items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-2 py-1.5 text-left transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-strong",
          isOpen && "border-accent-strong",
          className
        )}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {fixedChips.map((chip) => (
            <span key={chip.id} className="rounded-md border border-subtle bg-surface-1 px-2 py-0.5 text-13 text-secondary">
              {chip.label}
            </span>
          ))}
          {selected.map((option) => (
            <span
              key={option.id}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-13", chipClass)}
            >
              {option.label}
              {!disabled && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`移除 ${option.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(option.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    toggle(option.id);
                  }}
                  className="text-placeholder hover:text-primary"
                >
                  <X className="size-3" />
                </span>
              )}
            </span>
          ))}
          {fixedChips.length === 0 && selected.length === 0 && (
            <span className="px-1 text-13 text-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-tertiary" />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        containerRef={portalContainerRef}
        positionerClassName="z-30"
        className="w-[var(--anchor-width)] min-w-64 rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
      >
        <div className="border-b border-subtle p-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 outline-none placeholder:text-placeholder focus:border-accent-strong"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-13 text-tertiary">没有匹配项</p>
          ) : (
            filtered.map((option) => {
              const isSelected = value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-13 hover:bg-layer-1-hover",
                    isSelected ? "font-medium text-accent-primary" : "text-primary"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && <span className="shrink-0 text-12 text-tertiary">{option.hint}</span>}
                  <Check className={cn("size-3.5 shrink-0", isSelected ? "text-accent-primary" : "invisible")} />
                </button>
              );
            })
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
}
