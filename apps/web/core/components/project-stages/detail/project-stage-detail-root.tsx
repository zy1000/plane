import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { observer } from "mobx-react";
import useSWR from "swr";
import { EIssueFilterType, PROJECT_VIEW_TRACKER_ELEMENTS } from "@plane/constants";
import { EIssueLayoutTypes, EIssuesStoreType, LOGICAL_OPERATOR } from "@plane/types";
import type {
  IIssueDisplayFilterOptions,
  IIssueFilters,
  TIssue,
  TIssueKanbanFilters,
  TWorkItemFilterExpression,
  TWorkItemFilterProperty,
} from "@plane/types";
import { Spinner } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { CalendarLayout } from "@/components/issues/issue-layouts/calendar/roots/project-root";
import { BaseGanttRoot } from "@/components/issues/issue-layouts/gantt";
import { KanBanLayout } from "@/components/issues/issue-layouts/kanban/roots/project-root";
import { ListLayout } from "@/components/issues/issue-layouts/list/roots/project-root";
import { ProjectSpreadsheetLayout } from "@/components/issues/issue-layouts/spreadsheet/roots/project-root";
import { IssuePeekOverview } from "@/components/issues/peek-overview";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { ProjectLevelWorkItemFiltersHOC } from "@/components/work-item-filters/filters-hoc/project-level";
import { WorkItemFiltersRow } from "@/components/work-item-filters/filters-row";
import { useIssues } from "@/hooks/store/use-issues";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import { IssuesStoreContext } from "@/hooks/use-issue-layout-store";
import useLocalStorage from "@/hooks/use-local-storage";
import type { TProjectIssueScope } from "@/store/issue/project";
import { collectProjectStageSubtreeIds } from "../project-stage-rows";
import { PROJECT_STAGE_SIDEBAR_COLLAPSED_KEY, getProjectStageFilterEntityId } from "./constants";
import { ProjectStageDetailHeader } from "./project-stage-detail-header";
import { ProjectStageDetailSidebar } from "./project-stage-detail-sidebar";

const STAGE_SCOPE: TProjectIssueScope = "stage";

/** 第一次进某个项目的阶段详情页：列表布局、按状态组分组（左侧分组栏），之后沿用用户在本页改过的设置 */
const INITIAL_STAGE_DISPLAY_FILTERS: IIssueDisplayFilterOptions = {
  layout: EIssueLayoutTypes.LIST,
  group_by: "state_detail.group",
  sub_group_by: null,
};

const INITIAL_STAGE_KANBAN_FILTERS: TIssueKanbanFilters = { group_by: [], sub_group_by: [] };

/** 阶段条件由页面掌管：从用户表达式里剥掉，再按当前阶段（含子阶段）注入，不显示成筛选条件 */
const MANAGED_CONDITION_PREFIXES = ["stage_id__"];

/** 本次会话里已经套过初始显示设置的项目 */
const displayInitializedProjects = new Set<string>();

type TConditionItem = Record<string, string | boolean | number>;

const flattenToConditions = (expression: TWorkItemFilterExpression): TConditionItem[] => {
  if (!expression || Object.keys(expression).length === 0) return [];
  if (LOGICAL_OPERATOR.AND in (expression as object)) {
    return (expression as { [key: string]: TConditionItem[] })[LOGICAL_OPERATOR.AND] ?? [];
  }
  return [expression as TConditionItem];
};

const stripManagedConditions = (expression: TWorkItemFilterExpression): TConditionItem[] =>
  flattenToConditions(expression).filter(
    (condition) =>
      !Object.keys(condition).some((key) => MANAGED_CONDITION_PREFIXES.some((prefix) => key.startsWith(prefix)))
  );

const composeAnd = (conditions: TConditionItem[]): TWorkItemFilterExpression => {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0] as TWorkItemFilterExpression;
  return { [LOGICAL_OPERATOR.AND]: conditions } as TWorkItemFilterExpression;
};

/** 影响阶段统计（进度、状态分布）的字段 */
const issueSignature = (issue: TIssue) => `${issue.state_id}|${issue.stage_id}`;

