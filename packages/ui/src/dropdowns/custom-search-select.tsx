/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { Info } from "lucide-react";
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { useOutsideClickDetector } from "@plane/hooks";
import { CheckIcon, SearchIcon, ChevronDownIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICustomSearchSelectOption } from "@plane/types";
import { useDropdownKeyDown } from "../hooks/use-dropdown-key-down";
import { cn } from "../utils";
import type { ICustomSearchSelectProps } from "./helper";

/**
 * 不再基于 Headless UI Combobox：它每挂载一个 Option 都会把全部已挂载选项按 DOM 位置重排一次（平方级），
 * 上千条一次性挂载要好几秒；而只挂载可视区（窗口渲染）时，它又会把 DOM 里第一个已挂载项当成活动项 scrollIntoView，
 * 视口上方的预渲染行随滚动不断变化，列表会被一格格拉回去。所以按钮、搜索框、列表和键盘导航在这里自行实现，
 * 对外 props 不变。
 */

const MAX_HEIGHT_CLASSNAME: Record<NonNullable<ICustomSearchSelectProps["maxHeight"]>, string> = {
  "2xl": "max-h-96",
  xl: "max-h-80",
  lg: "max-h-60",
  md: "max-h-48",
  rg: "max-h-36",
  sm: "max-h-28",
};

/** 单行估算高度：py-1.5 + 一行 text-11 + 行距 pb-1；实际高度由 measureElement 修正 */
const ESTIMATED_OPTION_HEIGHT = 32;

type TActivationSource = "initial" | "keyboard" | "pointer";
type TActiveState = { index: number | null; source: TActivationSource };

