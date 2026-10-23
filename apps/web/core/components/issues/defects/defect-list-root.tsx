import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane constants
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { EIssueLayoutTypes, EIssuesStoreType, LOGICAL_OPERATOR } from "@plane/types";
import type {
  IIssueDisplayFilterOptions,
  IIssueFilters,
  TIssueKanbanFilters,
  TWorkItemFilterExpression,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Spinner } from "@plane/ui";
// components
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { CalendarLayout } from "@/components/issues/issue-layouts/calendar/roots/project-root";
import { BaseGanttRoot } from "@/components/issues/issue-layouts/gantt";
import { KanBanLayout } from "@/components/issues/issue-layouts/kanban/roots/project-root";
import { ListLayout } from "@/components/issues/issue-layouts/list/roots/project-root";
import { ProjectSpreadsheetLayout } from "@/components/issues/issue-layouts/spreadsheet/roots/project-root";
import { ViewTabsRoot, getFilterPropertyLabels, getWorkItemViewSummary } from "@/components/views/in-page";
import type { TViewSnapshot } from "@/components/views/in-page";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { useUser } from "@/hooks/store/user";
import { IssuesStoreContext, TypedPageIssueTypeIdsContext } from "@/hooks/use-issue-layout-store";
import { type TProjectIssueScope } from "@/store/issue/project";
// local
import { PROJECT_DEFECT_FILTER_TOGGLE_EVENT } from "./defect-filter-events";
import { DEFECT_PRESET_PARAM, DEFECT_PRESET_STATE_NAMES, getDefectPreset } from "./defect-presets";
import type { TDefectPreset } from "./defect-presets";
import { DefectQuickFilterRail } from "./defect-quick-filter-rail";

// ─── Constants ───────────────────────────────────────────────────────────────

/** 缺陷页面对应的类别名称 */
const DEFECTS_CATEGORY_NAME = "缺陷";
const DEFECT_SCOPE = "defects" as TProjectIssueScope;

/** 未完成（待处理）的状态组：不含 已完成 / 已取消 */
const OPEN_STATE_GROUPS = "backlog,unstarted,started";

const INITIAL_DEFECT_DISPLAY_FILTERS: IIssueDisplayFilterOptions = {
  calendar: { show_weekends: false, layout: "month" },
  group_by: null,
  sub_group_by: null,
  layout: EIssueLayoutTypes.SPREADSHEET,
  order_by: "sort_order",
  show_empty_groups: false,
  sub_issue: false,
};

const INITIAL_DEFECT_KANBAN_FILTERS: TIssueKanbanFilters = {
  group_by: [],
  sub_group_by: [],
};

const INITIAL_DEFECT_RICH_FILTERS = {
  type__category__name__in: DEFECTS_CATEGORY_NAME,
} as TWorkItemFilterExpression;

/**
 * 由页面统一掌管的过滤维度，会从用户在 HeaderFilters 中的表达式里剥离，
 * 改由固定的「缺陷类别」约束 + 左栏当前预设的条件注入。具体类型（type_id）由用户自由筛选，与类别条件 AND。
 */
const MANAGED_CONDITION_PREFIXES = ["type__category__"];

// ─── Expression helpers ───────────────────────────────────────────────────────

type TConditionItem = Record<string, string | boolean | number>;

/** Flatten a filter expression to an array of condition objects */
function flattenToConditions(expr: TWorkItemFilterExpression): TConditionItem[] {
  if (!expr || Object.keys(expr).length === 0) return [];

  if (LOGICAL_OPERATOR.AND in (expr as object)) {
    const andGroup = expr as { [key: string]: TConditionItem[] };
    return andGroup[LOGICAL_OPERATOR.AND] ?? [];
  }

  return [expr as TConditionItem];
}

/** 去掉表达式中以指定前缀开头的条件（如 `type_id__`） */
function stripConditionsByPrefixes(expr: TWorkItemFilterExpression, prefixes: string[]): TConditionItem[] {
  const conditions = flattenToConditions(expr);
  return conditions.filter((child) => {
    const keys = Object.keys(child);
    return !keys.some((key) => prefixes.some((prefix) => key.startsWith(prefix)));
  });
}

