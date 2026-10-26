/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { memo } from "react";
import { EActivityTab } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TIssueTimelineCounts } from "@/hooks/store/use-issue-activity-timeline";

/** 页签 → i18n 片段（页签名与空态文案共用） */
export const TAB_I18N_KEY: Record<EActivityTab, string> = {
  [EActivityTab.ALL]: "all",
  [EActivityTab.TRANSITION]: "transitions",
  [EActivityTab.COMMENT]: "comments",
  [EActivityTab.EDITS]: "edits",
  [EActivityTab.TIMESHEET]: "timesheet",
};

const TABS: EActivityTab[] = [
  EActivityTab.ALL,
  EActivityTab.TRANSITION,
  EActivityTab.COMMENT,
  EActivityTab.EDITS,
  EActivityTab.TIMESHEET,
];

type TActivityTabsProps = {
  activeTab: EActivityTab;
  counts: TIssueTimelineCounts;
  onChange: (tab: EActivityTab) => void;
};

/** 全部 / 流转 / 评论 / 修改 / 工时记录，中间三个带条数 */
export const ActivityTabs = memo(function ActivityTabs(props: TActivityTabsProps) {
  const { activeTab, counts, onChange } = props;
  const { t } = useTranslation();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5" role="tablist">
      {TABS.map((tab) => {
        const isActive = activeTab === tab;
        const count = tab in counts ? counts[tab as keyof TIssueTimelineCounts] : undefined;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-13 transition-colors outline-none",
              isActive ? "bg-layer-1 font-medium text-primary" : "text-tertiary hover:bg-layer-1/60 hover:text-secondary"
            )}
          >
            {t(`issue_activity.tabs.${TAB_I18N_KEY[tab]}`)}
            {count !== undefined && count > 0 && (
              <span className={cn("text-12 tabular-nums", isActive ? "text-tertiary" : "text-placeholder")}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});

ActivityTabs.displayName = "ActivityTabs";
