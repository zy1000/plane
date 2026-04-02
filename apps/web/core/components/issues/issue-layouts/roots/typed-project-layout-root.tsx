/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo } from "react";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType, LOGICAL_OPERATOR } from "@plane/types";
import type {
  IIssueFilters,
  TWorkItemFilterExpression,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { IssuesStoreContext, TypedPageIssueTypeIdsContext } from "@/hooks/use-issue-layout-store";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { type TProjectIssueScope } from "@/store/issue/project";
// local imports
import { IssuePeekOverview } from "../../peek-overview";
import { CalendarLayout } from "../calendar/roots/project-root";
import { BaseGanttRoot } from "../gantt";
import { KanBanLayout } from "../kanban/roots/project-root";
import { ListLayout } from "../list/roots/project-root";
import { ProjectSpreadsheetLayout } from "../spreadsheet/roots/project-root";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TTypedPageVariant = "requirements" | "defects";

type TTypedProjectLayoutRootProps = {
  variant: TTypedPageVariant;
};

// ─── Constants ───────────────────────────────────────────────────────────────

/** 需求页面匹配的类型名称（支持中英文） */
const REQUIREMENTS_TYPE_NAMES = ["史诗", "epic", "特性", "feature", "用户故事", "story", "user story"];

/** 缺陷页面匹配的类型名称（支持中英文） */
const DEFECTS_TYPE_NAMES = ["缺陷", "bug", "defect"];

// ─── Type name matching ───────────────────────────────────────────────────────

function matchesAnyName(typeName: string, allowedNames: string[]): boolean {
  const lower = typeName.toLowerCase().trim();
  return allowedNames.some((n) => n.toLowerCase() === lower);
}

// ─── Expression helpers ───────────────────────────────────────────────────────

type TConditionItem = Record<string, string | boolean | number>;

/** Strip any `type_id__*` conditions from an expression */
function stripTypeIdFromExpression(expr: TWorkItemFilterExpression): TWorkItemFilterExpression {
  if (!expr || Object.keys(expr).length === 0) return {};

  // AND group
  if (LOGICAL_OPERATOR.AND in (expr as object)) {
    const andGroup = expr as { [key: string]: TConditionItem[] };
    const children: TConditionItem[] = andGroup[LOGICAL_OPERATOR.AND] ?? [];
    const filtered = children.filter((child) => {
      const keys = Object.keys(child);
      return !keys.some((k) => k.startsWith("type_id__"));
    });
    if (filtered.length === 0) return {};
    if (filtered.length === 1) return filtered[0] as TWorkItemFilterExpression;
    return { [LOGICAL_OPERATOR.AND]: filtered } as TWorkItemFilterExpression;
  }

  // Single condition
  const keys = Object.keys(expr);
  if (keys.some((k) => k.startsWith("type_id__"))) return {};
  return expr;
}

/** Flatten a filter expression to an array of condition objects */
function flattenToConditions(expr: TWorkItemFilterExpression): TConditionItem[] {
  if (!expr || Object.keys(expr).length === 0) return [];

  if (LOGICAL_OPERATOR.AND in (expr as object)) {
    const andGroup = expr as { [key: string]: TConditionItem[] };
    return andGroup[LOGICAL_OPERATOR.AND] ?? [];
  }

  return [expr as TConditionItem];
}

/**
 * Merge user's rich filter expression with a fixed type_id condition.
 * The fixed condition cannot be removed or changed by the user.
 */
function mergeWithFixedTypeCondition(
  userExpr: TWorkItemFilterExpression,
  typeIds: string[]
): TWorkItemFilterExpression {
  if (typeIds.length === 0) return userExpr;

  const typeCondition: TConditionItem = { "type_id__in": typeIds.join(",") };

  const strippedUser = stripTypeIdFromExpression(userExpr);
  const isEmpty = Object.keys(strippedUser).length === 0;

  if (isEmpty) {
    return typeCondition as TWorkItemFilterExpression;
  }

  const userConditions = flattenToConditions(strippedUser);
  return { [LOGICAL_OPERATOR.AND]: [...userConditions, typeCondition] } as TWorkItemFilterExpression;
}

// ─── Layout switch ────────────────────────────────────────────────────────────

function TypedIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined }) {
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

// ─── Main component ───────────────────────────────────────────────────────────

export const TypedProjectLayoutRoot = observer(function TypedProjectLayoutRoot({
  variant,
}: TTypedProjectLayoutRootProps) {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;

  // ── Store hooks ────────────────────────────────────────────────────────
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);

  // ── Compute fixed type IDs ─────────────────────────────────────────────
  const allowedTypeNames = variant === "requirements" ? REQUIREMENTS_TYPE_NAMES : DEFECTS_TYPE_NAMES;

  const fixedTypeIds = useMemo(() => {
    if (!issueTypes || issueTypes.length === 0) return [];
    return issueTypes.filter((t) => matchesAnyName(t.name ?? "", allowedTypeNames)).map((t) => t.id);
  }, [issueTypes, allowedTypeNames]);

  const scope = variant as TProjectIssueScope;

  useEffect(() => {
    issuesFilter?.setActiveScope(scope);
  }, [issuesFilter, scope]);

  useSWR(
    workspaceSlug && projectId ? `TYPED_PAGE_INIT_${variant}_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter?.setActiveScope(scope);
      await issuesFilter?.fetchFilters(workspaceSlug, projectId, scope);
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const storeFilters = projectId ? issuesFilter?.getIssueFilters(projectId, scope) : undefined;
  const activeLayout = storeFilters?.displayFilters?.layout;
  const userRichFilters = useMemo(
    () => stripTypeIdFromExpression(storeFilters?.richFilters ?? {}),
    [storeFilters?.richFilters]
  );

  const mergedRichFilters = useMemo(
    () => mergeWithFixedTypeCondition(userRichFilters, fixedTypeIds),
    [userRichFilters, fixedTypeIds]
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    // Wait until scoped filters are initialized to avoid being overridden by fetchFilters.
    if (!storeFilters) return;
    if (fixedTypeIds.length === 0) return;
    if (isEqual(storeFilters?.richFilters ?? {}, mergedRichFilters)) return;

    issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, mergedRichFilters, scope);
  }, [workspaceSlug, projectId, fixedTypeIds.length, mergedRichFilters, scope, storeFilters, storeFilters?.richFilters, issuesFilter]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    const layout = storeFilters?.displayFilters?.layout;
    const groupBy = storeFilters?.displayFilters?.group_by;

    if (layout === "kanban" && groupBy === "state_detail.group") {
      issuesFilter?.applyLocalDisplayFilters(workspaceSlug, projectId, { group_by: "state" }, scope);
    }
  }, [storeFilters?.displayFilters?.layout, workspaceSlug, projectId, scope, issuesFilter]);

  const initialWorkItemFilters: IIssueFilters | undefined = useMemo(() => {
    if (!storeFilters) return undefined;
    return {
      richFilters: mergedRichFilters,
      displayFilters: storeFilters.displayFilters,
      displayProperties: storeFilters.displayProperties,
      kanbanFilters: storeFilters.kanbanFilters,
    };
  }, [mergedRichFilters, storeFilters]);

  const handleUpdateFilters = useCallback(
    async (expression: TWorkItemFilterExpression) => {
      if (!workspaceSlug || !projectId) return;

      const userExprWithoutType = stripTypeIdFromExpression(expression);
      if (fixedTypeIds.length > 0) {
        const merged = mergeWithFixedTypeCondition(userExprWithoutType, fixedTypeIds);
        issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, merged, scope);
      }
    },
    [workspaceSlug, projectId, fixedTypeIds, issuesFilter, scope]
  );

  // ── Filters config (same as issues but without type_id) ────────────────
  const filtersConfig = getProjectScopeFilterConfig(scope) as { filters: TWorkItemFilterProperty[] };

  // Wait for issue types and store filters to be ready before rendering layout
  // This prevents a brief flash of unfiltered data
  if (!workspaceSlug || !projectId || !initialWorkItemFilters || !issueTypes) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
      <TypedPageIssueTypeIdsContext.Provider value={fixedTypeIds}>
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
        deleteOnUnmount
        entityType={EIssuesStoreType.PROJECT}
        entityId={`${projectId}_${variant}`}
        filtersToShowByLayout={filtersConfig?.filters ?? ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={handleUpdateFilters}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: typedPageFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden">
            {typedPageFilter && (
              <WorkItemFiltersRow
                filter={typedPageFilter}
                trackerElements={{
                  saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
                }}
              />
            )}
            <div className="relative h-full w-full overflow-auto bg-surface-1">
              {issues?.getIssueLoader() === "mutation" && (
                <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                  <Spinner className="h-4 w-4" />
                </div>
              )}
              <TypedIssueLayout activeLayout={activeLayout} />
            </div>
            <IssuePeekOverview />
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
      </TypedPageIssueTypeIdsContext.Provider>
    </IssuesStoreContext.Provider>
  );
});