/** 去掉已由预设注入的条件，避免从 store 读回后再次追加同一条件。 */
function stripExactConditions(conditions: TConditionItem[], conditionsToStrip: TConditionItem[]): TConditionItem[] {
  if (conditionsToStrip.length === 0) return conditions;
  return conditions.filter((condition) => !conditionsToStrip.some((toStrip) => isEqual(condition, toStrip)));
}

/** 去掉当前/上一次预设注入的条件，避免它们在切换预设后被当成用户筛选保留下来。 */
function stripPresetConditions(
  conditions: TConditionItem[],
  currentPresetConditions: TConditionItem[],
  previousPresetConditions: TConditionItem[]
): TConditionItem[] {
  return stripExactConditions(stripExactConditions(conditions, previousPresetConditions), currentPresetConditions);
}

/** 把若干条件组合成表达式：空→{}，单条→单条，多条→AND 组 */
function composeAnd(conditions: TConditionItem[]): TWorkItemFilterExpression {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0] as TWorkItemFilterExpression;
  return { [LOGICAL_OPERATOR.AND]: conditions } as TWorkItemFilterExpression;
}

/** 按状态名解析出来的预设 state_id（见 DEFECT_PRESET_STATE_NAMES） */
type TPresetStateIds = Partial<Record<TDefectPreset, string[]>>;

/** 项目里没有同名状态时用一个不存在的 id，让列表为空，而不是退化成不过滤 */
const NO_MATCH_STATE_ID = "00000000-0000-0000-0000-000000000000";

const stateIdsCondition = (stateIds: string[] | undefined): TConditionItem => ({
  state_id__in: (stateIds && stateIds.length > 0 ? stateIds : [NO_MATCH_STATE_ID]).join(","),
});

/** 预设 → 固定 rich filter 条件（缺陷口径之外的状态 / 负责人 / 提交人约束），与后端 defect-quick-counts 的口径一致 */
function getPresetConditions(
  preset: TDefectPreset,
  myId: string | undefined,
  stateIds: TPresetStateIds
): TConditionItem[] {
  switch (preset) {
    case "open":
      return [{ state_group__in: OPEN_STATE_GROUPS }];
    case "assigned":
      return myId ? [{ assignee_id__in: myId }] : [];
    case "reported":
      return myId ? [{ created_by_id__in: myId }] : [];
    case "to_verify":
      return myId ? [{ created_by_id__in: myId }, stateIdsCondition(stateIds.to_verify)] : [];
    case "pending_reject":
      return [stateIdsCondition(stateIds.pending_reject)];
    case "reopen":
      return [stateIdsCondition(stateIds.reopen)];
    case "rejected":
      return [{ state_group__in: "cancelled" }];
    case "closed":
      return [{ state_group__in: "completed" }];
    default:
      return [];
  }
}

// ─── Layout switch ────────────────────────────────────────────────────────────

