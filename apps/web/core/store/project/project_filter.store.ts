/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction, reaction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import { DEFAULT_PROJECT_DISPLAY_PROPERTIES } from "@plane/constants";
import { FilterInstance } from "@plane/shared-state";
import type { IFilterInstance } from "@plane/shared-state";
import type { TProjectDisplayFilters, TProjectDisplayProperties, TProjectFilterProperty } from "@plane/types";
// components
import { projectFiltersAdapter } from "@/components/project/filters/adapter";
import type { TProjectFilterExpression } from "@/components/project/filters/types";
// hooks
import { getValueFromLocalStorage, setValueIntoLocalStorage } from "@/hooks/use-local-storage";
// store
import type { CoreRootStore } from "../root.store";

export type TProjectViewMode = "card" | "list";

export type TProjectRichFilter = IFilterInstance<TProjectFilterProperty, TProjectFilterExpression>;

const PROJECTS_VIEW_MODE_STORAGE_KEY = "plane_projects_view_mode_v2";
/**
 * 显示设置（排序 / 列 / 范围）按工作区记在本地；改默认列时升版本号，否则旧值会把新默认顶掉。
 * v2：研发模式列默认打开。
 */
const getDisplayStorageKey = (workspaceSlug: string) => `projects-display:v2:${workspaceSlug}`;
const getFilterStorageKey = (workspaceSlug: string) => `projects-filter:v1:${workspaceSlug}`;

/** 落本地的那部分显示设置；`archived_projects` 由路由决定，不存 */
type TStoredDisplayFilters = Pick<
  TProjectDisplayFilters,
  "order_by" | "display_properties" | "my_projects" | "show_archived_projects" | "quick_scope"
>;

export interface IProjectFilterStore {
  // observables
  displayFilters: Record<string, TProjectDisplayFilters>;
  richFilters: Map<string, TProjectRichFilter>;
  /** 工作区 → 项目状态字典里终态（已完成 / 已取消）的值 id；快捷页签「未完成 / 已逾期」靠它判断 */
  closedStatusIds: Record<string, string[]>;
  searchQuery: string;
  viewMode: TProjectViewMode;
  // computed
  currentWorkspaceDisplayFilters: TProjectDisplayFilters | undefined;
  currentWorkspaceDisplayProperties: TProjectDisplayProperties;
  // computed functions
  getDisplayFiltersByWorkspaceSlug: (workspaceSlug: string) => TProjectDisplayFilters | undefined;
  getRichFilter: (workspaceSlug: string) => TProjectRichFilter | undefined;
  // actions
  getOrCreateRichFilter: (workspaceSlug: string) => TProjectRichFilter;
  updateDisplayFilters: (workspaceSlug: string, displayFilters: TProjectDisplayFilters) => void;
  updateDisplayProperties: (workspaceSlug: string, properties: Partial<TProjectDisplayProperties>) => void;
  setClosedStatusIds: (workspaceSlug: string, statusIds: string[]) => void;
  updateSearchQuery: (query: string) => void;
  updateViewMode: (mode: TProjectViewMode) => void;
}

