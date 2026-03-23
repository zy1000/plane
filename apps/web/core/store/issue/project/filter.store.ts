/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
// base class
import { computedFn } from "mobx-utils";
import type { TSupportedFilterTypeForUpdate } from "@plane/constants";
import { EIssueFilterType } from "@plane/constants";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  TIssueKanbanFilters,
  IIssueFilters,
  TIssueParams,
  IssuePaginationOptions,
  TWorkItemFilterExpression,
  TWorkItemFilterConditionData,
  TWorkItemFilterAndGroup,
  TSupportedFilterForUpdate,
} from "@plane/types";
import { EIssuesStoreType, LOGICAL_OPERATOR } from "@plane/types";
import { handleIssueQueryParamsByLayout } from "@plane/utils";
import type { IBaseIssueFilterStore } from "../helpers/issue-filter-helper.store";
import { IssueFilterHelperStore } from "../helpers/issue-filter-helper.store";
// helpers
// types
import type { IIssueRootStore } from "../root.store";
import { ProjectService } from "@/services/project";
// constants
// services

// ─── State ID expansion helpers ──────────────────────────────────────────────

/**
 * 将过滤表达式中所有 state_id__* 条件的值扩展为包含同名状态的所有 ID。
 *
 * 背景：状态已与工作项类型绑定，同名状态（如 "todo"）在不同类型中拥有不同的
 * state_id。若只按单一 state_id 过滤，会漏掉其他类型的同名状态对应的工作项。
 * 本函数在生成 API 查询参数前将单个 state_id 扩展为所有同名 IDs，保证结果完整。
 */
function expandStateIdsInExpression(
  expression: TWorkItemFilterExpression,
  stateNameToIdsMap: Map<string, string[]>
): TWorkItemFilterExpression {
  if (!expression || Object.keys(expression).length === 0) return expression;
  if (!stateNameToIdsMap || stateNameToIdsMap.size === 0) return expression;

  // 构建 stateId → 同名 IDs 的映射（只包含有多个 ID 的名称）
  const stateIdToSiblings = new Map<string, string[]>();
  for (const ids of stateNameToIdsMap.values()) {
    if (ids.length > 1) {
      for (const id of ids) stateIdToSiblings.set(id, ids);
    }
  }

  if (stateIdToSiblings.size === 0) return expression;

  // AND 组
  if (LOGICAL_OPERATOR.AND in expression) {
    const andGroup = expression as TWorkItemFilterAndGroup;
    const expanded = andGroup[LOGICAL_OPERATOR.AND].map((child) =>
      expandStateConditionData(child, stateIdToSiblings)
    );
    return { [LOGICAL_OPERATOR.AND]: expanded } as TWorkItemFilterExpression;
  }

  // 单条件
  return expandStateConditionData(
    expression as TWorkItemFilterConditionData,
    stateIdToSiblings
  ) as TWorkItemFilterExpression;
}

function expandStateConditionData(
  condition: TWorkItemFilterConditionData,
  stateIdToSiblings: Map<string, string[]>
): TWorkItemFilterConditionData {
  const hasStateKey = Object.keys(condition).some((k) => k.startsWith("state_id__"));
  if (!hasStateKey) return condition;

  const result: Record<string, unknown> = { ...condition };
  for (const key of Object.keys(condition)) {
    if (!key.startsWith("state_id__")) continue;
    const raw = (condition as Record<string, unknown>)[key];
    if (typeof raw !== "string" || !raw) continue;

    const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
    const expanded = new Set<string>(ids);
    for (const id of ids) {
      stateIdToSiblings.get(id)?.forEach((s) => expanded.add(s));
    }
    result[key] = Array.from(expanded).join(",");
  }
  return result as TWorkItemFilterConditionData;
}

export interface IProjectIssuesFilter extends IBaseIssueFilterStore {
  //helper actions
  getFilterParams: (
    options: IssuePaginationOptions,
    projectId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(projectId: string): IIssueFilters | undefined;
  // action
  fetchFilters: (workspaceSlug: string, projectId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate
  ) => Promise<void>;
  /** 仅更新内存中的 richFilters 并触发数据刷新，不回写后端（供 typed 页面使用） */
  applyLocalRichFilters: (workspaceSlug: string, projectId: string, richFilters: TWorkItemFilterExpression) => void;
  /** 仅重置内存中的 richFilters，不触发数据刷新（供 typed 页面卸载时恢复用） */
  restoreLocalRichFilters: (projectId: string, richFilters: TWorkItemFilterExpression) => void;
  /** 仅更新内存中的 displayFilters 并触发数据刷新，不回写后端（供 typed 页面使用） */
  applyLocalDisplayFilters: (
    workspaceSlug: string,
    projectId: string,
    displayFilters: Partial<IIssueDisplayFilterOptions>
  ) => void;
  /** 仅重置内存中的 displayFilters，不触发数据刷新（供 typed 页面卸载时恢复用） */
  restoreLocalDisplayFilters: (projectId: string, displayFilters: Partial<IIssueDisplayFilterOptions>) => void;
}

export class ProjectIssuesFilter extends IssueFilterHelperStore implements IProjectIssuesFilter {
  // observables
  filters: { [projectId: string]: IIssueFilters } = {};
  // root store
  rootIssueStore: IIssueRootStore;
  // services
  projectService;

