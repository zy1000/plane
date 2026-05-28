/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { Activity, LayoutDashboard, MessageSquare, ScrollText, type LucideIcon } from "lucide-react";
import { cn } from "@plane/utils";

export type ReleaseDetailTabKey = "overview" | "materials" | "quality" | "activity";

export const DEFAULT_RELEASE_DETAIL_TAB: ReleaseDetailTabKey = "overview";

export const getReleaseDetailTabStorageKey = (releaseId: string) => `release-detail-tab-${releaseId}`;

export type ReleaseTabItem = {
  key: ReleaseDetailTabKey;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export const RELEASE_DETAIL_TABS: Omit<ReleaseTabItem, "badge">[] = [
  { key: "overview", label: "概览", icon: LayoutDashboard },
  { key: "materials", label: "关联资源", icon: ScrollText },
  { key: "quality", label: "质量监控", icon: Activity },
  { key: "activity", label: "动态", icon: MessageSquare },
];

type Props = {
  tabs: ReleaseTabItem[];
  activeTab: ReleaseDetailTabKey;
  onChange: (key: ReleaseDetailTabKey) => void;
};

export const ReleasePageTabs: React.FC<Props> = ({ tabs, activeTab, onChange }) => (
  <nav
    role="tablist"
    aria-label="发布详情子页签"
    className="sticky top-0 z-[3] -mx-6 flex items-center gap-1 overflow-x-auto border-b border-subtle bg-surface-1 px-6 vertical-scrollbar scrollbar-sm"
  >
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = tab.key === activeTab;
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-controls={`release-tab-panel-${tab.key}`}
          id={`release-tab-${tab.key}`}
          onClick={() => onChange(tab.key)}
          className={cn(
            "group relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
            isActive
              ? "border-accent-primary text-primary"
              : "border-transparent text-placeholder hover:text-secondary"
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "text-accent-primary" : "text-placeholder group-hover:text-secondary"
            )}
            aria-hidden
          />
          <span className="whitespace-nowrap">{tab.label}</span>
          {typeof tab.badge === "number" && tab.badge > 0 && (
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
