/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { update, concat, set, sortBy } from "lodash-es";
import { action, computed, observable, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type { IRelease, ILinkDetails, TReleasePlotType } from "@plane/types";
import type { DistributionUpdates } from "@plane/utils";
import { updateDistribution, orderModules, shouldFilterModule } from "@plane/utils";
// helpers
// services
import { ReleaseService } from "@/services/release.service";
import { ProjectService } from "@/services/project";
// store
import type { CoreRootStore } from "./root.store";

export interface IReleaseStore {
  //Loaders
  loader: boolean;
  fetchedMap: Record<string, boolean>;
  plotType: Record<string, TReleasePlotType>;
  // observables
  releaseMap: Record<string, IRelease>;
  // computed
  projectReleaseIds: string[] | null;
  projectArchivedReleaseIds: string[] | null;
  // computed actions
  getReleasesFetchStatusByProjectId: (projectId: string) => boolean;
  getFilteredReleaseIds: (projectId: string) => string[] | null;
  getFilteredArchivedReleaseIds: (projectId: string) => string[] | null;
  getReleaseById: (releaseId: string) => IRelease | null;
  getReleaseNameById: (releaseId: string) => string;
  getProjectReleaseDetails: (projectId: string) => IRelease[] | null;
  getProjectReleaseIds: (projectId: string) => string[] | null;
  getPlotTypeByReleaseId: (releaseId: string) => TReleasePlotType;
  // actions
  setPlotType: (releaseId: string, plotType: TReleasePlotType) => void;
  // fetch
  updateReleaseDistribution: (distributionUpdates: DistributionUpdates, releaseId: string) => void;
  fetchWorkspaceReleases: (workspaceSlug: string) => Promise<IRelease[]>;
  fetchReleases: (workspaceSlug: string, projectId: string) => Promise<undefined | IRelease[]>;
  fetchReleasesSlim: (workspaceSlug: string, projectId: string) => Promise<undefined | IRelease[]>;
  fetchArchivedReleases: (workspaceSlug: string, projectId: string) => Promise<undefined | IRelease[]>;
  fetchArchivedReleaseDetails: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<IRelease>;
  fetchReleaseDetails: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<IRelease>;
  // crud
  createRelease: (workspaceSlug: string, projectId: string, data: Partial<IRelease>) => Promise<IRelease>;
  updateReleaseDetails: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<IRelease>
  ) => Promise<IRelease>;
  deleteRelease: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  createReleaseLink: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<ILinkDetails>
  ) => Promise<ILinkDetails>;
  updateReleaseLink: (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    linkId: string,
    data: Partial<ILinkDetails>
  ) => Promise<ILinkDetails>;
  deleteReleaseLink: (workspaceSlug: string, projectId: string, releaseId: string, linkId: string) => Promise<void>;
  // favorites
  addReleaseToFavorites: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  removeReleaseFromFavorites: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  // archive
  archiveRelease: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
  restoreRelease: (workspaceSlug: string, projectId: string, releaseId: string) => Promise<void>;
}

