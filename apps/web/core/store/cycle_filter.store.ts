/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction, reaction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { FilterInstance } from "@plane/shared-state";
import type { IFilterInstance } from "@plane/shared-state";
// types
import type { TCycleDisplayFilters, TCycleFilters, TCycleFiltersByState } from "@plane/types";
// components
import { cycleFiltersAdapter } from "@/components/cycles/filters/adapter";
import type { TCycleFilterExpression, TCycleFilterProperty } from "@/components/cycles/filters/types";
// hooks
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
// store
import type { CoreRootStore } from "./root.store";

export type TCycleRichFilter = IFilterInstance<TCycleFilterProperty, TCycleFilterExpression>;

const getRichFilterStorageKey = (projectId: string) => `cycles-filter:v1:${projectId}`;

export interface ICycleFilterStore {
  // observables
  displayFilters: Record<string, TCycleDisplayFilters>;
  filters: Record<string, TCycleFiltersByState>;
  richFilters: Map<string, TCycleRichFilter>;
  searchQuery: string;
  archivedCyclesSearchQuery: string;
  // computed
  currentProjectDisplayFilters: TCycleDisplayFilters | undefined;
  currentProjectFilters: TCycleFilters | undefined;
  currentProjectArchivedFilters: TCycleFilters | undefined;
  // computed functions
  getDisplayFiltersByProjectId: (projectId: string) => TCycleDisplayFilters | undefined;
  getFiltersByProjectId: (projectId: string) => TCycleFilters | undefined;
  getArchivedFiltersByProjectId: (projectId: string) => TCycleFilters | undefined;
  getRichFilter: (projectId: string) => TCycleRichFilter | undefined;
  // actions
  getOrCreateRichFilter: (projectId: string) => TCycleRichFilter;
  updateDisplayFilters: (projectId: string, displayFilters: TCycleDisplayFilters) => void;
  updateFilters: (projectId: string, filters: TCycleFilters, state?: keyof TCycleFiltersByState) => void;
  updateSearchQuery: (query: string) => void;
  updateArchivedCyclesSearchQuery: (query: string) => void;
  clearAllFilters: (projectId: string, state?: keyof TCycleFiltersByState) => void;
}

