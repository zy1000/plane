/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProfileViews } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// components
import { ProfileIssuesKanBanLayout } from "@/components/issues/issue-layouts/kanban/roots/profile-issues-root";
import { ListAppearanceContext } from "@/components/issues/issue-layouts/list/list-appearance-context";
import type { TListAppearance } from "@/components/issues/issue-layouts/list/list-appearance-context";
import { ProfileIssuesListLayout } from "@/components/issues/issue-layouts/list/roots/profile-issues-root";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { WorkItemSearch } from "@/components/issues/work-item-search";
import { ProfileIssuesFilter } from "@/components/profile/profile-issues-filter";
import { WorkspaceLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/workspace-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";

type Props = {
  type: TProfileViews;
};

export const ProfileIssuesPage = observer(function ProfileIssuesPage(props: Props) {
  const { type } = props;
  const { workspaceSlug, userId } = useParams();
  const { t } = useTranslation();
  // store hooks
  const {
    issues: { setViewId },
    issuesFilter: { issueFilters, fetchFilters, updateFilterExpression },
  } = useIssues(EIssuesStoreType.PROFILE);
  // derived values
  const activeLayout = issueFilters?.displayFilters?.layout || undefined;
  // 列对齐的行、列头、常驻空组只在个人主页生效
  const appearance = useMemo<TListAppearance>(
    () => ({ variant: "profile", entityLabel: t(type === "defects" ? "profile.tabs.defects" : "profile.tabs.work_items") }),
    [t, type]
  );

  useEffect(() => {
    if (setViewId) setViewId(type);
  }, [type, setViewId]);

  useSWR(
    workspaceSlug && userId ? `CURRENT_WORKSPACE_PROFILE_ISSUES_${workspaceSlug}_${userId}` : null,
    async () => {
      if (workspaceSlug && userId) {
        await fetchFilters(workspaceSlug, userId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROFILE}>
      <WorkspaceLevelWorkItemFiltersHOC
        entityId={userId}
        entityType={EIssuesStoreType.PROFILE}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues.filters}
        initialWorkItemFilters={issueFilters}
        updateFilters={updateFilterExpression.bind(updateFilterExpression, workspaceSlug, userId)}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: profileWorkItemsFilter }) => (
          <>
            <div className="flex h-full w-full flex-col">
              <div className="flex h-14 flex-shrink-0 items-center gap-2 border-b border-subtle px-page-x">
                {userId && (
                  <WorkItemSearch
                    entityType={EIssuesStoreType.PROFILE}
                    entityId={userId.toString()}
                    placeholder="搜索标题"
                    alwaysOpen
                  />
                )}
                <div className="ml-auto hidden md:flex">
                  <ProfileIssuesFilter />
                </div>
              </div>
              {profileWorkItemsFilter && <WorkItemFiltersRow filter={profileWorkItemsFilter} />}
              <div className="relative h-full min-h-0 w-full overflow-auto">
                <ListAppearanceContext.Provider value={appearance}>
                  {activeLayout === "list" ? (
                    <ProfileIssuesListLayout />
                  ) : activeLayout === "kanban" ? (
                    <ProfileIssuesKanBanLayout />
                  ) : null}
                </ListAppearanceContext.Provider>
              </div>
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </>
        )}
      </WorkspaceLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
