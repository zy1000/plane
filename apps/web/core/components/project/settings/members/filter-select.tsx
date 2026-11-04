/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ChevronDown } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";

type Props = {
  label: string;
  options: { id: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
};

/** 成员表工具栏的「角色 ▾ / 权限组 ▾」多选筛选 */
export function MemberFilterSelect({ label, options, value, onChange }: Props) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  return (
    <Popover>
      <Popover.Button
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-13 transition-colors",
          value.length > 0
            ? "border-accent-subtle-1 bg-accent-subtle text-accent-primary"
            : "border-subtle bg-surface-1 text-secondary hover:border-strong"
        )}
      >
        {label}
        {value.length > 0 && <span className="tabular-nums">· {value.length}</span>}
        <ChevronDown className="size-3.5" />
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        positionerClassName="z-30"
        className="max-h-80 w-56 overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-1 shadow-overlay-200"
      >
        {options.length === 0 ? (
          <p className="px-2.5 py-3 text-center text-13 text-tertiary">暂无可选项</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-13 text-primary hover:bg-layer-1-hover"
            >
              <Checkbox checked={value.includes(option.id)} onChange={() => toggle(option.id)} />
              <span className="truncate">{option.label}</span>
            </label>
          ))
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full border-t border-subtle px-2.5 pt-2 pb-1 text-left text-12 text-accent-primary hover:underline"
          >
            清除筛选
          </button>
        )}
      </Popover.Panel>
    </Popover>
  );
}
