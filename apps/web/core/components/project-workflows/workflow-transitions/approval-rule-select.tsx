/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { Check } from "lucide-react";
import { cn } from "@plane/utils";

type TApprovalRuleSelectProps = {
  approverCount: number;
  requiredCount: number;
  isNofM: boolean;
  onChange: (requiredCount: number, isNofM: boolean) => void;
  disabled?: boolean;
};

export const ApprovalRuleSelect: FC<TApprovalRuleSelectProps> = ({
  approverCount,
  requiredCount,
  isNofM,
  onChange,
  disabled = false,
}) => {
  if (approverCount === 0) {
    return (
      <div className="flex min-h-9 items-center rounded-md border border-subtle bg-surface-2 px-3 text-sm text-secondary">
        未指定审批人时，提交后将直接进入目标状态
      </div>
    );
  }

  if (approverCount === 1) {
    return (
      <div className="flex min-h-9 items-center rounded-md border border-subtle bg-surface-2 px-3 text-sm text-secondary">
        已指定 1 位审批人，审批通过后即可流转
      </div>
    );
  }

  const normalizedRequiredCount = Math.min(Math.max(1, requiredCount), approverCount);

  return (
    <div className="rounded-md border border-subtle bg-surface-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(1, false)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-layer-1"
        )}
      >
        <div
          className={cn(
            "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
            !isNofM ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
          )}
        >
          {!isNofM && <Check className="h-2.5 w-2.5 text-white" />}
        </div>
        <span className="text-sm text-primary">任意一人通过即可</span>
      </button>

      <div className="border-t border-subtle" />

      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(normalizedRequiredCount, true)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 text-left transition-colors",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:text-primary"
          )}
        >
          <div
            className={cn(
              "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
              isNofM ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
            )}
          >
            {isNofM && <Check className="h-2.5 w-2.5 text-white" />}
          </div>
          <span className="truncate text-sm text-primary">需指定人数通过</span>
        </button>

        <input
          type="number"
          min={1}
          max={approverCount}
          value={normalizedRequiredCount}
          disabled={disabled || !isNofM}
          onChange={(event) => {
            const next = parseInt(event.target.value, 10);
            if (Number.isNaN(next)) return;
            onChange(Math.min(Math.max(1, next), approverCount), true);
          }}
          className={cn(
            "w-14 rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-center text-sm font-medium text-primary outline-none",
            "focus:border-accent-primary/50",
            (disabled || !isNofM) && "cursor-not-allowed opacity-60"
          )}
        />
      </div>
    </div>
  );
};
