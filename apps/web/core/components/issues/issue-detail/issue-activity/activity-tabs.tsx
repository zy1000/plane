/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { memo } from "react";
import { EActivityTab } from "@plane/constants";
import { cn } from "@plane/utils";

type TTab = {
  key: EActivityTab;
  label: string;
};

type TActivityTabsProps = {
  activeTab: EActivityTab;
  onChange: (tab: EActivityTab) => void;
};

const TABS: TTab[] = [
  { key: EActivityTab.ALL, label: "全部" },
  { key: EActivityTab.ACTIVITY, label: "活动" },
  { key: EActivityTab.COMMENT, label: "评论" },
  { key: EActivityTab.TRANSITION, label: "转换" },
  { key: EActivityTab.HISTORY, label: "历史" },
  { key: EActivityTab.TIMESHEET, label: "工时记录" },
];

export const ActivityTabs = memo(function ActivityTabs(props: TActivityTabsProps) {
  const { activeTab, onChange } = props;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "relative px-3 py-1.5 mb-1 text-body-sm-medium transition-colors outline-none rounded-md",
              "after:absolute after:left-0 after:right-0 after:-bottom-[5px] after:h-0.5 after:rounded-full after:transition-colors",
              isActive
                ? "bg-layer-1-active text-primary after:bg-[var(--txt-primary)]"
                : "text-secondary hover:bg-surface-2/60 hover:text-primary after:bg-transparent"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
});

ActivityTabs.displayName = "ActivityTabs";