/** 从 from 起沿 step 方向找第一个未禁用的选项，找不到返回 null */
const findEnabledIndex = (options: ICustomSearchSelectOption[], from: number, step: 1 | -1): number | null => {
  for (let index = from; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return null;
};

type TOptionListProps = {
  listboxId: string;
  options: ICustomSearchSelectOption[];
  active: TActiveState;
  onActivate: (index: number | null) => void;
  isSelected: (optionValue: unknown) => boolean;
  onSelect: (optionValue: unknown) => void;
  maxHeight: NonNullable<ICustomSearchSelectProps["maxHeight"]>;
};

/** 只挂载可视区附近的选项，同时挂载的只有几十条 */
function CustomSearchSelectOptionList(props: TOptionListProps) {
  const { listboxId, options, active, onActivate, isSelected, onSelect, maxHeight } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const initialActiveIndexRef = useRef(active.index);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: options.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ESTIMATED_OPTION_HEIGHT,
    overscan: 8,
  });

  // 打开时把已选项滚到可视区中间
  useLayoutEffect(() => {
    const index = initialActiveIndexRef.current;
    if (index !== null && index > 0) virtualizer.scrollToIndex(index, { align: "center" });
  }, [virtualizer]);

  // 键盘移动活动项时跟随滚动；鼠标悬停不滚，避免视口边缘的半行在悬停时跳动
  useEffect(() => {
    if (active.index !== null && active.source === "keyboard") virtualizer.scrollToIndex(active.index);
  }, [active, virtualizer]);

  return (
    <div
      id={listboxId}
      role="listbox"
      ref={listRef}
      className={cn("vertical-scrollbar mt-2 scrollbar-xs overflow-y-scroll px-2", MAX_HEIGHT_CLASSNAME[maxHeight])}
      onMouseLeave={() => onActivate(null)}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const option = options[item.index];
          const selected = isSelected(option.value);
          const isActive = active.index === item.index;
          return (
            <div
              key={option.value}
              id={`${listboxId}-${item.index}`}
              role="option"
              aria-selected={selected}
              aria-disabled={option.disabled || undefined}
              tabIndex={-1}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-1"
              style={{ transform: `translateY(${item.start}px)` }}
              onMouseMove={() => {
                if (!isActive) onActivate(item.index);
              }}
              onClick={() => {
                if (!option.disabled) onSelect(option.value);
              }}
            >
              <div
                className={cn(
                  "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                  {
                    "bg-layer-transparent-hover": isActive,
                    "cursor-not-allowed text-placeholder opacity-60": option.disabled,
                  }
                )}
              >
                <span className="flex-grow truncate">{option.content}</span>
                {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                {option.tooltip && (
                  <>
                    {typeof option.tooltip === "string" ? (
                      <Tooltip tooltipContent={option.tooltip}>
                        <Info className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer text-secondary" />
                      </Tooltip>
                    ) : (
                      option.tooltip
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomSearchSelect(props: ICustomSearchSelectProps) {
  const {
    customButtonClassName = "",
    buttonClassName = "",
    className = "",
    chevronClassName = "",
    customButton,
    placement,
    disabled = false,
    footerOption,
    input = false,
    label,
    maxHeight = "md",
    multiple = false,
    noChevron = false,
    onChange,
    options,
    onOpen,
    onClose,
    optionsClassName = "",
    value,
    tabIndex,
    noResultsMessage = "No matches found",
    defaultOpen = false,
  } = props;
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<TActiveState>({ index: null, source: "initial" });

  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // refs
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
  });

  // 引用稳定，避免父级每次渲染都让虚拟列表重算
  const filteredOptions = useMemo(() => {
    if (!options || query === "") return options;
    const lowerQuery = query.toLowerCase();
    return options.filter((option) => option.query.toLowerCase().includes(lowerQuery));
  }, [options, query]);

  const isSelected = (optionValue: unknown) =>
    multiple ? Array.isArray(value) && value.includes(optionValue) : value === optionValue;

  // 没有活动项时把第一个可选项当作活动项：打开后直接回车、输入关键字后回车都选中第一个匹配
  const effectiveActive: TActiveState = useMemo(() => {
    if (active.index !== null || !filteredOptions) return active;
    return { index: findEnabledIndex(filteredOptions, 0, 1), source: active.source };
  }, [active, filteredOptions]);

  const openDropdown = () => {
    if (disabled) return;
    const selectedIndex = options?.findIndex((option) => isSelected(option.value)) ?? -1;
    setActive({ index: selectedIndex === -1 ? null : selectedIndex, source: "initial" });
    setIsOpen(true);
    if (referenceElement) referenceElement.focus();
    if (onOpen) onOpen();
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery("");
    onClose && onClose();
  };

  const handleKeyDown = useDropdownKeyDown(openDropdown, closeDropdown, isOpen);
  useOutsideClickDetector(dropdownRef, closeDropdown);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  const toggleDropdown = () => {
    if (isOpen) closeDropdown();
    else openDropdown();
  };

  const selectOption = (optionValue: unknown) => {
    if (multiple) {
      const current: unknown[] = Array.isArray(value) ? value : [];
      onChange(current.includes(optionValue) ? current.filter((v) => v !== optionValue) : [...current, optionValue]);
      return;
    }
    onChange(optionValue);
    closeDropdown();
  };

  const moveActive = (index: number | null) => {
    if (index !== null) setActive({ index, source: "keyboard" });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = filteredOptions ?? [];
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(findEnabledIndex(list, (effectiveActive.index ?? -1) + 1, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(findEnabledIndex(list, (effectiveActive.index ?? list.length) - 1, -1));
        break;
      case "Home":
        event.preventDefault();
        moveActive(findEnabledIndex(list, 0, 1));
        break;
      case "End":
        event.preventDefault();
        moveActive(findEnabledIndex(list, list.length - 1, -1));
        break;
      case "Enter":
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        if (effectiveActive.index !== null) selectOption(list[effectiveActive.index].value);
        break;
      case "Escape":
        event.stopPropagation();
        closeDropdown();
        referenceElement?.focus();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  };

  return (
    <div
      ref={dropdownRef}
      tabIndex={tabIndex}
      className={cn("relative flex-shrink-0 text-left", className)}
      onKeyDown={handleKeyDown}
    >
      {customButton ? (
        <button
          ref={setReferenceElement}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-1",
            !customButton && "text-11",
            {
              "cursor-not-allowed text-secondary": disabled,
              "cursor-pointer hover:bg-layer-transparent-hover": !disabled,
            },
            customButtonClassName
          )}
          onClick={toggleDropdown}
        >
          {customButton}
        </button>
      ) : (
        <button
          ref={setReferenceElement}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between gap-1 rounded-sm border-[0.5px] border-strong",
            {
              "px-3 py-2 text-13": input,
              "px-2 py-1 text-11": !input,
              "cursor-not-allowed text-secondary": disabled,
              "cursor-pointer hover:bg-layer-transparent-hover": !disabled,
            },
            buttonClassName
          )}
          onClick={toggleDropdown}
        >
          {label}
          {!noChevron && !disabled && (
            <ChevronDownIcon className={cn("h-3 w-3 flex-shrink-0", chevronClassName)} aria-hidden="true" />
          )}
        </button>
      )}
      {isOpen &&
        createPortal(
          <div
            data-prevent-outside-click
            className={cn(
              "z-30 my-1 min-w-48 overflow-y-scroll rounded-md border-[0.5px] border-subtle-1 bg-surface-1 py-2.5 text-11 whitespace-nowrap focus:outline-none",
              optionsClassName
            )}
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="mx-2 flex items-center gap-1.5 rounded-sm border border-subtle px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={
                  effectiveActive.index !== null ? `${listboxId}-${effectiveActive.index}` : undefined
                }
                aria-autocomplete="list"
                autoComplete="off"
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive({ index: null, source: "initial" });
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Search"
              />
            </div>
            {filteredOptions ? (
              filteredOptions.length > 0 ? (
                <CustomSearchSelectOptionList
                  listboxId={listboxId}
                  options={filteredOptions}
                  active={effectiveActive}
                  onActivate={(index) => setActive({ index, source: "pointer" })}
                  isSelected={isSelected}
                  onSelect={selectOption}
                  maxHeight={maxHeight}
                />
              ) : (
                <p className="mt-2 px-3.5 py-1 text-placeholder italic">{noResultsMessage}</p>
              )
            ) : (
              <p className="mt-2 px-3.5 py-1 text-placeholder italic">Loading...</p>
            )}
            {footerOption}
          </div>,
          document.body
        )}
    </div>
  );
}
