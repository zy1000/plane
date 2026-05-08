/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import type { TFilterProperty, TNumberFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
import { Button, Input } from "@plane/ui";
import { cn, toFilterArray } from "@plane/utils";
// local imports
import { EMPTY_FILTER_PLACEHOLDER_TEXT } from "../../shared";
import { getCommonCustomSearchSelectProps } from "../select/shared";

type TNumberRangeFilterValueInputProps<P extends TFilterProperty> = {
  config: TNumberFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string[]) => void;
};

const isValidDraft = (s: string) => s.trim() === "" || !Number.isNaN(Number(s.trim()));

/**
 * 把 condition.value 解析为 [min, max] 二元组：
 * - 数组：直接取前两位
 * - 单值字符串若包含逗号（兼容历史遗留格式或外部直接写入），按逗号拆分
 * - 其它情况视为只有 min
 */
const parseRangeParts = (value: unknown): [string | null, string | null] => {
  const arr = toFilterArray(value as never) ?? [];
  let parts: unknown[] = arr;
  if (parts.length === 1 && typeof parts[0] === "string" && parts[0].includes(",")) {
    parts = parts[0].split(",").map((s) => s.trim());
  }
  const [minRaw, maxRaw] = parts.length >= 2 ? [parts[0], parts[1]] : [parts[0] ?? null, null];
  const normalize = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v) : null);
  return [normalize(minRaw), normalize(maxRaw)];
};

/**
 * 单一弹层的 between/not_between 数字范围输入：触发按钮显示 "min → max"，
 * 弹层内并排两个输入框、用 "→" 分隔，共享一组 取消/确认 按钮。
 * 提交时通过 onChange 上报字符串数组 [min, max]，与 DateRangeFilterValueInput 一致，
 * 由 adapter 在序列化为外部 payload 时再 join 成 "min,max"。
 */
export const NumberRangeFilterValueInput = observer(function NumberRangeFilterValueInput<P extends TFilterProperty>(
  props: TNumberRangeFilterValueInputProps<P>
) {
  const { condition, isDisabled, onChange } = props;

  const [minValue, maxValue] = parseRangeParts(condition.value);

  const isIncomplete = minValue == null || maxValue == null;

  const [isOpen, setIsOpen] = useState(isIncomplete);
  const [minDraft, setMinDraft] = useState(minValue ?? "");
  const [maxDraft, setMaxDraft] = useState(maxValue ?? "");

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const minInputRef = useRef<HTMLInputElement | null>(null);
  const maxInputRef = useRef<HTMLInputElement | null>(null);
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

  const resetDraft = useCallback(() => {
    setMinDraft(minValue ?? "");
    setMaxDraft(maxValue ?? "");
  }, [minValue, maxValue]);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  const openDropdown = useCallback(() => {
    resetDraft();
    setIsOpen(true);
  }, [resetDraft]);

  const toggleDropdown = useCallback(() => {
    if (isDisabled) return;
    if (isOpen) closeDropdown();
    else openDropdown();
  }, [isDisabled, isOpen, closeDropdown, openDropdown]);

  useOutsideClickDetector(dropdownRef, () => {
    setIsOpen((open) => {
      if (open) resetDraft();
      return false;
    });
  });

  useEffect(() => {
    if (!isOpen) return;
    // 优先聚焦第一个空值输入框，便于补齐缺失值
    const target = minDraft.trim() === "" ? minInputRef.current : maxInputRef.current;
    target?.focus();
    target?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleConfirm = useCallback(() => {
    if (!isValidDraft(minDraft) || !isValidDraft(maxDraft)) {
      resetDraft();
      return;
    }
    const minTrim = minDraft.trim();
    const maxTrim = maxDraft.trim();
    if (minTrim === "" && maxTrim === "") {
      onChange([]);
    } else {
      onChange([minTrim, maxTrim]);
    }
    closeDropdown();
  }, [minDraft, maxDraft, onChange, resetDraft, closeDropdown]);

  const handleCancel = useCallback(() => {
    resetDraft();
    closeDropdown();
  }, [resetDraft, closeDropdown]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    },
    [handleConfirm, handleCancel]
  );

  const customButtonClassName = cn(
    getCommonCustomSearchSelectProps(isDisabled).customButtonClassName,
    "justify-start min-w-[5rem]"
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
        <span className="flex items-center gap-1 text-left">
          <span className={cn("min-w-0 max-w-20 truncate", !minValue && "text-placeholder")}>
            {minValue ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
          </span>
          <span className="text-tertiary">→</span>
          <span className={cn("min-w-0 max-w-20 truncate", !maxValue && "text-placeholder")}>
            {maxValue ?? EMPTY_FILTER_PLACEHOLDER_TEXT}
          </span>
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
            <div className="flex items-center gap-2">
              <Input
                ref={minInputRef}
                type="number"
                value={minDraft}
                onChange={(e) => setMinDraft(e.target.value)}
                onKeyDown={handleInputKeyDown}
                inputSize="sm"
                className="w-full text-xs"
              />
              <span className="shrink-0 text-tertiary">→</span>
              <Input
                ref={maxInputRef}
                type="number"
                value={maxDraft}
                onChange={(e) => setMaxDraft(e.target.value)}
                onKeyDown={handleInputKeyDown}
                inputSize="sm"
                className="w-full text-xs"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-tertiary">按 Enter 提交</span>
              <div className="flex gap-2">
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
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});
