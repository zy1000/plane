/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { observable, action, makeObservable, runInAction, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IProjectView, TViewFilters, TViewScope } from "@plane/types";
// constants
// helpers
import { getValidatedViewFilters, getViewName, orderViews, shouldFilterView } from "@plane/utils";
// services
import { ViewService } from "@/services/view.service";
// store
import type { CoreRootStore } from "./root.store";

/** 没有 scope 的历史数据都是工作项视图 */
const getViewScope = (view: IProjectView): TViewScope => view.scope ?? "issues";
const getScopedKey = (projectId: string, scope: TViewScope) => `${projectId}__${scope}`;

export interface IProjectViewStore {
  //Loaders
  loader: boolean;
  fetchedMap: Record<string, boolean>;
  fetchedScopeMap: Record<string, boolean>;
  // observables
  viewMap: Record<string, IProjectView>;
  filters: TViewFilters;
  // computed
  projectViewIds: string[] | null;
  // computed actions
  getProjectViews: (projectId: string) => IProjectView[] | undefined;
  getFilteredProjectViews: (projectId: string) => IProjectView[] | undefined;
  getScopedProjectViews: (projectId: string, scope: TViewScope) => IProjectView[] | undefined;
  getViewById: (viewId: string) => IProjectView;
  // fetch actions
  fetchViews: (workspaceSlug: string, projectId: string, scope?: TViewScope) => Promise<undefined | IProjectView[]>;
  fetchViewDetails: (workspaceSlug: string, projectId: string, viewId: string) => Promise<IProjectView>;
  // CRUD actions
  createView: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectView> & { share_to_mode?: boolean }
  ) => Promise<IProjectView>;
  updateView: (
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<IProjectView>
  ) => Promise<IProjectView>;
  deleteView: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
  updateFilters: <T extends keyof TViewFilters>(filterKey: T, filterValue: TViewFilters[T]) => void;
  clearAllFilters: () => void;
  syncSchemeViews: (schemeId: string, views: IProjectView[]) => void;
  // favorites actions
  addViewToFavorites: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
  removeViewFromFavorites: (workspaceSlug: string, projectId: string, viewId: string) => Promise<any>;
}

