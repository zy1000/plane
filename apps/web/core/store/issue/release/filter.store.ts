/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty, set } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
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
  TSupportedFilterForUpdate,
} from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { handleIssueQueryParamsByLayout } from "@plane/utils";
import { IssueFiltersService } from "@/services/issue_filter.service";
import type { IBaseIssueFilterStore } from "../helpers/issue-filter-helper.store";
import { IssueFilterHelperStore } from "../helpers/issue-filter-helper.store";
import type { IIssueRootStore } from "../root.store";

export interface IReleaseIssuesFilter extends IBaseIssueFilterStore {
  getFilterParams: (
    options: IssuePaginationOptions,
    releaseId: string,
    cursor: string | undefined,
    groupId: string | undefined,
    subGroupId: string | undefined
  ) => Partial<Record<TIssueParams, string | boolean>>;
  getIssueFilters(releaseId: string): IIssueFilters | undefined;
  fetchFilters: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  updateFilterExpression: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    filters: TWorkItemFilterExpression
  ) => Promise<void>;
  updateFilters: (
    workspaceSlug: string,
    projectId: string,
    filterType: TSupportedFilterTypeForUpdate,
    filters: TSupportedFilterForUpdate,
    releaseId: string
  ) => Promise<void>;
}

export class ReleaseIssuesFilter extends IssueFilterHelperStore implements IReleaseIssuesFilter {
  filters: { [releaseId: string]: IIssueFilters } = {};
  rootIssueStore: IIssueRootStore;
  issueFilterService;

  constructor(_rootStore: IIssueRootStore) {
    super();
    makeObservable(this, {
      filters: observable,
      issueFilters: computed,
      appliedFilters: computed,
      fetchFilters: action,
      updateFilters: action,
    });
    this.rootIssueStore = _rootStore;
    this.issueFilterService = new IssueFiltersService();
  }

  get issueFilters() {
    const releaseId = this.rootIssueStore.releaseId;
    if (!releaseId) return undefined;
    return this.getIssueFilters(releaseId);
  }

  get appliedFilters() {
    const releaseId = this.rootIssueStore.releaseId;
    if (!releaseId) return undefined;
    return this.getAppliedFilters(releaseId);
  }

  getIssueFilters(releaseId: string) {
    const displayFilters = this.filters[releaseId] || undefined;
    if (isEmpty(displayFilters)) return undefined;
    return this.computedIssueFilters(displayFilters);
  }

  getAppliedFilters(releaseId: string) {
    const userFilters = this.getIssueFilters(releaseId);
    if (!userFilters) return undefined;

    const filteredParams = handleIssueQueryParamsByLayout(userFilters?.displayFilters?.layout, "issues");
    if (!filteredParams) return undefined;

    if (filteredParams.includes("module")) filteredParams.splice(filteredParams.indexOf("module"), 1);

    return this.computedFilteredParams(
      userFilters?.richFilters,
      userFilters?.displayFilters,
      filteredParams
    );
  }

  getFilterParams = computedFn(
    (
      options: IssuePaginationOptions,
      releaseId: string,
      cursor: string | undefined,
      groupId: string | undefined,
      subGroupId: string | undefined
    ) => {
      let filterParams = this.getAppliedFilters(releaseId);
      if (!filterParams) filterParams = {};
      const paginationParams = this.getPaginationParams(filterParams, options, cursor, groupId, subGroupId);
      return paginationParams;
    }
  );

  fetchFilters = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const _filters = await this.issueFilterService.fetchReleaseIssueFilters(workspaceSlug, projectId, releaseId);

    const richFilters: TWorkItemFilterExpression = _filters?.rich_filters;
    const displayFilters: IIssueDisplayFilterOptions = this.computedDisplayFilters(_filters?.display_filters);
    const displayProperties: IIssueDisplayProperties = this.computedDisplayProperties(_filters?.display_properties);

    const kanbanFilters = {
      group_by: [] as string[],
      sub_group_by: [] as string[],
    };
    const currentUserId = this.rootIssueStore.currentUserId;
    if (currentUserId) {
      const _kanbanFilters = this.handleIssuesLocalFilters.get(
        EIssuesStoreType.RELEASE,
        workspaceSlug,
        releaseId,
        currentUserId
      );
      kanbanFilters.group_by = _kanbanFilters?.kanban_filters?.group_by || [];
      kanbanFilters.sub_group_by = _kanbanFilters?.kanban_filters?.sub_group_by || [];
    }

