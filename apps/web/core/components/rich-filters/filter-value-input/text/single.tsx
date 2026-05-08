/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { TFilterProperty, TTextFilterFieldConfig, TFilterConditionNodeForDisplay } from "@plane/types";
import { Input } from "@plane/ui";

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
  const [localValue, setLocalValue] = useState<string>(
    typeof condition.value === "string" ? condition.value : ""
  );

  const commit = useCallback(() => {
    const trimmed = localValue.trim();
    onChange(trimmed.length > 0 ? trimmed : null);
  }, [localValue, onChange]);

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
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={config.placeholder ?? "输入筛选值..."}
        disabled={isDisabled}
        className="h-6 w-40 border-transparent bg-transparent px-1.5 py-0 text-xs hover:border-subtle focus:border-subtle"
      />
    </div>
  );
});
