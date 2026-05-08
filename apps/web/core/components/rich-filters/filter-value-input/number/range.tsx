/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterProperty, TNumberFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
import { toFilterArray } from "@plane/utils";
// local imports
import { CommitValueFilterPopover } from "../commit-value-popover";

type TNumberRangeFilterValueInputProps<P extends TFilterProperty> = {
  config: TNumberFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string | null) => void;
};

/**
 * Two-input number range filter (min, max). Emits a comma-separated string "a,b"
 * so it is compatible with the `range` / `not_range` operator's multi-value parsing.
 */
export const NumberRangeFilterValueInput = observer(function NumberRangeFilterValueInput<P extends TFilterProperty>(
  props: TNumberRangeFilterValueInputProps<P>
) {
  const { condition, isDisabled, onChange } = props;

  // Parse existing range value "a,b" → [a, b]
  const rawParts = toFilterArray(condition.value) ?? [];
  const [minRaw, maxRaw] = rawParts.length >= 2 ? rawParts : [rawParts[0] ?? null, null];

  const minValue = minRaw != null && String(minRaw).trim() !== "" ? String(minRaw) : null;
  const maxValue = maxRaw != null && String(maxRaw).trim() !== "" ? String(maxRaw) : null;

  const emit = useCallback(
    (min: string | null, max: string | null) => {
      if (min == null && max == null) {
        onChange(null);
        return;
      }
      onChange(`${min ?? ""},${max ?? ""}`);
    },
    [onChange]
  );

  const handleCommitMin = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      if (trimmed === "") {
        emit(null, maxValue);
        return true;
      }
      if (Number.isNaN(Number(trimmed))) return false;
      emit(trimmed, maxValue);
      return true;
    },
    [emit, maxValue]
  );

  const handleCommitMax = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      if (trimmed === "") {
        emit(minValue, null);
        return true;
      }
      if (Number.isNaN(Number(trimmed))) return false;
      emit(minValue, trimmed);
      return true;
    },
    [emit, minValue]
  );

  return (
    <div className="flex items-stretch">
      <CommitValueFilterPopover
        committedValue={minValue}
        placeholder="最小值..."
        inputType="number"
        isDisabled={isDisabled}
        defaultOpen={!minValue}
        onCommitDraft={handleCommitMin}
      />
      <span className="flex items-center px-1 text-xs text-secondary">–</span>
      <CommitValueFilterPopover
        committedValue={maxValue}
        placeholder="最大值..."
        inputType="number"
        isDisabled={isDisabled}
        defaultOpen={false}
        onCommitDraft={handleCommitMax}
      />
    </div>
  );
});