export class ProjectFilterStore implements IProjectFilterStore {
  // observables
  displayFilters: Record<string, TProjectDisplayFilters> = {};
  richFilters: Map<string, TProjectRichFilter> = new Map();
  closedStatusIds: Record<string, string[]> = {};
  searchQuery: string = "";
  viewMode: TProjectViewMode = "list";
  // root store
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      displayFilters: observable,
      richFilters: observable,
      closedStatusIds: observable,
      searchQuery: observable.ref,
      viewMode: observable.ref,
      // computed
      currentWorkspaceDisplayFilters: computed,
      currentWorkspaceDisplayProperties: computed,
      // actions
      getOrCreateRichFilter: action,
      updateDisplayFilters: action,
      updateDisplayProperties: action,
      setClosedStatusIds: action,
      updateSearchQuery: action,
      updateViewMode: action,
    });
    // root store
    this.rootStore = _rootStore;

    if (typeof window !== "undefined") {
      const storedViewMode = window.localStorage.getItem(PROJECTS_VIEW_MODE_STORAGE_KEY);
      if (storedViewMode === "card" || storedViewMode === "list") this.viewMode = storedViewMode;
    }

    // initialize display filters of the current workspace
    reaction(
      () => this.rootStore.router.workspaceSlug,
      (workspaceSlug) => {
        if (!workspaceSlug) return;
        this.initWorkspaceFilters(workspaceSlug);
        this.searchQuery = "";
      }
    );

    reaction(
      () => this.viewMode,
      (mode) => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(PROJECTS_VIEW_MODE_STORAGE_KEY, mode);
      }
    );
  }

  /**
   * @description get display filters of the current workspace
   */
  get currentWorkspaceDisplayFilters() {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    if (!workspaceSlug) return;
    return this.displayFilters[workspaceSlug];
  }

  /**
   * @description 当前工作区表格要显示的列（默认值与用户选择合并，新加的列按默认值显示）
   */
  get currentWorkspaceDisplayProperties(): TProjectDisplayProperties {
    return { ...DEFAULT_PROJECT_DISPLAY_PROPERTIES, ...this.currentWorkspaceDisplayFilters?.display_properties };
  }

  /**
   * @description get display filters of a workspace by workspaceSlug
   * @param {string} workspaceSlug
   */
  getDisplayFiltersByWorkspaceSlug = computedFn((workspaceSlug: string) => this.displayFilters[workspaceSlug]);

  /**
   * @description 工作区的富筛选实例；没建过时返回 undefined（列表页挂载时才会建）
   */
  getRichFilter = computedFn((workspaceSlug: string) => this.richFilters.get(workspaceSlug));

  /**
   * @description initialize display filters of a workspace
   * @param {string} workspaceSlug
   */
  initWorkspaceFilters = (workspaceSlug: string) => {
    const displayFilters = this.getDisplayFiltersByWorkspaceSlug(workspaceSlug);
    const stored = getValueFromLocalStorage(getDisplayStorageKey(workspaceSlug), {}) as TStoredDisplayFilters;
    runInAction(() => {
      this.displayFilters[workspaceSlug] = {
        ...stored,
        ...displayFilters,
        order_by: displayFilters?.order_by || stored.order_by || "-created_at",
        quick_scope: displayFilters?.quick_scope ?? stored.quick_scope ?? "all",
      };
    });
  };

  /**
   * @description 建（或取）工作区的富筛选实例。条件记在本地，下次进来还是上次的筛选
   */
  getOrCreateRichFilter = (workspaceSlug: string) => {
    const existing = this.richFilters.get(workspaceSlug);
    if (existing) return existing;
    const storageKey = getFilterStorageKey(workspaceSlug);
    const filter = new FilterInstance<TProjectFilterProperty, TProjectFilterExpression>({
      adapter: projectFiltersAdapter,
      initialExpression: getValueFromLocalStorage(storageKey, {}) as TProjectFilterExpression,
      onExpressionChange: (expression) => setValueIntoLocalStorage(storageKey, expression),
    });
    runInAction(() => {
      this.richFilters.set(workspaceSlug, filter);
    });
    return filter;
  };

  /**
   * @description update display filters of a workspace
   * @param {string} workspaceSlug
   * @param {TProjectDisplayFilters} displayFilters
   */
  updateDisplayFilters = (workspaceSlug: string, displayFilters: TProjectDisplayFilters) => {
    runInAction(() => {
      Object.keys(displayFilters).forEach((key) => {
        set(this.displayFilters, [workspaceSlug, key], displayFilters[key as keyof TProjectDisplayFilters]);
      });
    });
    this.persistDisplayFilters(workspaceSlug);
  };

  /**
   * @description 开关表格列
   */
  updateDisplayProperties = (workspaceSlug: string, properties: Partial<TProjectDisplayProperties>) => {
    const current = this.displayFilters[workspaceSlug]?.display_properties ?? {};
    this.updateDisplayFilters(workspaceSlug, { display_properties: { ...current, ...properties } });
  };

  /**
   * @description 列表页从字典推出终态值 id 后登记进来；内容没变就不动，免得触发整表重算
   */
  setClosedStatusIds = (workspaceSlug: string, statusIds: string[]) => {
    const current = this.closedStatusIds[workspaceSlug];
    if (current && current.length === statusIds.length && current.every((id, index) => id === statusIds[index])) return;
    set(this.closedStatusIds, [workspaceSlug], statusIds);
  };

  /**
   * @description update search query
   * @param {string} query
   */
  updateSearchQuery = (query: string) => (this.searchQuery = query);

  updateViewMode = (mode: TProjectViewMode) => (this.viewMode = mode);

  private persistDisplayFilters = (workspaceSlug: string) => {
    const current = this.displayFilters[workspaceSlug];
    if (!current) return;
    const stored: TStoredDisplayFilters = {
      order_by: current.order_by,
      display_properties: current.display_properties,
      my_projects: current.my_projects,
      show_archived_projects: current.show_archived_projects,
      quick_scope: current.quick_scope,
    };
    setValueIntoLocalStorage(getDisplayStorageKey(workspaceSlug), stored);
  };
}