    runInAction(() => {
      set(this.filters, [releaseId, "richFilters"], richFilters);
      set(this.filters, [releaseId, "displayFilters"], displayFilters);
      set(this.filters, [releaseId, "displayProperties"], displayProperties);
      set(this.filters, [releaseId, "kanbanFilters"], kanbanFilters);
    });
  };

  updateFilterExpression: IReleaseIssuesFilter["updateFilterExpression"] = async (
    workspaceSlug,
    projectId,
    releaseId,
    filters
  ) => {
    try {
      runInAction(() => {
        set(this.filters, [releaseId, "richFilters"], filters);
      });

      this.rootIssueStore.releaseIssues.fetchIssuesWithExistingPagination(
        workspaceSlug,
        projectId,
        "mutation",
        releaseId
      );
      await this.issueFilterService.patchReleaseIssueFilters(workspaceSlug, projectId, releaseId, {
        rich_filters: filters,
      });
    } catch (error) {
      console.log("error while updating rich filters", error);
      throw error;
    }
  };

  updateFilters: IReleaseIssuesFilter["updateFilters"] = async (workspaceSlug, projectId, type, filters, releaseId) => {
    try {
      if (isEmpty(this.filters) || isEmpty(this.filters[releaseId])) return;

      const _filters = {
        richFilters: this.filters[releaseId].richFilters,
        displayFilters: this.filters[releaseId].displayFilters as IIssueDisplayFilterOptions,
        displayProperties: this.filters[releaseId].displayProperties as IIssueDisplayProperties,
        kanbanFilters: this.filters[releaseId].kanbanFilters as TIssueKanbanFilters,
      };

      switch (type) {
        case EIssueFilterType.DISPLAY_FILTERS: {
          const updatedDisplayFilters = filters as IIssueDisplayFilterOptions;
          _filters.displayFilters = { ..._filters.displayFilters, ...updatedDisplayFilters };

          if (_filters.displayFilters.group_by === null) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          if (
            _filters.displayFilters.layout === "kanban" &&
            _filters.displayFilters.group_by === _filters.displayFilters.sub_group_by
          ) {
            _filters.displayFilters.sub_group_by = null;
            updatedDisplayFilters.sub_group_by = null;
          }
          if (_filters.displayFilters.layout === "kanban" && _filters.displayFilters.group_by === null) {
            _filters.displayFilters.group_by = "state_detail.group";
            updatedDisplayFilters.group_by = "state_detail.group";
          }
          runInAction(() => {
            Object.keys(updatedDisplayFilters).forEach((_key) => {
              set(
                this.filters,
                [releaseId, "displayFilters", _key],
                updatedDisplayFilters[_key as keyof IIssueDisplayFilterOptions]
              );
            });
          });

          if (this.getShouldClearIssues(updatedDisplayFilters)) {
            this.rootIssueStore.releaseIssues.clear(true);
          }

          if (this.getShouldReFetchIssues(updatedDisplayFilters)) {
            this.rootIssueStore.releaseIssues.fetchIssuesWithExistingPagination(
              workspaceSlug,
              projectId,
              "mutation",
              releaseId
            );
          }

          await this.issueFilterService.patchReleaseIssueFilters(workspaceSlug, projectId, releaseId, {
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
                [releaseId, "displayProperties", _key],
                updatedDisplayProperties[_key as keyof IIssueDisplayProperties]
              );
            });
          });

          await this.issueFilterService.patchReleaseIssueFilters(workspaceSlug, projectId, releaseId, {
            display_properties: _filters.displayProperties,
          });
          break;
        }

        case EIssueFilterType.KANBAN_FILTERS: {
          const updatedKanbanFilters = filters as TIssueKanbanFilters;
          _filters.kanbanFilters = { ..._filters.kanbanFilters, ...updatedKanbanFilters };

          const currentUserId = this.rootIssueStore.currentUserId;
          if (currentUserId)
            this.handleIssuesLocalFilters.set(EIssuesStoreType.RELEASE, type, workspaceSlug, releaseId, currentUserId, {
              kanban_filters: _filters.kanbanFilters,
            });

          runInAction(() => {
            Object.keys(updatedKanbanFilters).forEach((_key) => {
              set(
                this.filters,
                [releaseId, "kanbanFilters", _key],
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
      if (releaseId) this.fetchFilters(workspaceSlug, projectId, releaseId);
      throw error;
    }
  };
}
