/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { Button, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// local imports
import { EMPTY_FILTER_PLACEHOLDER_TEXT } from "../shared";
import { getCommonCustomSearchSelectProps } from "./select/shared";

export type TCommitValueFilterPopoverProps = {
  committedValue: string | null;
  placeholder: string;
  inputType: "text" | "number";
  isDisabled?: boolean;
  defaultOpen?: boolean;
  /** 返回 true 表示已应用并关闭面板；返回 false 表示拒绝提交（如非法数字）并保持打开。 */
  onCommitDraft: (draft: string) => boolean;
};

export function CommitValueFilterPopover(props: TCommitValueFilterPopoverProps) {
  const { committedValue, placeholder, inputType, isDisabled, defaultOpen = false, onCommitDraft } = props;

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(() => committedValue ?? "");
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: { padding: 12 },
      },
    ],
  });

  const displayLabel =
    committedValue != null && String(committedValue).trim() !== "" ? String(committedValue) : null;

  const closeDropdown = () => setIsOpen(false);

  const openDropdown = () => {
    setDraft(committedValue ?? "");
    setIsOpen(true);
  };

  const toggleDropdown = () => {
    if (isDisabled) return;
    if (isOpen) closeDropdown();
    else openDropdown();
  };

  useOutsideClickDetector(dropdownRef, () => {
    setIsOpen((open) => {
      if (open) {
        setDraft(committedValue ?? "");
      }
      return false;
    });
  });

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const ok = onCommitDraft(draft);
    if (ok) closeDropdown();
    else setDraft(committedValue ?? "");
  };

  const handleCancel = () => {
    setDraft(committedValue ?? "");
    closeDropdown();
  };

  const customButtonClassName = cn(
    getCommonCustomSearchSelectProps(isDisabled).customButtonClassName,
    "justify-start",
    displayLabel ? "min-w-[4.5rem]" : "min-w-0 !w-auto"
  );

  return (
    <div
      ref={dropdownRef}
      className="relative flex-shrink-0 text-left"
      onKeyDown={(e) => {
        if (e.key === "Escape" && isOpen) {
          e.preventDefault();
          handleCancel();
        }
      }}
    >
      <button
        ref={setReferenceElement}
        type="button"
        className={cn(
          "flex h-full w-full items-center justify-between gap-1",
          {
            "cursor-not-allowed text-secondary": isDisabled,
            "cursor-pointer hover:bg-layer-transparent-hover": !isDisabled,
          },
          customButtonClassName
        )}
        onClick={toggleDropdown}
        disabled={isDisabled}
      >
        <span className={cn("min-w-0 max-w-36 truncate text-left", !displayLabel && "text-placeholder")}>
          {displayLabel ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
        </span>
      </button>
      {isOpen &&
        createPortal(
          <div
            data-prevent-outside-click
            className="z-30 my-1 min-w-72 rounded-md border-[0.5px] border-subtle-1 bg-surface-1 p-2.5 text-11 shadow-raised-200"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <Input
              ref={inputRef}
              type={inputType}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirm();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCancel();
                }
              }}
              placeholder={placeholder}
              inputSize="sm"
              className="w-full text-xs"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="neutral-primary"
                size="sm"
                className="h-7 min-h-7 px-2.5 py-0 leading-none"
                onClick={handleCancel}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="h-7 min-h-7 px-2.5 py-0 leading-none"
                onClick={handleConfirm}
              >
                确认
              </Button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
