/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import { Check, ChevronDown, Search } from "lucide-react";
import type { TIssueTypeCategory } from "@plane/types";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";

type TCategoryValue = number | string | null;

type Props = {
  value: TCategoryValue;
  categories: TIssueTypeCategory[];
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyHint?: string;
  /** 外层容器类名，例如 `w-44` 以限制触发按钮宽度 */
  className?: string;
  onChange: (value: TCategoryValue) => void;
};

/**
 * 工作项类型「类别」下拉选择器。
 * - 工作区级数据来源由调用方通过 `categories` 透传，可与 useIssueTypeCategories 联动。
 * - 弹层通过 createPortal 渲染，避免被 ModalCore 的 overflow 截断。
 */
export function IssueTypeCategorySelect({
  value,
  categories,
  isLoading = false,
  disabled = false,
  placeholder = "选择类别",
  emptyHint = "暂无类别，请先到工作区设置创建",
  className = "",
  onChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);

  const selected = useMemo(
    () => categories.find((category) => String(category.id) === String(value ?? "")),
    [categories, value]
  );

  const filteredCategories = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(keyword));
  }, [categories, query]);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useLayoutEffect(() => {
    if (isOpen && referenceElement) {
      setPopoverWidth(referenceElement.offsetWidth);
    }
  }, [isOpen, referenceElement]);

  useOutsideClickDetector(containerRef, () => {
    setIsOpen(false);
    setQuery("");
  }, true);

  const buttonLabel = selected?.name ?? placeholder;
  const isPlaceholder = !selected;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={setReferenceElement}
        type="button"
        disabled={disabled}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm shadow-sm transition ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent-primary/40"
        } ${isPlaceholder ? "text-placeholder" : "text-primary"}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 truncate">{buttonLabel}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-tertiary transition-transform ${isOpen && !disabled ? "rotate-180" : ""}`} />
      </button>
      {isOpen &&
        !disabled &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={{ ...styles.popper, width: popoverWidth }}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 rounded-lg border border-subtle bg-surface-1 p-2 shadow-raised-200"
          >
            <div className="mb-1.5 flex items-center gap-2 rounded-md border border-subtle px-2">
              <Search className="size-3.5 text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索类别"
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-tertiary"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {isLoading ? (
                <div className="px-2 py-3 text-center text-xs text-tertiary">正在加载...</div>
              ) : filteredCategories.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-tertiary">
                  {categories.length === 0 ? emptyHint : "未找到匹配项"}
                </div>
              ) : (
                filteredCategories.map((category) => {
                  const isSelected = String(category.id) === String(value ?? "");
                  return (
                    <button
                      key={category.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-primary transition hover:bg-layer-1-hover"
                      onClick={() => {
                        onChange(category.id);
                        setIsOpen(false);
                        setQuery("");
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{category.name}</span>
                      {isSelected ? <Check className="size-3.5 shrink-0 text-accent-primary" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
