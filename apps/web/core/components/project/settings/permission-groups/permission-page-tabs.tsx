/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { cn } from "@plane/utils";

export type TPermissionPageTab = "groups" | "visible";

type Props = {
  value: TPermissionPageTab;
  onChange: (tab: TPermissionPageTab) => void;
  groupCount?: number;
  visibleCount?: number;
};

/** 项目设置 › 权限的两个页签：权限组 / 可访问人员（下划线样式，页面内容里的分段控件是下一级） */
export function PermissionPageTabs({ value, onChange, groupCount, visibleCount }: Props) {
  const items: { key: TPermissionPageTab; label: string; count?: number }[] = [
    { key: "groups", label: "权限组", count: groupCount },
    { key: "visible", label: "可访问人员", count: visibleCount },
  ];
  return (
    <div className="-mt-3 mb-6 flex gap-7 border-b border-subtle" role="tablist" aria-label="权限页签">
      {items.map((item) => {
        const isActive = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "-mb-px flex h-11 items-center gap-1.5 border-b-2 text-14 whitespace-nowrap transition-colors",
              isActive ? "border-accent-strong font-medium text-primary" : "border-transparent text-secondary hover:text-primary"
            )}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined && <span className="text-12 font-normal text-tertiary tabular-nums">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
