/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterProperty, TNumberFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
// local imports
import { CommitValueFilterPopover } from "../commit-value-popover";

type TNumberFilterValueInputProps<P extends TFilterProperty> = {
  config: TNumberFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string | null) => void;
};

export const NumberFilterValueInput = observer(function NumberFilterValueInput<P extends TFilterProperty>(
  props: TNumberFilterValueInputProps<P>
) {
  const { condition, config, isDisabled, onChange } = props;

  const committedValue =
    condition.value != null && String(condition.value).trim() !== "" ? String(condition.value) : null;

  const handleCommitDraft = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      if (trimmed === "") {
        onChange(null);
        return true;
      }
      const num = Number(trimmed);
      if (Number.isNaN(num)) {
        return false;
      }
      onChange(String(num));
      return true;
    },
    [onChange]
  );

  return (
    <CommitValueFilterPopover
      committedValue={committedValue}
      placeholder={config.placeholder ?? "输入数字..."}
      inputType="number"
      isDisabled={isDisabled}
      defaultOpen={!committedValue}
      onCommitDraft={handleCommitDraft}
    />
  );
});