export class CycleFilterStore implements ICycleFilterStore {
  // observables
  displayFilters: Record<string, TCycleDisplayFilters> = {};
  filters: Record<string, TCycleFiltersByState> = {};
  /** 迭代列表页（非归档）的富筛选实例，按项目一份；归档页仍走 `filters[projectId].archived` */
  richFilters: Map<string, TCycleRichFilter> = new Map();
  searchQuery: string = "";
  archivedCyclesSearchQuery: string = "";
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      displayFilters: observable,
      filters: observable,
      richFilters: observable,
      searchQuery: observable.ref,
      archivedCyclesSearchQuery: observable.ref,
      // computed
      currentProjectDisplayFilters: computed,
      currentProjectFilters: computed,
      currentProjectArchivedFilters: computed,
      // actions
      getOrCreateRichFilter: action,
      updateDisplayFilters: action,
      updateFilters: action,
      updateSearchQuery: action,
      updateArchivedCyclesSearchQuery: action,
      clearAllFilters: action,
    });
    // root store
    this.rootStore = _rootStore;
    // initialize display filters of the current project
    reaction(
      () => this.rootStore.router.projectId,
      (projectId) => {
        if (!projectId) return;
        this.initProjectCycleFilters(projectId);
        this.searchQuery = "";
      }
    );
  }

  /**
   * @description get display filters of the current project
   */
  get currentProjectDisplayFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.displayFilters[projectId];
  }

  /**
   * @description get filters of the current project
   */
  get currentProjectFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.filters[projectId]?.default ?? {};
  }

  /**
   * @description get archived filters of the current project
   */
  get currentProjectArchivedFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.filters[projectId].archived;
  }

  /**
   * @description get display filters of a project by projectId
   * @param {string} projectId
   */
  getDisplayFiltersByProjectId = computedFn((projectId: string) => this.displayFilters[projectId]);

  /**
   * @description get filters of a project by projectId
   * @param {string} projectId
   */
  getFiltersByProjectId = computedFn((projectId: string) => this.filters[projectId]?.default ?? {});

  /**
   * @description get archived filters of a project by projectId
   * @param {string} projectId
   */
  getArchivedFiltersByProjectId = computedFn((projectId: string) => this.filters[projectId].archived);

  /**
   * @description 项目的富筛选实例；没建过时返回 undefined（列表页挂载时才会建）
   */
  getRichFilter = computedFn((projectId: string) => this.richFilters.get(projectId));

  /**
   * @description 建（或取）项目的富筛选实例。条件记在本地，下次进来还是上次的筛选
   */
  getOrCreateRichFilter = (projectId: string) => {
    const existing = this.richFilters.get(projectId);
    if (existing) return existing;
    const storageKey = getRichFilterStorageKey(projectId);
    const filter = new FilterInstance<TCycleFilterProperty, TCycleFilterExpression>({
      adapter: cycleFiltersAdapter,
      initialExpression: getValueFromLocalStorage(storageKey, {}) as TCycleFilterExpression,
      onExpressionChange: (expression) => setValueIntoLocalStorage(storageKey, expression),
    });
    runInAction(() => {
      this.richFilters.set(projectId, filter);
    });
    return filter;
  };

  /**
   * @description initialize display filters and filters of a project
   * @param {string} projectId
   */
  initProjectCycleFilters = (projectId: string) => {
    const displayFilters = this.getDisplayFiltersByProjectId(projectId);
    runInAction(() => {
      this.displayFilters[projectId] = {
        active_tab: displayFilters?.active_tab || "active",
        layout: displayFilters?.layout || "list",
        group_by:
          displayFilters?.group_by === "owned_by" ||
          displayFilters?.group_by === "release" ||
          displayFilters?.group_by === "none"
            ? displayFilters.group_by
            : "state",
        order_by: displayFilters?.order_by ?? "manual",
        display_properties: {
          status: true,
          issue_count: true,
          start_date: true,
          end_date: true,
          test_handoff_date: true,
          stage: true,
          created_by: true,
          members: true,
          ...(displayFilters?.display_properties ?? {}),
        },
      };
      this.filters[projectId] = this.filters[projectId] ?? {
        default: {},
        archived: {},
      };
    });
  };

  /**
   * @description update display filters of a project
   * @param {string} projectId
   * @param {TCycleDisplayFilters} displayFilters
   */
  updateDisplayFilters = (projectId: string, displayFilters: TCycleDisplayFilters) => {
    runInAction(() => {
      Object.keys(displayFilters).forEach((key) => {
        const typedKey = key as keyof TCycleDisplayFilters;
        if (typedKey === "display_properties" && displayFilters.display_properties) {
          const current = this.displayFilters[projectId]?.display_properties ?? {};
          set(this.displayFilters, [projectId, typedKey], {
            ...current,
            ...displayFilters.display_properties,
          });
        } else {
          set(this.displayFilters, [projectId, typedKey], displayFilters[typedKey]);
        }
      });
    });
  };

  /**
   * @description update filters of a project
   * @param {string} projectId
   * @param {TCycleFilters} filters
   */
  updateFilters = (projectId: string, filters: TCycleFilters, state: keyof TCycleFiltersByState = "default") => {
    runInAction(() => {
      Object.keys(filters).forEach((key) => {
        set(this.filters, [projectId, state, key], filters[key as keyof TCycleFilters]);
      });
    });
  };

  /**
   * @description update search query
   * @param {string} query
   */
  updateSearchQuery = (query: string) => (this.searchQuery = query);

  /**
   * @description update archived search query
   * @param {string} query
   */
  updateArchivedCyclesSearchQuery = (query: string) => (this.archivedCyclesSearchQuery = query);

  /**
   * @description clear all filters of a project
   * @param {string} projectId
   */
  clearAllFilters = (projectId: string, state: keyof TCycleFiltersByState = "default") => {
    runInAction(() => {
      this.filters[projectId][state] = {};
    });
  };
}
