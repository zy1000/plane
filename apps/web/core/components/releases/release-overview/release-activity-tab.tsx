/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { E_SORT_ORDER } from "@plane/constants";
import type { TReleaseActivity } from "@plane/types";
import { cn } from "@plane/utils";
import { ActivityOperatorFilterRoot } from "@/components/issues/issue-detail/issue-activity/operator-filter-root";
import { ActivitySortRoot } from "@/components/issues/issue-detail/issue-activity/sort-root";
import { ReleaseActivityFeed } from "@/components/releases/release-activity";
import { ReleaseCommentsSection } from "@/components/releases/release-comments";
import { useReleaseActivity } from "@/hooks/store/use-release-activity";

type SubTabKey = "all" | "activity" | "comment" | "transition";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
};

const SECTION_CARD = "rounded-xl border border-subtle bg-surface-1";

const SUB_TABS: { key: SubTabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "activity", label: "活动" },
  { key: "comment", label: "评论" },
  { key: "transition", label: "转换" },
];

export const ReleaseActivityTab: React.FC<Props> = observer(({ workspaceSlug, projectId, releaseId }) => {
  const [active, setActive] = useState<SubTabKey>("all");
  const [sortOrder, setSortOrder] = useState<E_SORT_ORDER>(E_SORT_ORDER.ASC);
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);

  const { getActivitiesByReleaseId } = useReleaseActivity();
  const allActivities = getActivitiesByReleaseId(releaseId);

  const operatorIds = useMemo(() => {
    const set = new Set<string>();
    allActivities.forEach((activity) => {
      if (activity.actor) set.add(activity.actor);
    });
    return Array.from(set);
  }, [allActivities]);

  const toggleSortOrder = () =>
    setSortOrder((prev) => (prev === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC));

  const isFeedTab = active !== "comment";

  const filterFn = useMemo(() => {
    const fieldFilter =
      active === "activity"
        ? (field: string | null) => field !== "comment"
        : active === "transition"
          ? (field: string | null) => field === "status"
          : null;
    const operatorSet = new Set(selectedOperatorIds);

    if (!fieldFilter && operatorSet.size === 0) return undefined;
    return (activity: TReleaseActivity) => {
      if (fieldFilter && !fieldFilter(activity.field)) return false;
      if (operatorSet.size > 0 && (!activity.actor || !operatorSet.has(activity.actor))) return false;
      return true;
    };
  }, [active, selectedOperatorIds]);

  return (
    <section className={`${SECTION_CARD} flex h-[calc(100vh-9rem)] flex-col`}>
      <div className="flex items-center justify-between gap-2 border-b border-subtle px-5">
        <div className="flex items-center gap-1" role="tablist" aria-label="动态记录筛选">
          {SUB_TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1 border-b-2 px-2 py-2.5 text-14 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-primary",
                  isActive
                    ? "border-accent-primary text-primary"
                    : "border-transparent text-placeholder hover:text-secondary"
                )}
                onClick={() => setActive(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {isFeedTab && (
          <div className="flex shrink-0 items-center gap-2">
            <ActivityOperatorFilterRoot
              operatorIds={operatorIds}
              selectedOperatorIds={selectedOperatorIds}
              onChange={setSelectedOperatorIds}
            />
            <ActivitySortRoot sortOrder={sortOrder} toggleSort={toggleSortOrder} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "comment" ? (
          <ReleaseCommentsSection workspaceSlug={workspaceSlug} projectId={projectId} releaseId={releaseId} />
        ) : (
          <div className="vertical-scrollbar scrollbar-sm h-full overflow-y-auto px-6 py-5">
            <ReleaseActivityFeed
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              releaseId={releaseId}
              filterFn={filterFn}
              sortOrder={sortOrder}
              emptyHint={
                active === "activity" ? "暂无活动记录" : active === "transition" ? "暂无状态转换记录" : "暂无动态"
              }
            />
          </div>
        )}
      </div>
    </section>
  );
});
