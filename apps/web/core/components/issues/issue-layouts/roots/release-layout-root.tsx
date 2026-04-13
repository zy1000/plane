/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Row, ERowVariant } from "@plane/ui";
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useIssues } from "@/hooks/store/use-issues";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { IssuePeekOverview } from "../../peek-overview";
import { ReleaseCalendarLayout } from "../calendar/roots/release-root";
import { BaseGanttRoot } from "../gantt";
import { ReleaseKanBanLayout } from "../kanban/roots/release-root";
import { ReleaseListLayout } from "../list/roots/release-root";
import { ReleaseSpreadsheetLayout } from "../spreadsheet/roots/release-root";

function ReleaseIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined; releaseId: string }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ReleaseListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <ReleaseKanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <ReleaseCalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot viewId={props.releaseId} />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ReleaseSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ReleaseLayoutRoot = observer(function ReleaseLayoutRoot() {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId, releaseId: routerReleaseId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  const releaseId = routerReleaseId ? routerReleaseId.toString() : undefined;
  const { issuesFilter } = useIssues(EIssuesStoreType.RELEASE);
  const workItemFilters = releaseId ? issuesFilter?.getIssueFilters(releaseId) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout || undefined;

  useSWR(
    workspaceSlug && projectId && releaseId
      ? `RELEASE_ISSUES_${workspaceSlug}_${projectId}_${releaseId}`
      : null,
    async () => {
      if (workspaceSlug && projectId && releaseId) {
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, releaseId);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!workspaceSlug || !projectId || !releaseId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.RELEASE}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        entityType={EIssuesStoreType.RELEASE}
        entityId={releaseId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={issuesFilter?.updateFilterExpression.bind(issuesFilter, workspaceSlug, projectId, releaseId)}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: releaseWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            {releaseWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={releaseWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.MODULE_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            )}
            <Row variant={ERowVariant.HUGGING} className="h-full w-full overflow-auto">
              <ReleaseIssueLayout activeLayout={activeLayout} releaseId={releaseId} />
            </Row>
            <IssuePeekOverview />
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
