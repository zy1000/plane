/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@plane/utils";

/**
 * 带计数徽标的下划线页签条。
 *
 * 这是 ReleasePageTabs 的泛型化版本（后者现在委托到这里）—— 仓库里已经有
 * ReleaseGroupSidebar / CycleGroupSidebar 这对逐字复制的孪生组件，不该再添第三份。
 *
 * `label` 收 ReactNode 而不是 string：项目需求页的产品页签要在文字前面放产品标识
 * 徽标，不是一个 lucide 图标能表达的。
 */

export type TFacetTabItem<K extends string> = {
  key: K;
  label: React.ReactNode;
  icon?: LucideIcon;
  badge?: number;
};

type TProps<K extends string> = {
  tabs: TFacetTabItem<K>[];
  activeTab: K;
  onChange: (key: K) => void;
  /** 无障碍标签，也用来生成 tab / tabpanel 的 id 前缀 */
  ariaLabel: string;
  idPrefix: string;
  /** 计数为 0 时是否藏起徽标。页签导航该藏，分面筛选不该藏 —— 「已发布 0」本身是信息 */
  hideZeroBadge?: boolean;
  className?: string;
};

export const FacetTabs = <K extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  idPrefix,
  hideZeroBadge = true,
  className,
}: TProps<K>) => (
  <nav
    role="tablist"
    aria-label={ariaLabel}
    className={cn(
      "sticky top-0 z-[3] flex items-center gap-1 overflow-x-auto border-b border-subtle bg-surface-1 vertical-scrollbar scrollbar-sm",
      className
    )}
  >
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = tab.key === activeTab;
      const showBadge = typeof tab.badge === "number" && (!hideZeroBadge || tab.badge > 0);
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-controls={`${idPrefix}-panel-${tab.key}`}
          id={`${idPrefix}-${tab.key}`}
          onClick={() => onChange(tab.key)}
          className={cn(
            "group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
            isActive
              ? "border-accent-primary text-primary"
              : "border-transparent text-placeholder hover:text-secondary"
          )}
        >
          {Icon && (
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                isActive ? "text-accent-primary" : "text-placeholder group-hover:text-secondary"
              )}
              aria-hidden
            />
          )}
          <span className="whitespace-nowrap">{tab.label}</span>
          {showBadge && (
            <span
              className={cn(
                "ml-0.5 inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                isActive ? "bg-accent-primary/10 text-accent-primary" : "bg-layer-2 text-placeholder"
              )}
            >
              {tab.badge}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
