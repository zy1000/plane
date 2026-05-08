/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterProperty, TTextFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
// local imports
import { CommitValueFilterPopover } from "../commit-value-popover";

type TTextFilterValueInputProps<P extends TFilterProperty> = {
  config: TTextFilterFieldConfig<string>;
  condition: TFilterConditionNodeForDisplay<P, string>;
  isDisabled?: boolean;
  onChange: (value: string | null) => void;
};

export const TextFilterValueInput = observer(function TextFilterValueInput<P extends TFilterProperty>(
  props: TTextFilterValueInputProps<P>
) {
  const { condition, config, isDisabled, onChange } = props;

  const raw = typeof condition.value === "string" ? condition.value : null;
  const committedValue = raw != null && raw.trim() !== "" ? raw : null;

  const handleCommitDraft = useCallback(
    (draft: string) => {
      const trimmed = draft.trim();
      onChange(trimmed.length > 0 ? trimmed : null);
      return true;
    },
    [onChange]
  );

  return (
    <CommitValueFilterPopover
      committedValue={committedValue}
      placeholder={config.placeholder ?? "输入筛选值..."}
      inputType="text"
      isDisabled={isDisabled}
      defaultOpen={!committedValue}
      onCommitDraft={handleCommitDraft}
    />
  );
});