function DefectIssueLayout(props: { activeLayout: EIssueLayoutTypes | undefined }) {
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

const DefectFiltersRow = observer(function DefectFiltersRow(props: {
  entityId: string;
  filter: IWorkItemFilterInstance;
}) {
  const { entityId, filter } = props;

  useEffect(() => {
    const handleToggle = (event: Event) => {
      const detail = (event as CustomEvent<{ entityId?: string }>).detail;
      if (detail?.entityId !== entityId) return;
      filter.toggleVisibility();
    };

    window.addEventListener(PROJECT_DEFECT_FILTER_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(PROJECT_DEFECT_FILTER_TOGGLE_EVENT, handleToggle);
  }, [entityId, filter]);

  return (
    <WorkItemFiltersRow
      filter={filter}
      trackerElements={{
        saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON,
      }}
    />
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * 缺陷专用列表入口（自 TypedProjectLayoutRoot fork）。
 *
 * - 仅服务缺陷页：固定缺陷类别 + scope=defects + 默认表格布局。
 * - 当前仍复用共享的 List/Spreadsheet 等布局组件与 ProjectIssues store（增量策略）；
 *   日后需要定制某个具体组件时，再单独 copy 该组件并在此引用即可，不影响工作项/需求页。
 * - 页头下的视图页签记住用户条件 + 显示设置；缺陷类别是页面固定口径，不进视图。
 * - 左栏快捷筛选（`?preset=`）是视图之上再套一层口径：最终条件 = 缺陷类别 ∧ 预设 ∧ 视图/筛选条；
 *   预设不进视图、不显示为 chip，切视图不改预设，切预设不算视图有改动。
 */
export const DefectListRoot = observer(function DefectListRoot() {
  const { workspaceSlug: routerWorkspaceSlug, projectId: routerProjectId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const projectId = routerProjectId ? routerProjectId.toString() : undefined;

  // ── Store hooks ────────────────────────────────────────────────────────
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { issueTypes } = useProjectIssueTypes(workspaceSlug, projectId);
  const { deleteFilter, getFilter } = useWorkItemFilters();
  const { getProjectStates } = useProjectState();
  const { data: currentUser } = useUser();
  const searchParams = useSearchParams();
  const preset = getDefectPreset(searchParams.get(DEFECT_PRESET_PARAM));
  const myId = currentUser?.id ? String(currentUser.id) : undefined;
  const projectStates = getProjectStates(projectId);

  const scope = DEFECT_SCOPE;
  const filterEntityId = projectId ? `${projectId}_defects` : "";
  const initializingFilterProjectIdRef = useRef<string>();
  const [initializedFilterProjectId, setInitializedFilterProjectId] = useState<string>();

  // ── Compute fixed type IDs（缺陷类别） ───────────────────────────────────
  const fixedTypeIds = useMemo(() => {
    if (!issueTypes || issueTypes.length === 0) return [];
    return issueTypes.filter((t) => t.category_name === DEFECTS_CATEGORY_NAME).map((t) => t.id);
  }, [issueTypes]);

  useEffect(() => {
    issuesFilter?.setActiveScope(scope);
  }, [issuesFilter, scope]);

  useSWR(
    workspaceSlug && projectId ? `DEFECT_LIST_INIT_${workspaceSlug}_${projectId}` : null,
    async () => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter?.setActiveScope(scope);
      await issuesFilter?.fetchFilters(workspaceSlug, projectId, scope);
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const storeFilters = projectId ? issuesFilter?.getIssueFilters(projectId, scope) : undefined;
  const areStoreFiltersReady = Boolean(storeFilters);
  const activeLayout = storeFilters?.displayFilters?.layout;
  const areDefectFiltersInitialized = initializedFilterProjectId === projectId;

  // 缺陷页筛选不落后端；每次重新进入都从固定缺陷类别重新开始，再由视图页签把记住的视图应用上来。
  useEffect(() => {
    if (!workspaceSlug || !projectId || !issuesFilter || !areStoreFiltersReady) return;
    if (initializingFilterProjectIdRef.current === projectId) return;

    // MobX 写入会同步触发 observer 重渲染，必须在任何写入前标记，避免初始化 effect 重入。
    initializingFilterProjectIdRef.current = projectId;

    deleteFilter(EIssuesStoreType.PROJECT, `${projectId}_defects`);
    issuesFilter.restoreLocalDisplayFilters(projectId, INITIAL_DEFECT_DISPLAY_FILTERS, scope);
    void issuesFilter.updateFilters(
      workspaceSlug,
      projectId,
      EIssueFilterType.KANBAN_FILTERS,
      INITIAL_DEFECT_KANBAN_FILTERS,
      scope
    );
    issuesFilter.applyLocalRichFilters(workspaceSlug, projectId, INITIAL_DEFECT_RICH_FILTERS, scope);
    setInitializedFilterProjectId(projectId);
  }, [workspaceSlug, projectId, issuesFilter, areStoreFiltersReady, deleteFilter, scope]);

  // ── 三层条件：用户(视图 + 筛选条) + 固定缺陷类别 + 左栏预设(状态/负责人/提交人) ─────────
  // 「待我验证 / 待确认驳回 / 重新打开」按状态名解析 state_id，只看缺陷类型（或未绑定类型）的状态
  const presetStateIds = useMemo<TPresetStateIds>(() => {
    const candidates = (projectStates ?? []).filter(
      (state) => !state.issue_type_id || fixedTypeIds.includes(state.issue_type_id)
    );
    const result: TPresetStateIds = {};
    (Object.entries(DEFECT_PRESET_STATE_NAMES) as [TDefectPreset, string][]).forEach(([key, name]) => {
      const lowered = name.toLowerCase();
      result[key] = candidates
        .filter((state) => state.name.trim().toLowerCase() === lowered)
        .map((state) => state.id);
    });
    return result;
  }, [projectStates, fixedTypeIds]);
  const presetConditions = useMemo(
    () => getPresetConditions(preset, myId, presetStateIds),
    [preset, myId, presetStateIds]
  );
  const lastAppliedPresetConditionsRef = useRef<TConditionItem[]>([]);
  const previousPresetConditions = lastAppliedPresetConditionsRef.current;

  // 固定口径：按「工作项类型的类别 = 缺陷」过滤（由后端 type__category__name__in 解析），
  // 不再依赖前端解析出的具体类型 ID，也不作为可见 chip 展示。
  const categoryConditions = useMemo<TConditionItem[]>(
    () => [{ type__category__name__in: DEFECTS_CATEGORY_NAME }],
    []
  );
  const storedUserConditions = useMemo(
    () => stripConditionsByPrefixes(storeFilters?.richFilters ?? {}, MANAGED_CONDITION_PREFIXES),
    [storeFilters?.richFilters]
  );
  const userConditions = useMemo(
    () => stripPresetConditions(storedUserConditions, presetConditions, previousPresetConditions),
    [storedUserConditions, presetConditions, previousPresetConditions]
  );

  // 写入 store / 真实拉取用：用户 + 缺陷类别 + 预设
  const fullMergedFilters = useMemo(
    () => composeAnd([...userConditions, ...categoryConditions, ...presetConditions]),
    [userConditions, categoryConditions, presetConditions]
  );
  // HeaderFilters、视图与左栏计数用：仅用户条件（缺陷类别与预设都是页面口径，不作为 chip 展示、不进视图）
  const userVisibleFilters = useMemo(() => composeAnd([...userConditions]), [userConditions]);

  // 应用合并后的表达式（缺陷类别 + 预设 + 用户）并触发刷新
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!storeFilters) return;
    if (!areDefectFiltersInitialized) return;
    lastAppliedPresetConditionsRef.current = presetConditions;
    if (isEqual(storeFilters?.richFilters ?? {}, fullMergedFilters)) return;
    issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, fullMergedFilters, scope);
  }, [
    workspaceSlug,
    projectId,
    fullMergedFilters,
    presetConditions,
    scope,
    storeFilters,
    storeFilters?.richFilters,
    issuesFilter,
    areDefectFiltersInitialized,
  ]);

  // kanban 分组兜底（沿用 typed root）
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    const layout = storeFilters?.displayFilters?.layout;
    const groupBy = storeFilters?.displayFilters?.group_by;
    if (layout === "kanban" && groupBy === "state_detail.group") {
      issuesFilter?.applyLocalDisplayFilters(workspaceSlug, projectId, { group_by: "state" }, scope);
    }
  }, [storeFilters?.displayFilters?.layout, workspaceSlug, projectId, scope, issuesFilter]);

  // 切视图期间筛选实例会同步回调一次，这一次由 applyViewSnapshot 统一写入
  const isApplyingViewRef = useRef(false);
  /** 用户表达式 → 写入 store 的完整表达式：去掉托管维度与预设重复项，再补上缺陷类别 + 当前预设 */
  const mergeWithManaged = useCallback(
    (expression: TWorkItemFilterExpression) =>
      composeAnd([
        ...stripExactConditions(stripConditionsByPrefixes(expression, MANAGED_CONDITION_PREFIXES), presetConditions),
        ...categoryConditions,
        ...presetConditions,
      ]),
    [categoryConditions, presetConditions]
  );
  const handleUpdateFilters = useCallback(
    async (expression: TWorkItemFilterExpression) => {
      if (!workspaceSlug || !projectId || isApplyingViewRef.current) return;
      issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, mergeWithManaged(expression), scope);
    },
    [workspaceSlug, projectId, mergeWithManaged, issuesFilter, scope]
  );

  // ── 视图页签：记住用户条件 + 显示设置，进页时把记住的视图应用上来 ──────────
  const currentViewSnapshot: TViewSnapshot | undefined =
    storeFilters && areDefectFiltersInitialized
      ? {
          rich_filters: userVisibleFilters,
          display_filters: storeFilters.displayFilters,
          display_properties: storeFilters.displayProperties,
        }
      : undefined;

  const applyViewSnapshot = useCallback(
    (snapshot: TViewSnapshot | null) => {
      if (!workspaceSlug || !projectId || !issuesFilter) return;
      const userFilters = (snapshot?.rich_filters ?? {}) as TWorkItemFilterExpression;
      // 筛选条跟着实例走；store 里筛选 + 显示设置一次写入、一次拉取（缺陷 scope 不回写后端）
      const filterInstance = getFilter(EIssuesStoreType.PROJECT, `${projectId}_defects`);
      if (filterInstance) {
        isApplyingViewRef.current = true;
        try {
          filterInstance.resetExpression(userFilters);
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
          richFilters: mergeWithManaged(userFilters),
          displayFilters: snapshot?.display_filters,
          displayProperties: snapshot?.display_properties,
        },
        scope
      );
    },
    [workspaceSlug, projectId, issuesFilter, getFilter, mergeWithManaged, scope]
  );

  // ── Filters config ────────────────────────────────────────────────────
  const defectFilterProperties = useMemo<TWorkItemFilterProperty[]>(() => {
    const config = getProjectScopeFilterConfig(scope) as { filters: TWorkItemFilterProperty[] };
    return config?.filters ?? ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.filters;
  }, [scope]);

  const initialWorkItemFilters: IIssueFilters | undefined = useMemo(() => {
    if (!storeFilters || !areDefectFiltersInitialized) return undefined;
    return {
      richFilters: userVisibleFilters,
      displayFilters: storeFilters.displayFilters,
      displayProperties: storeFilters.displayProperties,
      kanbanFilters: storeFilters.kanbanFilters,
    };
  }, [userVisibleFilters, storeFilters, areDefectFiltersInitialized]);

  // Wait for issue types and store filters to be ready before rendering layout
  if (!workspaceSlug || !projectId || !initialWorkItemFilters || !issueTypes || !areDefectFiltersInitialized) {
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
          deleteOnUnmount
          filterRowHiddenOnMount
          entityType={EIssuesStoreType.PROJECT}
          entityId={filterEntityId}
          filtersToShowByLayout={defectFilterProperties}
          initialWorkItemFilters={initialWorkItemFilters}
          updateFilters={handleUpdateFilters}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
        >
          {({ filter: typedPageFilter }) => (
            <div className="relative flex h-full w-full flex-col overflow-hidden">
              <ViewTabsRoot
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                scope="defects"
                allLabel="全部缺陷"
                current={currentViewSnapshot}
                apply={applyViewSnapshot}
                applyOnMount
                ready={areDefectFiltersInitialized}
                getSummary={(snapshot) =>
                  getWorkItemViewSummary(snapshot, getFilterPropertyLabels(typedPageFilter))
                }
              />
              <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
                <DefectQuickFilterRail
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  userFilters={userVisibleFilters}
                />
                <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                  {typedPageFilter && <DefectFiltersRow entityId={filterEntityId} filter={typedPageFilter} />}
                  <div className="relative h-full w-full overflow-auto bg-surface-1">
                    {issues?.getIssueLoader() === "mutation" && (
                      <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                        <Spinner className="h-4 w-4" />
                      </div>
                    )}
                    <DefectIssueLayout activeLayout={activeLayout} />
                  </div>
                  <IssuePeekOverview />
                </div>
              </div>
            </div>
          )}
        </ProjectLevelWorkItemFiltersHOC>
      </TypedPageIssueTypeIdsContext.Provider>
    </IssuesStoreContext.Provider>
  );
});