export class ProjectViewStore implements IProjectViewStore {
  // observables
  loader: boolean = false;
  viewMap: Record<string, IProjectView> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  fetchedScopeMap: Record<string, boolean> = {};
  filters: TViewFilters = { searchQuery: "", sortBy: "desc", sortKey: "updated_at" };
  // root store
  rootStore;
  // services
  viewService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      viewMap: observable,
      fetchedMap: observable,
      fetchedScopeMap: observable,
      filters: observable,
      // computed
      projectViewIds: computed,
      // fetch actions
      fetchViews: action,
      fetchViewDetails: action,
      // CRUD actions
      createView: action,
      updateView: action,
      deleteView: action,
      // actions
      updateFilters: action,
      clearAllFilters: action,
      syncSchemeViews: action,
      // favorites actions
      addViewToFavorites: action,
      removeViewFromFavorites: action,
    });
    // root store
    this.rootStore = _rootStore;
    // services
    this.viewService = new ViewService();

    this.createView = this.createView.bind(this);
    this.updateView = this.updateView.bind(this);
  }

  /**
   * Returns array of view ids for current project
   */
  get projectViewIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    // 「视图」页签只列工作项视图；缺陷 / 需求页的视图只在各自页内页签里出现
    const viewIds = Object.keys(this.viewMap ?? {})?.filter((viewId) => {
      const view = this.viewMap?.[viewId];
      return view?.project === projectId && getViewScope(view) === "issues";
    });
    return viewIds;
  }

  getProjectViews = computedFn((projectId: string) => {
    if (!this.fetchedMap[projectId]) return undefined;

    const ViewsList = Object.values(this.viewMap ?? {});
    // helps to filter views based on the projectId
    let filteredViews = ViewsList.filter((view) => view?.project === projectId && getViewScope(view) === "issues");
    filteredViews = orderViews(filteredViews, this.filters.sortKey, this.filters.sortBy);

    return filteredViews ?? undefined;
  });

  /**
   * 页内视图页签用：某页面范围下的全部视图。所跟随研发模式的视图排在前面，各自按 sort_order 再按名称排
   */
  getScopedProjectViews = computedFn((projectId: string, scope: TViewScope) => {
    if (!this.fetchedScopeMap[getScopedKey(projectId, scope)]) return undefined;

    const project = this.rootStore.projectRoot.project.getProjectById(projectId);
    // 项目自定义后模式视图已经拷进项目，旧的那份不再算本项目的
    const modeSchemeId = project?.issue_scheme_detail?.is_project_owned === false ? project.issue_scheme : null;
    const isModeView = (view: IProjectView) => !!view.issue_scheme;
    return Object.values(this.viewMap ?? {})
      .filter(
        (view) =>
          getViewScope(view) === scope &&
          (view?.project === projectId || (!!modeSchemeId && !view.project && view.issue_scheme === modeSchemeId))
      )
      .sort(
        (a, b) =>
          Number(isModeView(b)) - Number(isModeView(a)) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name)
      );
  });
  /**
   * returns viewsIds of issues
   */
  getFilteredProjectViews = computedFn((projectId: string) => {
    if (!this.fetchedMap[projectId]) return undefined;

    const ViewsList = Object.values(this.viewMap ?? {});
    // helps to filter views based on the projectId, searchQuery and filters
    let filteredViews = ViewsList.filter(
      (view) =>
        view?.project === projectId &&
        getViewScope(view) === "issues" &&
        getViewName(view.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterView(view, this.filters.filters)
    );
    filteredViews = orderViews(filteredViews, this.filters.sortKey, this.filters.sortBy);

    return filteredViews ?? undefined;
  });

  /**
   * Returns view details by id
   */
  getViewById = computedFn((viewId: string) => this.viewMap?.[viewId] ?? null);

  /**
   * Updates the filter
   * @param filterKey
   * @param filterValue
   */
  updateFilters = <T extends keyof TViewFilters>(filterKey: T, filterValue: TViewFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  /**
   * @description clears all the filters
   */
  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * 模板中心拿到某个模式方案的研发模式视图后，同步到这里已缓存的那几条：
   * 删掉的移除、改名 / 排序 / 条件变了的跟着改，回到项目页不用整页刷新
   */
  syncSchemeViews = (schemeId: string, views: IProjectView[]) => {
    const latest = new Map(views.map((view) => [view.id, view]));
    runInAction(() => {
      Object.values(this.viewMap).forEach((view) => {
        if (view?.issue_scheme !== schemeId || view.project) return;
        const fresh = latest.get(view.id);
        if (fresh) set(this.viewMap, [view.id], { ...view, ...fresh });
        else delete this.viewMap[view.id];
      });
    });
  };

  /**
   * Fetches views for current project
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<IProjectView[]>
   */
  fetchViews = async (workspaceSlug: string, projectId: string, scope: TViewScope = "issues") => {
    try {
      this.loader = true;
      await this.viewService.getViews(workspaceSlug, projectId, scope).then((response) => {
        runInAction(() => {
          response.forEach((view) => {
            set(this.viewMap, [view.id], view);
          });
          if (scope === "issues") set(this.fetchedMap, projectId, true);
          set(this.fetchedScopeMap, getScopedKey(projectId, scope), true);
          this.loader = false;
        });
        return response;
      });
    } catch (_error) {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * Fetches view details for a specific view
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns Promise<IProjectView>
   */
  fetchViewDetails = async (workspaceSlug: string, projectId: string, viewId: string): Promise<IProjectView> =>
    await this.viewService.getViewDetails(workspaceSlug, projectId, viewId).then((response) => {
      runInAction(() => {
        set(this.viewMap, [viewId], response);
      });
      return response;
    });

  /**
   * Creates a new view for a specific project and adds it to the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns Promise<IProjectView>
   */
  async createView(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectView> & { share_to_mode?: boolean }
  ): Promise<IProjectView> {
    const response = await this.viewService.createView(workspaceSlug, projectId, getValidatedViewFilters(data));

    runInAction(() => {
      set(this.viewMap, [response.id], response);
    });

    return response;
  }

  /**
   * Updates a view details of specific view and updates it in the store
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @param data
   * @returns Promise<IProjectView>
   */
  async updateView(
    workspaceSlug: string,
    projectId: string,
    viewId: string,
    data: Partial<IProjectView>
  ): Promise<IProjectView> {
    const currentView = this.getViewById(viewId);

    runInAction(() => {
      set(this.viewMap, [viewId], { ...currentView, ...data });
    });

    try {
      const response = await this.viewService.patchView(workspaceSlug, projectId, viewId, data);
      return response;
    } catch (error) {
      runInAction(() => {
        if (currentView) set(this.viewMap, [viewId], currentView);
      });
      throw error;
    }
  }

  /**
   * Deletes a view and removes it from the viewMap object
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  deleteView = async (workspaceSlug: string, projectId: string, viewId: string): Promise<any> => {
    await this.viewService.deleteView(workspaceSlug, projectId, viewId).then(() => {
      runInAction(() => {
        delete this.viewMap[viewId];
        if (this.rootStore.favorite.entityMap[viewId]) this.rootStore.favorite.removeFavoriteFromStore(viewId);
      });
    });
  };

  /**
   * Adds a view to favorites
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  addViewToFavorites = async (workspaceSlug: string, projectId: string, viewId: string) => {
    try {
      const currentView = this.getViewById(viewId);
      if (currentView?.is_favorite) return;
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], true);
      });
      await this.rootStore.favorite.addFavorite(workspaceSlug.toString(), {
        entity_type: "view",
        entity_identifier: viewId,
        project_id: projectId,
        entity_data: { name: this.viewMap[viewId].name || "" },
      });
    } catch (error) {
      console.error("Failed to add view to favorites in view store", error);
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], false);
      });
    }
  };

  /**
   * Removes a view from favorites
   * @param workspaceSlug
   * @param projectId
   * @param viewId
   * @returns
   */
  removeViewFromFavorites = async (workspaceSlug: string, projectId: string, viewId: string) => {
    try {
      const currentView = this.getViewById(viewId);
      if (!currentView?.is_favorite) return;
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], false);
      });
      await this.rootStore.favorite.removeFavoriteEntity(workspaceSlug, viewId);
    } catch (error) {
      console.error("Failed to remove view from favorites in view store", error);
      runInAction(() => {
        set(this.viewMap, [viewId, "is_favorite"], true);
      });
    }
  };
}
