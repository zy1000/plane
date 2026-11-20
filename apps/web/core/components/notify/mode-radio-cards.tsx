/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";
import type { TNotifyMode } from "@/types/notify";
import { NOTIFY_MODE_OPTIONS } from "./constants";

type Props = {
  value: TNotifyMode;
  onChange: (value: TNotifyMode) => void;
  /** 标签元素的 id，给单选组做无障碍关联 */
  labelledBy: string;
};

/** 接收方式的两张单选卡：每日摘要 / 即时邮件 */
export function NotifyModeRadioCards({ value, onChange, labelledBy }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby={labelledBy}>
      {NOTIFY_MODE_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors",
              isSelected ? "border-accent-strong bg-accent-subtle" : "border-subtle hover:bg-layer-1-hover"
            )}
            onClick={() => onChange(option.value)}
          >
            <span
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                isSelected ? "border-accent-strong" : "border-strong"
              )}
              aria-hidden="true"
            >
              {isSelected && <span className="size-2 rounded-full bg-accent-primary" />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-14 font-medium text-primary">{option.label}</span>
              <span className="text-13 text-tertiary">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
