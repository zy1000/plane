/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType, LOGICAL_OPERATOR } from "@plane/types";
import type {
  IIssueDisplayFilterOptions,
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
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
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

const TYPED_PAGE_FILTER_KEY = "plane_typed_page_rich_filters";

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

function loadLocalRichFilters(projectId: string, variant: TTypedPageVariant): TWorkItemFilterExpression | null {
  try {
    const raw = localStorage.getItem(TYPED_PAGE_FILTER_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all?.[`${projectId}_${variant}`] ?? null;
  } catch {
    return null;
  }
}

function saveLocalRichFilters(
  projectId: string,
  variant: TTypedPageVariant,
  richFilters: TWorkItemFilterExpression
): void {
  try {
    const raw = localStorage.getItem(TYPED_PAGE_FILTER_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[`${projectId}_${variant}`] = richFilters;
    localStorage.setItem(TYPED_PAGE_FILTER_KEY, JSON.stringify(all));
  } catch {
    // ignore storage errors
  }
}

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

  // ── Local rich-filter state (user's expression WITHOUT type condition) ─
  const [localRichFilters, setLocalRichFilters] = useState<TWorkItemFilterExpression>(() => {
    if (!projectId) return {};
    return loadLocalRichFilters(projectId, variant) ?? {};
  });

  // ── Save originals to restore on unmount ──────────────────────────────
  const originalRichFiltersRef = useRef<TWorkItemFilterExpression>({});
  const originalGroupByRef = useRef<IIssueDisplayFilterOptions["group_by"] | undefined>(undefined);
  const hasSavedOriginalRef = useRef(false);

  // ── 切换项目或 typed variant 时，同步各自独立的本地筛选状态 ────────────
  useEffect(() => {
    if (!projectId) return;

    setLocalRichFilters(loadLocalRichFilters(projectId, variant) ?? {});
    originalRichFiltersRef.current = {};
    originalGroupByRef.current = undefined;
    hasSavedOriginalRef.current = false;
  }, [projectId, variant]);

  // ── Fetch base project filters once (for displayFilters defaults) ──────
  useSWR(
    workspaceSlug && projectId ? `TYPED_PAGE_INIT_${variant}_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (!workspaceSlug || !projectId) return;
      await issuesFilter?.fetchFilters(workspaceSlug, projectId);

      if (!hasSavedOriginalRef.current) {
        const loaded = issuesFilter?.getIssueFilters(projectId);
        originalRichFiltersRef.current = loaded?.richFilters ?? {};
        originalGroupByRef.current = loaded?.displayFilters?.group_by;
        hasSavedOriginalRef.current = true;
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  // ── Derived display state ───────────────────────────────────────────────
  const storeFilters = projectId ? issuesFilter?.getIssueFilters(projectId) : undefined;
  const activeLayout = storeFilters?.displayFilters?.layout;

  const mergedRichFilters = useMemo(
    () => mergeWithFixedTypeCondition(localRichFilters, fixedTypeIds),
    [localRichFilters, fixedTypeIds]
  );

  // ── 保持当前 typed 页面的固定 type 条件始终生效，避免切页时被其它页面覆盖
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (fixedTypeIds.length === 0) return;
    if (isEqual(storeFilters?.richFilters ?? {}, mergedRichFilters)) return;

    issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, mergedRichFilters);
  }, [workspaceSlug, projectId, fixedTypeIds.length, mergedRichFilters, storeFilters?.richFilters, issuesFilter]);

  // ── 问题#2：在 kanban 布局时将 group_by 强制覆盖为 "state"（不持久化）──
  // 仅在布局切换到 kanban 时触发，不监听 group_by 避免覆盖用户手动修改
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    const layout = storeFilters?.displayFilters?.layout;
    const groupBy = storeFilters?.displayFilters?.group_by;

    if (layout === "kanban" && groupBy === "state_detail.group") {
      issuesFilter?.applyLocalDisplayFilters(workspaceSlug, projectId, { group_by: "state" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilters?.displayFilters?.layout, workspaceSlug, projectId]);

  // ── 卸载时恢复 richFilters 和 group_by ────────────────────────────────
  useEffect(() => {
    return () => {
      if (!projectId) return;
      issuesFilter?.restoreLocalRichFilters(projectId, originalRichFiltersRef.current);
      if (originalGroupByRef.current !== undefined) {
        issuesFilter?.restoreLocalDisplayFilters(projectId, { group_by: originalGroupByRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Build the initialWorkItemFilters for the HOC:
  // richFilters = user expression (without type) — for the filter UI
  // displayFilters/displayProperties/kanbanFilters = from shared project store
  const initialWorkItemFilters: IIssueFilters | undefined = useMemo(() => {
    if (!storeFilters) return undefined;
    return {
      richFilters: localRichFilters,
      displayFilters: storeFilters.displayFilters,
      displayProperties: storeFilters.displayProperties,
      kanbanFilters: storeFilters.kanbanFilters,
    };
  }, [storeFilters, localRichFilters]);

  // ── Custom updateFilters: merge type, update store, save to localStorage
  const handleUpdateFilters = useCallback(
    async (expression: TWorkItemFilterExpression) => {
      if (!workspaceSlug || !projectId) return;

      // 1. Strip any type conditions from user expression and save to localStorage
      const userExprWithoutType = stripTypeIdFromExpression(expression);
      setLocalRichFilters(userExprWithoutType);
      saveLocalRichFilters(projectId, variant, userExprWithoutType);

      // 2. Merge with fixed type IDs and apply to store (triggers data refresh)
      if (fixedTypeIds.length > 0) {
        const merged = mergeWithFixedTypeCondition(userExprWithoutType, fixedTypeIds);
        issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, merged);
      }
    },
    [workspaceSlug, projectId, variant, fixedTypeIds, issuesFilter]
  );

  // ── Filters config (same as issues but without type_id) ────────────────
  const filtersConfig = (
    variant === "requirements" ? ISSUE_DISPLAY_FILTERS_BY_PAGE["requirements"] : ISSUE_DISPLAY_FILTERS_BY_PAGE["defects"]
  ) as { filters: TWorkItemFilterProperty[] };

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
      <ProjectLevelWorkItemFiltersHOC
        enableSaveView
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
    </IssuesStoreContext.Provider>
  );
});
