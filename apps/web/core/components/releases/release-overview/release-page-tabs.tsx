/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import { Activity, LayoutDashboard, MessageSquare, ScrollText, type LucideIcon } from "lucide-react";
import { FacetTabs } from "@/components/common/facet-tabs";

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

/**
 * 发布详情的子页签。渲染逻辑已提到通用的 FacetTabs，这里只保留发布域的 id 前缀、
 * 无障碍标签与那对负外边距（页签要顶到内容区两侧的 padding 之外）。
 */
export const ReleasePageTabs: React.FC<Props> = ({ tabs, activeTab, onChange }) => (
  <FacetTabs<ReleaseDetailTabKey>
    tabs={tabs}
    activeTab={activeTab}
    onChange={onChange}
    ariaLabel="发布详情子页签"
    idPrefix="release-tab"
    className="-mx-6 px-6"
  />
);