  constructor(_rootStore: IIssueRootStore) {
    super();
    makeObservable(this, {
      // observables
      filters: observable,
      // computed
      issueFilters: computed,
      appliedFilters: computed,
      // actions
      fetchFilters: action,
      updateFilterExpression: action,
      updateFilters: action,
      applyLocalRichFilters: action,
      restoreLocalRichFilters: action,
      applyLocalDisplayFilters: action,
      restoreLocalDisplayFilters: action,
    });
    // root store
    this.rootIssueStore = _rootStore;
    // services
    this.projectService = new ProjectService();
  }

  get issueFilters() {
    const projectId = this.rootIssueStore.projectId;
    if (!projectId) return undefined;

    return this.getIssueFilters(projectId);
  }

  get appliedFilters() {
    const projectId = this.rootIssueStore.projectId;
    if (!projectId) return undefined;

    return this.getAppliedFilters(projectId);
  }

  getIssueFilters(projectId: string) {
    const displayFilters = this.filters[projectId] || undefined;
    if (isEmpty(displayFilters)) return undefined;

    return this.computedIssueFilters(displayFilters);
  }

  getAppliedFilters(projectId: string) {
    const userFilters = this.getIssueFilters(projectId);
    if (!userFilters) return undefined;

    const filteredParams = handleIssueQueryParamsByLayout(userFilters?.displayFilters?.layout, "issues");
    if (!filteredParams) return undefined;

    // 扩展 state_id：状态与工作项类型绑定后，同名状态在不同类型中有不同 ID。
    // 在生成 API 参数前将单个 state_id 扩展为所有同名状态的 IDs，确保结果完整。
    const stateNameToIdsMap = this.rootIssueStore.rootStore.state.getProjectStateNameToIdsMap(projectId);
    const expandedRichFilters = expandStateIdsInExpression(userFilters.richFilters, stateNameToIdsMap);

    const filteredRouteParams: Partial<Record<TIssueParams, string | boolean>> = this.computedFilteredParams(
      expandedRichFilters,
      userFilters?.displayFilters,
      filteredParams
    );

    return filteredRouteParams;
  }

  getFilterParams = computedFn(
    (
      options: IssuePaginationOptions,
      projectId: string,
      cursor: string | undefined,
      groupId: string | undefined,
      subGroupId: string | undefined
    ) => {
      const filterParams = this.getAppliedFilters(projectId);
      const paginationParams = this.getPaginationParams(filterParams, options, cursor, groupId, subGroupId);
      return paginationParams;
    }
  );

  fetchFilters = async (workspaceSlug: string, projectId: string) => {
    const _filters = await this.projectService.getProjectUserProperties(workspaceSlug, projectId);

    const richFilters = _filters?.rich_filters;
    const displayFilters = this.computedDisplayFilters(_filters?.display_filters);
    const displayProperties = this.computedDisplayProperties(_filters?.display_properties);

    // fetching the kanban toggle helpers in the local storage
    const kanbanFilters = {
      group_by: [],
      sub_group_by: [],
    };
    const currentUserId = this.rootIssueStore.currentUserId;
    if (currentUserId) {
      const _kanbanFilters = this.handleIssuesLocalFilters.get(
        EIssuesStoreType.PROJECT,
        workspaceSlug,
        projectId,
        currentUserId
      );
      kanbanFilters.group_by = _kanbanFilters?.kanban_filters?.group_by || [];
      kanbanFilters.sub_group_by = _kanbanFilters?.kanban_filters?.sub_group_by || [];
    }

    runInAction(() => {
      set(this.filters, [projectId, "richFilters"], richFilters);
      set(this.filters, [projectId, "displayFilters"], displayFilters);
      set(this.filters, [projectId, "displayProperties"], displayProperties);
      set(this.filters, [projectId, "kanbanFilters"], kanbanFilters);
    });
  };

