/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterProperty, TNumberFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
import { Input } from "@plane/ui";

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
  const [localValue, setLocalValue] = useState<string>(
    condition.value != null ? String(condition.value) : ""
  );

  const commit = useCallback(() => {
    const trimmed = localValue.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      setLocalValue(condition.value != null ? String(condition.value) : "");
      return;
    }
    onChange(String(num));
  }, [localValue, condition.value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        (e.target as HTMLElement).blur();
      }
    },
    [commit]
  );

  return (
    <div className="flex items-center px-1">
      <Input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={config.placeholder ?? "输入数字..."}
        disabled={isDisabled}
        className="h-6 w-32 border-transparent bg-transparent px-1.5 py-0 text-xs hover:border-subtle focus:border-subtle"
      />
    </div>
  );
});
