/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
import type { TWorkItemFilterExpression } from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { ViewTabsRoot, getWorkItemViewSummary } from "@/components/views/in-page";
import type { TViewSnapshot } from "@/components/views/in-page";
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import { DEFAULT_PROJECT_ISSUE_SCOPE } from "@/store/issue/project";
// local imports
import { IssuePeekOverview } from "../../peek-overview";
import { CalendarLayout } from "../calendar/roots/project-root";
import { BaseGanttRoot } from "../gantt";
import { KanBanLayout } from "../kanban/roots/project-root";
import { ListLayout } from "../list/roots/project-root";
import { ProjectSpreadsheetLayout } from "../spreadsheet/roots/project-root";

function ProjectIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined }) {
  switch (props.activeLayout) {
    case EIssueLayoutTypes.LIST:
      return <ListLayout />;
    case EIssueLayoutTypes.KANBAN:
      return <KanBanLayout />;
    case EIssueLayoutTypes.CALENDAR:
      return <CalendarLayout />;
    case EIssueLayoutTypes.GANTT:
      return <BaseGanttRoot />;
    case EIssueLayoutTypes.SPREADSHEET:
      return <ProjectSpreadsheetLayout />;
    default:
      return null;
  }
}

export const ProjectLayoutRoot = observer(function ProjectLayoutRoot() {
  // router
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;
  // hooks
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { getFilter } = useWorkItemFilters();
  // derived values
  const workItemFilters = projectId ? issuesFilter?.getIssueFilters(projectId, DEFAULT_PROJECT_ISSUE_SCOPE) : undefined;
  const activeLayout = workItemFilters?.displayFilters?.layout;

  useEffect(() => {
    issuesFilter?.setActiveScope(DEFAULT_PROJECT_ISSUE_SCOPE);
  }, [issuesFilter]);

  useSWR(
    workspaceSlug && projectId ? `PROJECT_ISSUES_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        issuesFilter?.setActiveScope(DEFAULT_PROJECT_ISSUE_SCOPE);
        await issuesFilter?.fetchFilters(workspaceSlug, projectId, DEFAULT_PROJECT_ISSUE_SCOPE);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // 页内视图页签：当前状态直接引用 store 里的对象（observer 跟踪 key 级变化），不要克隆
  const currentViewSnapshot: TViewSnapshot | undefined = workItemFilters
    ? {
        rich_filters: workItemFilters.richFilters ?? ({} as TWorkItemFilterExpression),
        display_filters: workItemFilters.displayFilters,
        display_properties: workItemFilters.displayProperties,
      }
    : undefined;

  // 切视图期间筛选实例会同步回调一次 onExpressionChange，这一次由 applyViewSnapshot 统一写入，不要再单独写
  const isApplyingViewRef = useRef(false);
  const handleFilterExpressionChange = useCallback(
    (expression: TWorkItemFilterExpression) => {
      if (isApplyingViewRef.current || !workspaceSlug || !projectId) return;
      void issuesFilter?.updateFilterExpression(workspaceSlug, projectId, expression, DEFAULT_PROJECT_ISSUE_SCOPE);
    },
    [workspaceSlug, projectId, issuesFilter]
  );

  const applyViewSnapshot = useCallback(
    (snapshot: TViewSnapshot | null) => {
      if (!workspaceSlug || !projectId || !issuesFilter) return;
      const richFilters = (snapshot?.rich_filters ?? {}) as TWorkItemFilterExpression;
      // 筛选条跟着实例走；store 里筛选 + 显示设置一次写入、一次拉取，拆开会互相取消请求
      const filterInstance = getFilter(EIssuesStoreType.PROJECT, projectId);
      if (filterInstance) {
        isApplyingViewRef.current = true;
        try {
          filterInstance.resetExpression(richFilters);
        } finally {
          isApplyingViewRef.current = false;
        }
        // 筛选条显隐跟着视图走：带条件就展开（不然看不出视图生效），没条件就收起
        filterInstance.toggleVisibility(filterInstance.hasActiveFilters);
      }
      void issuesFilter.applyViewSnapshot(
        workspaceSlug,
        projectId,
        {
          richFilters,
          displayFilters: snapshot?.display_filters,
          displayProperties: snapshot?.display_properties,
        },
        DEFAULT_PROJECT_ISSUE_SCOPE
      );
    },
    [workspaceSlug, projectId, issuesFilter, getFilter]
  );

  if (!workspaceSlug || !projectId || !workItemFilters) return <></>;
  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
      <ProjectLevelWorkItemFiltersHOC
        entityType={EIssuesStoreType.PROJECT}
        entityId={projectId}
        filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={workItemFilters}
        updateFilters={handleFilterExpressionChange}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: projectWorkItemsFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            <ViewTabsRoot
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              scope="issues"
              allLabel="全部工作项"
              pageLabel="工作项"
              current={currentViewSnapshot}
              apply={applyViewSnapshot}
              getSummary={getWorkItemViewSummary}
            />
            {projectWorkItemsFilter && (
              <WorkItemFiltersRow
                filter={projectWorkItemsFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            )}
            <div className="relative h-full w-full overflow-auto bg-surface-1">
              {/* mutation loader */}
              {issues?.getIssueLoader() === "mutation" && (
                <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                  <Spinner className="h-4 w-4" />
                </div>
              )}
              <ProjectIssueLayout activeLayout={activeLayout} />
            </div>
            {/* peek overview */}
            <IssuePeekOverview />
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
