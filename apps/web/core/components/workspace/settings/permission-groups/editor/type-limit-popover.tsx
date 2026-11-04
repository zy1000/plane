/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { TYPE_LIMIT_MODULE_LABELS } from "./catalog";

/** 与 @plane/types 的 TPermissionGroupTypeOption / TPermissionTypeOption 同形，工作区组和项目组都能传 */
export type TTypeLimitOption = {
  id: string;
  name: string;
  logo_props?: Record<string, unknown> | null;
  module: "project.issue" | "project.defect";
  is_active: boolean;
};

type Props = {
  /** 「新建」「编辑」「删除」 */
  actionLabel: string;
  moduleKey: string;
  /** 已按模块过滤好的类型 */
  options: TTypeLimitOption[];
  /** 不适用的类型 id */
  excluded: string[];
  /** 类型清单的来源：工作区组 / 模板是「类型库」，项目自定义组是「本项目」 */
  sourceLabel: string;
  disabled?: boolean;
  onChange: (excluded: string[]) => void;
};

const getTypeColor = (logoProps: TTypeLimitOption["logo_props"]) => {
  const icon = (logoProps as { icon?: { color?: string; background_color?: string } } | null | undefined)?.icon;
  return icon?.background_color || icon?.color || undefined;
};

/**
 * 工作项 / 缺陷行的新建、编辑、删除后面那颗「全部类型 ▾ / 排除 N 种 ▾」：
 * 点开勾选这个动作适用哪些类型，没勾的就是排除（例：研发工程师不能编辑硬件缺陷）。
 */
export function TypeLimitPopover(props: Props) {
  const { actionLabel, moduleKey, options, excluded, sourceLabel, disabled = false, onChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const excludedSet = new Set(excluded);
  const excludedCount = options.filter((option) => excludedSet.has(option.id)).length;
  const allExcluded = options.length > 0 && excludedCount === options.length;
  const moduleLabel = TYPE_LIMIT_MODULE_LABELS[moduleKey] ?? "工作项";

  const toggle = (typeId: string) =>
    onChange(excludedSet.has(typeId) ? excluded.filter((id) => id !== typeId) : [...excluded, typeId]);

  const pillText = excludedCount === 0 ? "全部类型" : allExcluded ? "全部排除" : `排除 ${excludedCount} 种`;

  return (
    <Popover open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <Popover.Button
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-0.5 rounded border px-1.5 text-11 font-medium transition-colors",
          excludedCount > 0
            ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
            : "border-subtle bg-layer-1 text-tertiary",
          allExcluded && "border-transparent bg-danger-subtle text-danger-primary",
          disabled ? "cursor-default" : "hover:border-strong"
        )}
      >
        {pillText}
        {!disabled && <ChevronDown className="size-3" />}
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={6}
        positionerClassName="z-30"
        className="w-72 rounded-lg border border-subtle bg-surface-1 py-2 shadow-overlay-200"
      >
        <p className="px-4 pt-1 pb-2 text-12 text-tertiary">
          {actionLabel} · 适用的{moduleLabel}类型（{sourceLabel}）
        </p>
        {options.length === 0 ? (
          <p className="px-4 py-3 text-12 text-placeholder">没有可选的{moduleLabel}类型</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            {options.map((option) => {
              const color = getTypeColor(option.logo_props);
              return (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2.5 px-4 py-1.5 text-13 text-primary hover:bg-layer-1-hover"
                >
                  <Checkbox checked={!excludedSet.has(option.id)} onChange={() => toggle(option.id)} />
                  <span
                    className="size-2 shrink-0 rounded-sm bg-layer-3"
                    style={color ? { backgroundColor: color } : undefined}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {!option.is_active && <span className="shrink-0 text-11 text-placeholder">已停用</span>}
                </label>
              );
            })}
          </div>
        )}
        {options.length > 0 && (
          <div className="mt-1 flex items-center gap-4 border-t border-subtle px-4 pt-2">
            <button type="button" className="text-12 text-accent-primary hover:underline" onClick={() => onChange([])}>
              全选
            </button>
            <button
              type="button"
              className="text-12 text-accent-primary hover:underline"
              onClick={() => onChange(options.map((option) => option.id))}
            >
              清空
            </button>
            {allExcluded && <span className="ml-auto text-11 text-danger-primary">一个类型都不适用</span>}
          </div>
        )}
      </Popover.Panel>
    </Popover>
  );
}