  /**
   * NOTE: This method is designed as a fallback function for the work item filter store.
   * Only use this method directly when initializing filter instances.
   * For regular filter updates, use this method as a fallback function for the work item filter store methods instead.
   */
  updateFilterExpression: IProjectIssuesFilter["updateFilterExpression"] = async (
    workspaceSlug,
    projectId,
    filters
  ) => {
    try {
      runInAction(() => {
        set(this.filters, [projectId, "richFilters"], filters);
      });

      this.rootIssueStore.projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
      await this.projectService.updateProjectUserProperties(workspaceSlug, projectId, {
        rich_filters: filters,
      });
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: IProjectIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters) => {
    try {
      if (isEmpty(this.filters) || isEmpty(this.filters[projectId])) return;

      const _filters = {
        richFilters: this.filters[projectId].richFilters,
        displayFilters: this.filters[projectId].displayFilters as IIssueDisplayFilterOptions,
        displayProperties: this.filters[projectId].displayProperties as IIssueDisplayProperties,
        kanbanFilters: this.filters[projectId].kanbanFilters as TIssueKanbanFilters,
      };

      switch (type) {
        case EIssueFilterType.DISPLAY_FILTERS: {
          const updatedDisplayFilters = filters as IIssueDisplayFilterOptions;
          _filters.displayFilters = { ..._filters.displayFilters, ...updatedDisplayFilters };

          // set sub_group_by to null if group_by is set to null
          if (_filters.displayFilters.group_by === null) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          // set sub_group_by to null if layout is switched to kanban group_by and sub_group_by are same
          if (
            _filters.displayFilters.layout === "kanban" &&
            _filters.displayFilters.group_by === _filters.displayFilters.sub_group_by
          ) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          // set group_by to state_detail.group if layout is switched to kanban and group_by is null
          if (_filters.displayFilters.layout === "kanban" && _filters.displayFilters.group_by === null) {
            _filters.displayFilters.group_by = "state_detail.group";
            updatedDisplayFilters.group_by = "state_detail.group";
          }
          runInAction(() => {
            Object.keys(updatedDisplayFilters).forEach((_key) => {
              set(
                this.filters,
                [projectId, "displayFilters", _key],
                updatedDisplayFilters[_key as keyof IIssueDisplayFilterOptions]
              );
            });
          });

          if (this.getShouldClearIssues(updatedDisplayFilters)) {
            this.rootIssueStore.projectIssues.clear(true); // clear issues for local store when some filters like layout changes
          }

          if (this.getShouldReFetchIssues(updatedDisplayFilters)) {
            this.rootIssueStore.projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
          }

          await this.projectService.updateProjectUserProperties(workspaceSlug, projectId, {
            display_filters: _filters.displayFilters,
          });

          break;
        }
        case EIssueFilterType.DISPLAY_PROPERTIES: {
          const updatedDisplayProperties = filters as IIssueDisplayProperties;
          _filters.displayProperties = { ..._filters.displayProperties, ...updatedDisplayProperties };

          runInAction(() => {
            Object.keys(updatedDisplayProperties).forEach((_key) => {
              set(
                this.filters,
                [projectId, "displayProperties", _key],
                updatedDisplayProperties[_key as keyof IIssueDisplayProperties]
              );
            });
          });

          await this.projectService.updateProjectUserProperties(workspaceSlug, projectId, {
            display_properties: _filters.displayProperties,
          });
          break;
        }

        case EIssueFilterType.KANBAN_FILTERS: {
          const updatedKanbanFilters = filters as TIssueKanbanFilters;
          _filters.kanbanFilters = { ..._filters.kanbanFilters, ...updatedKanbanFilters };

          const currentUserId = this.rootIssueStore.currentUserId;
          if (currentUserId)
            this.handleIssuesLocalFilters.set(EIssuesStoreType.PROJECT, type, workspaceSlug, projectId, currentUserId, {
              kanban_filters: _filters.kanbanFilters,
            });

          runInAction(() => {
            Object.keys(updatedKanbanFilters).forEach((_key) => {
              set(
                this.filters,
                [projectId, "kanbanFilters", _key],
                updatedKanbanFilters[_key as keyof TIssueKanbanFilters]
              );
            });
          });

          break;
        }
        default:
          break;
      }
    } catch (error) {
      this.fetchFilters(workspaceSlug, projectId);
      throw error;
    }
  };

  applyLocalRichFilters: IProjectIssuesFilter["applyLocalRichFilters"] = (workspaceSlug, projectId, richFilters) => {
    runInAction(() => {
      set(this.filters, [projectId, "richFilters"], richFilters);
    });
    this.rootIssueStore.projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
  };

  restoreLocalRichFilters: IProjectIssuesFilter["restoreLocalRichFilters"] = (projectId, richFilters) => {
    runInAction(() => {
      set(this.filters, [projectId, "richFilters"], richFilters);
    });
  };

  applyLocalDisplayFilters: IProjectIssuesFilter["applyLocalDisplayFilters"] = (
    workspaceSlug,
    projectId,
    displayFilters
  ) => {
    const current = this.filters[projectId]?.displayFilters;
    if (!current) return;
    runInAction(() => {
      set(this.filters, [projectId, "displayFilters"], { ...current, ...displayFilters });
    });
    if (this.getShouldClearIssues(displayFilters as IIssueDisplayFilterOptions)) {
      this.rootIssueStore.projectIssues.clear(true);
    }
    this.rootIssueStore.projectIssues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation");
  };

  restoreLocalDisplayFilters: IProjectIssuesFilter["restoreLocalDisplayFilters"] = (projectId, displayFilters) => {
    const current = this.filters[projectId]?.displayFilters;
    if (!current) return;
    runInAction(() => {
      set(this.filters, [projectId, "displayFilters"], { ...current, ...displayFilters });
    });
  };
}