const collectLoadedIssueIds = (grouped: unknown): string[] => {
  if (!grouped || typeof grouped !== "object") return [];
  const ids: string[] = [];
  Object.values(grouped as Record<string, unknown>).forEach((group) => {
    if (Array.isArray(group)) ids.push(...(group as string[]));
    else if (group && typeof group === "object") {
      Object.values(group as Record<string, unknown>).forEach((subGroup) => {
        if (Array.isArray(subGroup)) ids.push(...(subGroup as string[]));
      });
    }
  });
  return ids;
};

const StageIssueLayout = ({ activeLayout }: { activeLayout: EIssueLayoutTypes | undefined }) => {
  switch (activeLayout) {
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
};

/**
 * 阶段详情页：页头 + 挂在该阶段（含子阶段）上的工作项 + 右侧阶段信息栏。
 *
 * 做法同缺陷页（DefectListRoot）：复用项目工作项 store 与全部布局，scope=stage，把
 * 「阶段 ∈ 当前阶段及其子阶段」并进筛选表达式。阶段条件是页面口径，不作为筛选条件显示；
 * 本页的筛选和显示设置只留在本地，不回写后端。
 *
 * 只算工作项自己挂的阶段：所在迭代挂了本阶段、工作项自己没挂的不算。
 */
export const ProjectStageDetailRoot = observer(function ProjectStageDetailRoot({
  workspaceSlug,
  projectId,
  stageId,
}: {
  workspaceSlug: string;
  projectId: string;
  stageId: string;
}) {
  const { issues, issuesFilter, issueMap } = useIssues(EIssuesStoreType.PROJECT);
  const { deleteFilter } = useWorkItemFilters();
  const { getProjectStageOptions, fetchStages, refetchStages } = useProjectStage();
  const { storedValue: sidebarCollapsed } = useLocalStorage(PROJECT_STAGE_SIDEBAR_COLLAPSED_KEY, "false");

  const scope = STAGE_SCOPE;
  const filterEntityId = getProjectStageFilterEntityId(projectId);
  const initializingProjectIdRef = useRef<string>();
  const [initializedProjectId, setInitializedProjectId] = useState<string>();

  // ── 阶段及其子阶段 ─────────────────────────────────────────────────────
  // 进页重拉一次阶段：项目外壳预热的那份可能是旧的（计数、别人新建的子阶段）
  useSWR(`PROJECT_STAGE_DETAIL_STAGES_${workspaceSlug}_${projectId}`, () => fetchStages(workspaceSlug, projectId), {
    revalidateOnFocus: false,
  });
  const stageOptions = getProjectStageOptions(projectId);
  const subtreeKey = useMemo(
    () =>
      collectProjectStageSubtreeIds(
        stageOptions.map((option) => option.stage),
        stageId
      ).join(","),
    [stageOptions, stageId]
  );
  const stageConditions = useMemo<TConditionItem[]>(() => [{ stage_id__in: subtreeKey }], [subtreeKey]);

  // ── 筛选初始化 ─────────────────────────────────────────────────────────
  useEffect(() => {
    issuesFilter?.setActiveScope(scope);
  }, [issuesFilter, scope]);

  useSWR(
    `PROJECT_STAGE_DETAIL_INIT_${workspaceSlug}_${projectId}`,
    async () => {
      issuesFilter?.setActiveScope(scope);
      await issuesFilter?.fetchFilters(workspaceSlug, projectId, scope);
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const storeFilters = issuesFilter?.getIssueFilters(projectId, scope);
  const areStoreFiltersReady = Boolean(storeFilters);
  const activeLayout = storeFilters?.displayFilters?.layout;
  const isInitialized = initializedProjectId === projectId;

  // 每次进页从「只有阶段条件」开始；显示设置只在本次会话第一次进该项目时套初始值
  useEffect(() => {
    if (!issuesFilter || !areStoreFiltersReady) return;
    if (initializingProjectIdRef.current === projectId) return;
    // MobX 写入会同步触发重渲染，必须在任何写入前标记，避免初始化重入
    initializingProjectIdRef.current = projectId;

    deleteFilter(EIssuesStoreType.PROJECT, filterEntityId);
    if (!displayInitializedProjects.has(projectId)) {
      displayInitializedProjects.add(projectId);
      issuesFilter.restoreLocalDisplayFilters(projectId, INITIAL_STAGE_DISPLAY_FILTERS, scope);
      void issuesFilter.updateFilters(
        workspaceSlug,
        projectId,
        EIssueFilterType.KANBAN_FILTERS,
        INITIAL_STAGE_KANBAN_FILTERS,
        scope
      );
    }
    issuesFilter.applyLocalRichFilters(workspaceSlug, projectId, composeAnd(stageConditions), scope);
    setInitializedProjectId(projectId);
  }, [workspaceSlug, projectId, issuesFilter, areStoreFiltersReady, deleteFilter, filterEntityId, scope, stageConditions]);

  // ── 用户条件 + 阶段条件 ────────────────────────────────────────────────
  const userConditions = useMemo(
    () => stripManagedConditions(storeFilters?.richFilters ?? {}),
    [storeFilters?.richFilters]
  );
  const fullMergedFilters = useMemo(
    () => composeAnd([...userConditions, ...stageConditions]),
    [userConditions, stageConditions]
  );
  const userVisibleFilters = useMemo(() => composeAnd(userConditions), [userConditions]);

  // 阶段换了（面包屑切换、进了子阶段）或子树变了：写回完整表达式并重拉
  useEffect(() => {
    if (!storeFilters || !isInitialized) return;
    if (isEqual(storeFilters.richFilters ?? {}, fullMergedFilters)) return;
    issuesFilter?.applyLocalRichFilters(workspaceSlug, projectId, fullMergedFilters, scope);
  }, [workspaceSlug, projectId, fullMergedFilters, scope, storeFilters, storeFilters?.richFilters, issuesFilter, isInitialized]);

  // 看板不能按状态组分组，退回按状态（同缺陷页）
  useEffect(() => {
    const layout = storeFilters?.displayFilters?.layout;
    const groupBy = storeFilters?.displayFilters?.group_by;
    if (layout === "kanban" && groupBy === "state_detail.group") {
      issuesFilter?.applyLocalDisplayFilters(workspaceSlug, projectId, { group_by: "state" }, scope);
    }
  }, [storeFilters?.displayFilters?.layout, storeFilters?.displayFilters?.group_by, workspaceSlug, projectId, scope, issuesFilter]);

  const handleUpdateFilters = useCallback(
    async (expression: TWorkItemFilterExpression) => {
      issuesFilter?.applyLocalRichFilters(
        workspaceSlug,
        projectId,
        composeAnd([...stripManagedConditions(expression), ...stageConditions]),
        scope
      );
    },
    [workspaceSlug, projectId, stageConditions, issuesFilter, scope]
  );

  // ── 列表与阶段统计跟着本地变化走 ───────────────────────────────────────
  // 单条新建 / 更新 / 删除成功后，store 的 fetchParentStats 会重取阶段统计（见 ProjectIssues）。
  // 这里补两件它管不到的事：
  // 1. 工作项的阶段改到了本阶段之外（行内改、批量条、看板拖到别的阶段分组）：store 只会重新分组，
  //    不会重判筛选条件，要把它从列表里拿掉，页头的数量也跟着减。
  // 2. 批量条是请求成功后才改本地数据的，不经过 fetchParentStats，本地状态 / 阶段一变就重取统计。
  //    用 refetchStages：单条更新是先改本地再发请求，这一次可能读到旧数，它保证落库后那次排在后面。
  const signatures = new Map<string, string>();
  const movedOutIds: string[] = [];
  const subtreeIds = subtreeKey.split(",");
  collectLoadedIssueIds(issues?.groupedIssueIds).forEach((issueId) => {
    const issue = issueMap?.[issueId];
    if (!issue) return;
    signatures.set(issueId, issueSignature(issue));
    if (!issue.stage_id || !subtreeIds.includes(issue.stage_id)) movedOutIds.push(issueId);
  });
  const signatureKey = Array.from(signatures, ([issueId, signature]) => `${issueId}:${signature}`).join(";");
  const movedOutKey = movedOutIds.join(",");
  const isListLoading = Boolean(issues?.getIssueLoader());
  const areFiltersInSync = isEqual(storeFilters?.richFilters ?? {}, fullMergedFilters);
  const previousSignaturesRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const previous = previousSignaturesRef.current;
    previousSignaturesRef.current = signatures;
    if (!previous) return;
    let changed = false;
    signatures.forEach((signature, issueId) => {
      const before = previous.get(issueId);
      if (before !== undefined && before !== signature) changed = true;
    });
    if (changed) void refetchStages(workspaceSlug, projectId);
    // signatures 由 signatureKey 唯一决定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureKey, refetchStages, workspaceSlug, projectId]);

  useEffect(() => {
    if (!isInitialized || !movedOutKey || !issues) return;
    // 刚进页、换阶段、改筛选时，列表里还是上一份数据（别的页面的 / 上一个阶段的），等这一轮拉完再判，
    // 否则会把整页工作项当成「移出」。布局组件的取数在子组件的 effect 里先于这里发出，所以读 store 的实时值
    if (issues.getIssueLoader()) return;
    const liveFilters = issuesFilter?.getIssueFilters(projectId, scope)?.richFilters ?? {};
    if (!isEqual(liveFilters, fullMergedFilters)) return;
    const subtree = new Set(subtreeKey.split(","));
    collectLoadedIssueIds(issues.groupedIssueIds).forEach((issueId) => {
      const issue = issueMap?.[issueId];
      if (issue && (!issue.stage_id || !subtree.has(issue.stage_id))) issues.removeIssueFromList(issueId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedOutKey, isInitialized, isListLoading, areFiltersInSync]);

  // ── 筛选配置 ───────────────────────────────────────────────────────────
  const stageFilterProperties = useMemo<TWorkItemFilterProperty[]>(
    () => getProjectScopeFilterConfig(scope).filters as TWorkItemFilterProperty[],
    [scope]
  );

  const initialWorkItemFilters: IIssueFilters | undefined = useMemo(() => {
    if (!storeFilters || !isInitialized) return undefined;
    return {
      richFilters: userVisibleFilters,
      displayFilters: storeFilters.displayFilters,
      displayProperties: storeFilters.displayProperties,
      kanbanFilters: storeFilters.kanbanFilters,
    };
  }, [userVisibleFilters, storeFilters, isInitialized]);

  if (!initialWorkItemFilters || !isInitialized) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <IssuesStoreContext.Provider value={EIssuesStoreType.PROJECT}>
      <ProjectLevelWorkItemFiltersHOC
        deleteOnUnmount
        filterRowHiddenOnMount
        entityType={EIssuesStoreType.PROJECT}
        entityId={filterEntityId}
        filtersToShowByLayout={stageFilterProperties}
        initialWorkItemFilters={initialWorkItemFilters}
        updateFilters={handleUpdateFilters}
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      >
        {({ filter: stageFilter }) => (
          <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-1">
            {/* 页头放在筛选实例建好之后渲染（见 ProjectStageDetailHeader 的说明） */}
            <AppHeader header={<ProjectStageDetailHeader onFilterToggle={() => stageFilter?.toggleVisibility()} />} />
            <div className="relative flex min-h-0 w-full flex-1 overflow-hidden">
              <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                {stageFilter && (
                  <WorkItemFiltersRow
                    filter={stageFilter}
                    trackerElements={{ saveView: PROJECT_VIEW_TRACKER_ELEMENTS.PROJECT_HEADER_SAVE_AS_VIEW_BUTTON }}
                  />
                )}
                <div className="relative h-full w-full overflow-auto bg-surface-1">
                  {issues?.getIssueLoader() === "mutation" && (
                    <div className="shadow-sm fixed top-[70px] right-[20px] z-50 flex h-[40px] w-[40px] items-center justify-center rounded-sm bg-layer-1">
                      <Spinner className="h-4 w-4" />
                    </div>
                  )}
                  <StageIssueLayout activeLayout={activeLayout} />
                </div>
                <IssuePeekOverview />
              </div>
              {sidebarCollapsed !== "true" && (
                <ProjectStageDetailSidebar workspaceSlug={workspaceSlug} projectId={projectId} stageId={stageId} />
              )}
            </div>
          </div>
        )}
      </ProjectLevelWorkItemFiltersHOC>
    </IssuesStoreContext.Provider>
  );
});
