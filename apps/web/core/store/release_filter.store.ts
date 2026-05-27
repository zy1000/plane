/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction, reaction } from "mobx";
import { computedFn } from "mobx-utils";
import type {
  TModuleDisplayFilters,
  TModuleFilters,
  TModuleFiltersByState,
  TReleaseDisplayFilters,
} from "@plane/types";
import { storage } from "@/lib/local-storage";
import type { CoreRootStore } from "./root.store";

const RELEASE_DISPLAY_FILTERS_KEY = "release_display_filters";
const RELEASE_FILTERS_KEY = "release_filters";

export interface IReleaseFilterStore {
  displayFilters: Record<string, TReleaseDisplayFilters>;
  filters: Record<string, TModuleFiltersByState>;
  searchQuery: string;
  archivedModulesSearchQuery: string;
  currentProjectDisplayFilters: TReleaseDisplayFilters | undefined;
  currentProjectFilters: TModuleFilters | undefined;
  currentProjectArchivedFilters: TModuleFilters | undefined;
  getDisplayFiltersByProjectId: (projectId: string) => TReleaseDisplayFilters | undefined;
  getFiltersByProjectId: (projectId: string) => TModuleFilters | undefined;
  getArchivedFiltersByProjectId: (projectId: string) => TModuleFilters | undefined;
  updateDisplayFilters: (projectId: string, displayFilters: TReleaseDisplayFilters) => void;
  updateFilters: (projectId: string, filters: TModuleFilters, state?: keyof TModuleFiltersByState) => void;
  updateSearchQuery: (query: string) => void;
  updateArchivedModulesSearchQuery: (query: string) => void;
  clearAllFilters: (projectId: string, state?: keyof TModuleFiltersByState) => void;
}

const DEFAULT_RELEASE_DISPLAY_PROPERTIES = {
  status: true,
  issue_count: true,
  start_date: true,
  end_date: true,
  test_handoff_date: true,
  created_by: true,
  members: true,
};

export class ReleaseFilterStore implements IReleaseFilterStore {
  displayFilters: Record<string, TReleaseDisplayFilters> = {};
  filters: Record<string, TModuleFiltersByState> = {};
  searchQuery: string = "";
  archivedModulesSearchQuery: string = "";
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      displayFilters: observable,
      filters: observable,
      searchQuery: observable.ref,
      archivedModulesSearchQuery: observable.ref,
      currentProjectDisplayFilters: computed,
      currentProjectFilters: computed,
      currentProjectArchivedFilters: computed,
      updateDisplayFilters: action,
      updateFilters: action,
      updateSearchQuery: action,
      updateArchivedModulesSearchQuery: action,
      clearAllFilters: action,
    });
    this.rootStore = _rootStore;

    reaction(
      () => this.rootStore.router.projectId,
      (projectId) => {
        if (!projectId) return;
        this.initProjectReleaseFilters(projectId);
        this.searchQuery = "";
      }
    );

    this.loadFromLocalStorage();
  }

  loadFromLocalStorage = () => {
    try {
      const displayFiltersData = storage.get(RELEASE_DISPLAY_FILTERS_KEY);
      const filtersData = storage.get(RELEASE_FILTERS_KEY);

      runInAction(() => {
        if (displayFiltersData) {
          const parsed = JSON.parse(displayFiltersData);
          if (typeof parsed === "object" && parsed !== null) {
            this.displayFilters = parsed;
          }
        }
        if (filtersData) {
          const parsed = JSON.parse(filtersData);
          if (typeof parsed === "object" && parsed !== null) {
            this.filters = parsed;
          }
        }
      });
    } catch (error) {
      console.error("Failed to load release filters from localStorage:", error);
      runInAction(() => {
        this.displayFilters = {};
        this.filters = {};
      });
    }
  };

  saveDisplayFiltersToLocalStorage = () => {
    storage.set(RELEASE_DISPLAY_FILTERS_KEY, this.displayFilters);
  };

  saveFiltersToLocalStorage = () => {
    storage.set(RELEASE_FILTERS_KEY, this.filters);
  };

  get currentProjectDisplayFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.displayFilters[projectId];
  }

  get currentProjectFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.filters[projectId]?.default ?? {};
  }

  get currentProjectArchivedFilters() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId) return;
    return this.filters[projectId].archived;
  }

  getDisplayFiltersByProjectId = computedFn((projectId: string) => this.displayFilters[projectId]);

  getFiltersByProjectId = computedFn((projectId: string) => this.filters[projectId]?.default ?? {});

  getArchivedFiltersByProjectId = computedFn((projectId: string) => this.filters[projectId].archived);

  initProjectReleaseFilters = (projectId: string) => {
    const displayFilters = this.getDisplayFiltersByProjectId(projectId);
    runInAction(() => {
      this.displayFilters[projectId] = {
        favorites: displayFilters?.favorites || false,
        layout: displayFilters?.layout || "list",
        order_by: displayFilters?.order_by || "name",
        group_by: displayFilters?.group_by || "status",
        display_properties: {
          ...DEFAULT_RELEASE_DISPLAY_PROPERTIES,
          ...(displayFilters?.display_properties ?? {}),
        },
      };
      this.filters[projectId] = this.filters[projectId] ?? {
        default: {},
        archived: {},
      };
    });
    this.saveDisplayFiltersToLocalStorage();
    this.saveFiltersToLocalStorage();
  };

  updateDisplayFilters = (projectId: string, displayFilters: TReleaseDisplayFilters) => {
    runInAction(() => {
      Object.keys(displayFilters).forEach((key) => {
        const filterKey = key as keyof TReleaseDisplayFilters;
        if (filterKey === "display_properties") {
          const prevDisplayProperties = this.displayFilters[projectId]?.display_properties ?? {};
          set(this.displayFilters, [projectId, filterKey], {
            ...prevDisplayProperties,
            ...(displayFilters.display_properties ?? {}),
          });
        } else {
          set(this.displayFilters, [projectId, filterKey], displayFilters[filterKey]);
        }
      });
    });
    this.saveDisplayFiltersToLocalStorage();
  };

  updateFilters = (projectId: string, filters: TModuleFilters, state: keyof TModuleFiltersByState = "default") => {
    runInAction(() => {
      Object.keys(filters).forEach((key) => {
        set(this.filters, [projectId, state, key], filters[key as keyof TModuleFilters]);
      });
    });
    this.saveFiltersToLocalStorage();
  };

  updateSearchQuery = (query: string) => {
    this.searchQuery = query;
  };

  updateArchivedModulesSearchQuery = (query: string) => {
    this.archivedModulesSearchQuery = query;
  };

  clearAllFilters = (projectId: string, state: keyof TModuleFiltersByState = "default") => {
    runInAction(() => {
      this.filters[projectId][state] = {};
      this.displayFilters[projectId].favorites = false;
    });
    this.saveFiltersToLocalStorage();
    this.saveDisplayFiltersToLocalStorage();
  };
}