export class ReleaseStore implements IReleaseStore {
  // observables
  loader: boolean = false;
  releaseMap: Record<string, IRelease> = {};
  plotType: Record<string, TReleasePlotType> = {};
  //loaders
  fetchedMap: Record<string, boolean> = {};
  // root store
  rootStore;
  // services
  projectService;
  releaseService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      releaseMap: observable,
      plotType: observable.ref,
      fetchedMap: observable,
      // computed
      projectReleaseIds: computed,
      projectArchivedReleaseIds: computed,
      // actions
      setPlotType: action,
      fetchWorkspaceReleases: action,
      fetchReleases: action,
      fetchArchivedReleases: action,
      fetchArchivedReleaseDetails: action,
      fetchReleaseDetails: action,
      createRelease: action,
      updateReleaseDetails: action,
      deleteRelease: action,
      createReleaseLink: action,
      updateReleaseLink: action,
      deleteReleaseLink: action,
      addReleaseToFavorites: action,
      removeReleaseFromFavorites: action,
      archiveRelease: action,
      restoreRelease: action,
    });

    this.rootStore = _rootStore;

    // services
    this.projectService = new ProjectService();
    this.releaseService = new ReleaseService();
  }

  // computed
  /**
   * get all release ids for the current project
   */
  get projectReleaseIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let projectReleases = Object.values(this.releaseMap).filter((r) => r.project_id === projectId && !r?.archived_at);
    projectReleases = sortBy(projectReleases, [(r) => r.sort_order]);
    const projectReleaseIds = projectReleases.map((r) => r.id);
    return projectReleaseIds || null;
  }

  /**
   * get all archived release ids for the current project
   */
  get projectArchivedReleaseIds() {
    const projectId = this.rootStore.router.projectId;
    if (!projectId || !this.fetchedMap[projectId]) return null;
    let archivedReleases = Object.values(this.releaseMap).filter((r) => r.project_id === projectId && !!r?.archived_at);
    archivedReleases = sortBy(archivedReleases, [(r) => r.sort_order]);
    const projectReleaseIds = archivedReleases.map((r) => r.id);
    return projectReleaseIds || null;
  }

  /**
   * Returns the fetch status for a specific project
   * @param projectId
   * @returns boolean
   */
  getReleasesFetchStatusByProjectId = computedFn((projectId: string) => this.fetchedMap[projectId] ?? false);

  /**
   * @description returns filtered release ids based on display filters and filters
   * @param projectId
   * @returns {string[] | null}
   */
  getFilteredReleaseIds = computedFn((projectId: string) => {
    const releaseFilter = this.rootStore.releaseFilter;
    const displayFilters = releaseFilter.getDisplayFiltersByProjectId(projectId);
    const filters = releaseFilter.getFiltersByProjectId(projectId);
    const searchQuery = releaseFilter.searchQuery ?? "";
    if (!this.fetchedMap[projectId]) return null;
    let releases = Object.values(this.releaseMap ?? {}).filter(
      (r) =>
        r.project_id === projectId &&
        !r.archived_at &&
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        shouldFilterModule(r, displayFilters ?? {}, filters ?? {})
    );
    releases = orderModules(releases, displayFilters?.order_by);
    const releaseIds = releases.map((r) => r.id);
    return releaseIds;
  });

  /**
   * @description returns filtered archived release ids based on display filters and filters
   * @param {string} projectId
   * @returns {string[] | null}
   */
  getFilteredArchivedReleaseIds = computedFn((projectId: string) => {
    const releaseFilter = this.rootStore.releaseFilter;
    const displayFilters = releaseFilter.getDisplayFiltersByProjectId(projectId);
    const filters = releaseFilter.getArchivedFiltersByProjectId(projectId);
    const archivedReleasesSearchQuery = releaseFilter.archivedModulesSearchQuery ?? "";
    if (!this.fetchedMap[projectId]) return null;
    let releases = Object.values(this.releaseMap ?? {}).filter(
      (r) =>
        r.project_id === projectId &&
        !!r.archived_at &&
        r.name.toLowerCase().includes(archivedReleasesSearchQuery.toLowerCase()) &&
        shouldFilterModule(r, displayFilters ?? {}, filters ?? {})
    );
    releases = orderModules(releases, displayFilters?.order_by);
    const releaseIds = releases.map((r) => r.id);
    return releaseIds;
  });

  /**
   * @description get release by id
   * @param releaseId
   * @returns IRelease | null
   */
  getReleaseById = computedFn((releaseId: string) => this.releaseMap?.[releaseId] || null);

  /**
   * @description get release by id
   * @param releaseId
   * @returns IRelease | null
   */
  getReleaseNameById = computedFn((releaseId: string) => this.releaseMap?.[releaseId]?.name);

  /**
   * @description returns list of release details of the project id passed as argument
   * @param projectId
   */
  getProjectReleaseDetails = computedFn((projectId: string) => {
    if (!this.fetchedMap[projectId]) return null;
    let projectReleases = Object.values(this.releaseMap).filter((r) => r.project_id === projectId && !r.archived_at);
    projectReleases = sortBy(projectReleases, [(r) => r.sort_order]);
    return projectReleases;
  });

  /**
   * @description returns list of release ids of the project id passed as argument
   * @param projectId
   */
  getProjectReleaseIds = computedFn((projectId: string) => {
    const projectReleases = this.getProjectReleaseDetails(projectId);
    if (!projectReleases) return null;
    const projectReleaseIds = projectReleases.map((r) => r.id);
    return projectReleaseIds;
  });

  /**
   * @description gets the plot type for the release store
   * @param {TReleasePlotType} plotType
   */
  getPlotTypeByReleaseId = (releaseId: string) => {
    const { projectId } = this.rootStore.router;

    return projectId && this.rootStore.projectEstimate.areEstimateEnabledByProjectId(projectId)
      ? this.plotType[releaseId] || "burndown"
      : "burndown";
  };

  /**
   * @description updates the plot type for the release store
   * @param {TReleasePlotType} plotType
   */
  setPlotType = (releaseId: string, plotType: TReleasePlotType) => {
    set(this.plotType, [releaseId], plotType);
  };

  /**
   * @description fetch all releases in workspace
   * @param workspaceSlug
   * @returns IRelease[]
   */
  fetchWorkspaceReleases = async (workspaceSlug: string) => {
    const projectIds = this.rootStore.projectRoot.project.workspaceProjectIds ?? [];
    if (!projectIds.length) return [];
    const batches = await Promise.all(
      projectIds.map((projectId) =>
        this.releaseService.getReleases(workspaceSlug, projectId).catch(() => [] as IRelease[])
      )
    );
    const response = batches.flat();
    runInAction(() => {
      response.forEach((release) => {
        set(this.releaseMap, [release.id], { ...this.releaseMap[release.id], ...release });
      });
      projectIds.forEach((projectId) => {
        set(this.fetchedMap, projectId, true);
      });
    });
    return response;
  };

  /**
   * @description fetch all releases
   * @param workspaceSlug
   * @param projectId
   * @returns IRelease[]
   */
  fetchReleases = async (workspaceSlug: string, projectId: string) => {
    try {
      this.loader = true;
      await this.releaseService.getReleases(workspaceSlug, projectId).then((response) => {
        runInAction(() => {
          response.forEach((release) => {
            set(this.releaseMap, [release.id], { ...this.releaseMap[release.id], ...release });
          });
          set(this.fetchedMap, projectId, true);
          this.loader = false;
        });
        return response;
      });
    } catch {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description fetch all releases (slim path via workspace list)
   * @param workspaceSlug
   * @param projectId
   * @returns IRelease[]
   */
  fetchReleasesSlim = async (workspaceSlug: string, projectId: string) => {
    try {
      this.loader = true;
      await this.releaseService.getReleases(workspaceSlug, projectId).then((response) => {
        runInAction(() => {
          response.forEach((release) => {
            set(this.releaseMap, [release.id], { ...this.releaseMap[release.id], ...release });
          });
          set(this.fetchedMap, projectId, true);
          this.loader = false;
        });
        return response;
      });
    } catch {
      this.loader = false;
      return undefined;
    }
  };

  /**
   * @description fetch all archived releases
   * @param workspaceSlug
   * @param projectId
   * @returns IRelease[]
   */
  fetchArchivedReleases = async (workspaceSlug: string, projectId: string) => {
    this.loader = true;
    return await this.releaseService
      .getArchivedReleases(workspaceSlug, projectId)
      .then((response) => {
        runInAction(() => {
          response.forEach((release) => {
            set(this.releaseMap, [release.id], { ...this.releaseMap[release.id], ...release });
          });
          this.loader = false;
        });
        return response;
      })
      .catch(() => {
        this.loader = false;
        return undefined;
      });
  };

  /**
   * @description fetch archived release details
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns IRelease
   */
  fetchArchivedReleaseDetails = async (workspaceSlug: string, projectId: string, releaseId: string) =>
    await this.releaseService.getArchivedReleaseDetails(workspaceSlug, projectId, releaseId).then((response) => {
      runInAction(() => {
        set(this.releaseMap, [response.id], { ...this.releaseMap?.[response.id], ...response });
      });
      return response;
    });

  /**
   * This method updates the release's stats locally without fetching the updated stats from backend
   * @param distributionUpdates
   * @param releaseId
   * @returns
   */
  updateReleaseDistribution = (distributionUpdates: DistributionUpdates, releaseId: string) => {
    const releaseInfo = this.releaseMap[releaseId];

    if (!releaseInfo) return;

    runInAction(() => {
      updateDistribution(releaseInfo, distributionUpdates);
    });
  };

  /**
   * @description fetch release details
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns IRelease
   */
  fetchReleaseDetails = async (workspaceSlug: string, projectId: string, releaseId: string) =>
    await this.releaseService.getReleaseDetails(workspaceSlug, projectId, releaseId).then((response) => {
      runInAction(() => {
        set(this.releaseMap, [releaseId], response);
      });
      return response;
    });

  /**
   * @description creates a new release
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns IRelease
   */
  createRelease = async (workspaceSlug: string, projectId: string, data: Partial<IRelease>) =>
    await this.releaseService.createRelease(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        set(this.releaseMap, [response?.id], response);
      });
      return response;
    });

  /**
   * @description updates release details
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @param data
   * @returns IRelease
   */
  updateReleaseDetails = async (workspaceSlug: string, projectId: string, releaseId: string, data: Partial<IRelease>) => {
    const originalReleaseDetails = this.getReleaseById(releaseId);
    try {
      runInAction(() => {
        set(this.releaseMap, [releaseId], { ...(originalReleaseDetails ?? {}), ...data });
      });
      const response = await this.releaseService.patchRelease(workspaceSlug, projectId, releaseId, data);
      return response;
    } catch (error) {
      console.error("Failed to update release in release store", error);
      runInAction(() => {
        set(this.releaseMap, [releaseId], { ...originalReleaseDetails });
      });
      throw error;
    }
  };

  /**
   * @description deletes a release
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   */
  deleteRelease = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const releaseDetails = this.getReleaseById(releaseId);
    if (!releaseDetails) return;
    await this.releaseService.deleteRelease(workspaceSlug, projectId, releaseId).then(() => {
      runInAction(() => {
        delete this.releaseMap[releaseId];
        if (this.rootStore.favorite.entityMap[releaseId]) this.rootStore.favorite.removeFavoriteFromStore(releaseId);
      });
    });
  };

  /**
   * @description creates a new release link
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @param data
   * @returns ILinkDetails
   */
  createReleaseLink = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    data: Partial<ILinkDetails>
  ) => {
    try {
      const releaseLink = await this.releaseService.createReleaseLink(workspaceSlug, projectId, releaseId, data);
      runInAction(() => {
        update(this.releaseMap, [releaseId, "link_release"], (releaseLinks = []) => concat(releaseLinks, releaseLink));
      });
      return releaseLink;
    } catch (error) {
      throw error;
    }
  };

  /**
   * @description updates release link details
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @param linkId
   * @param data
   * @returns ILinkDetails
   */
  updateReleaseLink = async (
    workspaceSlug: string,
    projectId: string,
    releaseId: string,
    linkId: string,
    data: Partial<ILinkDetails>
  ) => {
    const originalReleaseDetails = this.getReleaseById(releaseId);
    try {
      const linkReleases = originalReleaseDetails?.link_release?.map((link) =>
        link.id === linkId ? { ...link, ...data } : link
      );
      runInAction(() => {
        set(this.releaseMap, [releaseId, "link_release"], linkReleases);
      });
      const response = await this.releaseService.updateReleaseLink(workspaceSlug, projectId, releaseId, linkId, data);
      return response;
    } catch (error) {
      console.error("Failed to update release link in release store", error);
      runInAction(() => {
        set(this.releaseMap, [releaseId, "link_release"], originalReleaseDetails?.link_release);
      });
      throw error;
    }
  };

  /**
   * @description deletes a release link
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @param linkId
   */
  deleteReleaseLink = async (workspaceSlug: string, projectId: string, releaseId: string, linkId: string) => {
    try {
      await this.releaseService.deleteReleaseLink(workspaceSlug, projectId, releaseId, linkId);
      runInAction(() => {
        update(this.releaseMap, [releaseId, "link_release"], (releaseLinks = []) =>
          releaseLinks.filter((link: ILinkDetails) => link.id !== linkId)
        );
      });
    } catch (error) {
      throw error;
    }
  };

  /**
   * @description adds a release to favorites
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns
   */
  addReleaseToFavorites = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    try {
      const releaseDetails = this.getReleaseById(releaseId);
      if (releaseDetails?.is_favorite) return;
      runInAction(() => {
        set(this.releaseMap, [releaseId, "is_favorite"], true);
      });
      await this.releaseService.addReleaseToFavorites(workspaceSlug, projectId, { release: releaseId });
    } catch (error) {
      console.error("Failed to add release to favorites in release store", error);
      runInAction(() => {
        set(this.releaseMap, [releaseId, "is_favorite"], false);
      });
    }
  };

  /**
   * @description removes a release from favorites
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns
   */
  removeReleaseFromFavorites = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    try {
      const releaseDetails = this.getReleaseById(releaseId);
      if (!releaseDetails?.is_favorite) return;
      runInAction(() => {
        set(this.releaseMap, [releaseId, "is_favorite"], false);
      });
      await this.releaseService.removeReleaseFromFavorites(workspaceSlug, projectId, releaseId);
    } catch (error) {
      console.error("Failed to remove release from favorites in release store", error);
      runInAction(() => {
        set(this.releaseMap, [releaseId, "is_favorite"], true);
      });
    }
  };

  /**
   * @description archives a release
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns
   */
  archiveRelease = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const releaseDetails = this.getReleaseById(releaseId);
    if (releaseDetails?.archived_at) return;
    await this.releaseService
      .archiveRelease(workspaceSlug, projectId, releaseId)
      .then((response) => {
        runInAction(() => {
          set(this.releaseMap, [releaseId, "archived_at"], response.archived_at);
          if (this.rootStore.favorite.entityMap[releaseId]) this.rootStore.favorite.removeFavoriteFromStore(releaseId);
        });
      })
      .catch((error) => {
        console.error("Failed to archive release in release store", error);
      });
  };

  /**
   * @description restores a release
   * @param workspaceSlug
   * @param projectId
   * @param releaseId
   * @returns
   */
  restoreRelease = async (workspaceSlug: string, projectId: string, releaseId: string) => {
    const releaseDetails = this.getReleaseById(releaseId);
    if (!releaseDetails?.archived_at) return;
    await this.releaseService
      .restoreRelease(workspaceSlug, projectId, releaseId)
      .then(() => {
        runInAction(() => {
          set(this.releaseMap, [releaseId, "archived_at"], null);
        });
      })
      .catch((error) => {
        console.error("Failed to restore release in release store", error);
      });
  };
}
