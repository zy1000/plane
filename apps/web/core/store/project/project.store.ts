/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { sortBy, cloneDeep, update, set } from "lodash-es";
import { observable, action, computed, makeObservable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TFetchStatus, TLoader, TProjectAnalyticsCount, TProjectAnalyticsCountParams } from "@plane/types";
// helpers
import { orderProjects, renderFormattedPayloadDate, shouldFilterProject } from "@plane/utils";
// components
import { projectMatchesConditions } from "@/components/project/filters/match-project";
import { countProjectQuickScopes, projectMatchesQuickScope } from "@/components/project/quick-filters/match-quick-scope";
import type { TProjectQuickScopeContext, TProjectQuickScopeCounts } from "@/components/project/quick-filters/match-quick-scope";
// services
import type { TProject, TPartialProject } from "@/plane-web/types/projects";
import { IssueLabelService, IssueService } from "@/services/issue";
import { ProjectService, ProjectStateService, ProjectArchiveService, ProjectCloseService } from "@/services/project";
import type { TProjectClosePayload } from "@/services/project";
// store
import type { CoreRootStore } from "../root.store";

type ProjectOverviewCollapsible = "links" | "attachments" | "stages";

export interface IProjectStore {
  // observables
  isUpdatingProject: boolean;
  loader: TLoader;
  fetchStatus: TFetchStatus;
  projectMap: Record<string, TProject>; // projectId: project info
  projectAnalyticsCountMap: Record<string, TProjectAnalyticsCount>; // projectId: project analytics count
  // computed
  isInitializingProjects: boolean;
  filteredProjectIds: string[] | undefined;
  /** 快捷页签各档的数量（页签之外的条件已筛过），列表页的页签条用 */
  quickScopeCounts: TProjectQuickScopeCounts | undefined;
  workspaceProjectIds: string[] | undefined;
  archivedProjectIds: string[] | undefined;
  totalProjectIds: string[] | undefined;
  joinedProjectIds: string[];
  favoriteProjectIds: string[];
  currentProjectDetails: TProject | undefined;
  currentProjectNextSequenceId: number | undefined;
  // actions
  getProjectById: (projectId: string | undefined | null) => TProject | undefined;
  getPartialProjectById: (projectId: string | undefined | null) => TPartialProject | undefined;
  getProjectIdentifierById: (projectId: string | undefined | null) => string;
  getProjectAnalyticsCountById: (projectId: string | undefined | null) => TProjectAnalyticsCount | undefined;
  getProjectByIdentifier: (projectIdentifier: string) => TProject | undefined;
  // collapsible
  openCollapsibleSection: ProjectOverviewCollapsible[];
  lastCollapsibleAction: ProjectOverviewCollapsible | null;

  setOpenCollapsibleSection: (section: ProjectOverviewCollapsible[]) => void;
  setLastCollapsibleAction: (section: ProjectOverviewCollapsible) => void;
  toggleOpenCollapsibleSection: (section: ProjectOverviewCollapsible) => void;

  // helper actions
  processProjectAfterCreation: (workspaceSlug: string, data: TProject) => void;
  setFollowingProjectsVisibleTypes: (devModeId: string, issueTypeIds: string[]) => void;

  // fetch actions
  fetchPartialProjects: (workspaceSlug: string) => Promise<TPartialProject[]>;
  fetchProjects: (workspaceSlug: string) => Promise<TProject[]>;
  fetchProjectDetails: (workspaceSlug: string, projectId: string) => Promise<TProject>;
  fetchProjectHistory: (workspaceSlug: string, projectId: string) => Promise<any[]>;
  fetchProjectAnalyze: (workspaceSlug: string, projectId: string) => Promise<any>;
  fetchProjectAnalyticsCount: (
    workspaceSlug: string,
    params?: TProjectAnalyticsCountParams
  ) => Promise<TProjectAnalyticsCount[]>;
  // favorites actions
  addProjectToFavorites: (workspaceSlug: string, projectId: string) => Promise<any>;
  removeProjectFromFavorites: (workspaceSlug: string, projectId: string) => Promise<any>;
  // project-view action
  updateProjectView: (workspaceSlug: string, projectId: string, viewProps: any) => Promise<any>;
  // CRUD actions
  createProject: (workspaceSlug: string, data: Partial<TProject>) => Promise<TProject>;
  updateProject: (workspaceSlug: string, projectId: string, data: Partial<TProject>) => Promise<TProject>;
  deleteProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  // archive actions
  archiveProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  restoreProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  // close / reopen actions
  closeProject: (workspaceSlug: string, projectId: string, data: TProjectClosePayload) => Promise<void>;
  reopenProject: (workspaceSlug: string, projectId: string) => Promise<void>;
}

export class ProjectStore implements IProjectStore {
  // observables
  isUpdatingProject: boolean = false;
  loader: TLoader = "init-loader";
  fetchStatus: TFetchStatus = undefined;
  projectMap: Record<string, TProject> = {};
  projectAnalyticsCountMap: Record<string, TProjectAnalyticsCount> = {};
  openCollapsibleSection: ProjectOverviewCollapsible[] = ["stages"];
  lastCollapsibleAction: ProjectOverviewCollapsible | null = null;

  // root store
  rootStore: CoreRootStore;
  // service
  projectService;
  projectArchiveService;
  projectCloseService;
  issueLabelService;
  issueService;
  stateService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      // observables
      isUpdatingProject: observable,
      loader: observable.ref,
      fetchStatus: observable.ref,
      projectMap: observable,
      projectAnalyticsCountMap: observable,
      openCollapsibleSection: observable.ref,
      lastCollapsibleAction: observable.ref,
      // computed
      isInitializingProjects: computed,
      quickScopeCandidates: computed,
      filteredProjectIds: computed,
      quickScopeCounts: computed,
      workspaceProjectIds: computed,
      archivedProjectIds: computed,
      totalProjectIds: computed,
      currentProjectDetails: computed,
      joinedProjectIds: computed,
      favoriteProjectIds: computed,
      currentProjectNextSequenceId: computed,
      // helper actions
      processProjectAfterCreation: action,
      setFollowingProjectsVisibleTypes: action,
      // fetch actions
      fetchPartialProjects: action,
      fetchProjects: action,
      fetchProjectDetails: action,
      fetchProjectHistory: action,
      fetchProjectAnalyze: action,
      fetchProjectAnalyticsCount: action,
      // favorites actions
      addProjectToFavorites: action,
      removeProjectFromFavorites: action,
      // project-view action
      updateProjectView: action,
      // CRUD actions
      createProject: action,
      updateProject: action,
      closeProject: action,
      reopenProject: action,
      // collapsible actions
      setOpenCollapsibleSection: action,
      setLastCollapsibleAction: action,
      toggleOpenCollapsibleSection: action,
    });
    // root store
    this.rootStore = _rootStore;
    // services
    this.projectService = new ProjectService();
    this.projectArchiveService = new ProjectArchiveService();
    this.projectCloseService = new ProjectCloseService();
    this.issueService = new IssueService();
    this.issueLabelService = new IssueLabelService();
    this.stateService = new ProjectStateService();
  }

  /**
   * @description returns true if projects are still initializing
   */
  get isInitializingProjects() {
    return this.loader === "init-loader";
  }

  /**
   * @description 快捷页签之前的候选集：工作区 ∧ 搜索 ∧ 我参与的 ∧ 富筛选条件。
   * 归档与否在这一层不区分（页签「已归档」要用到归档的项目），归档页例外 —— 它只看归档的。
   */
  get quickScopeCandidates(): TProject[] | undefined {
    const workspaceDetails = this.rootStore.workspaceRoot.currentWorkspace;
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    const { currentWorkspaceDisplayFilters: displayFilters, searchQuery, getRichFilter } =
      this.rootStore.projectRoot.projectFilter;
    if (!workspaceDetails || !displayFilters) return;
    // 属性条件来自富筛选实例（列表页挂载时才建）；没建过就只做搜索 + 范围过滤
    const conditions = workspaceSlug ? (getRichFilter(workspaceSlug)?.allConditionsForDisplay ?? []) : [];
    const currentUserId = this.rootStore.user.data?.id;
    const query = searchQuery.toLowerCase();
    const scopeFilters = displayFilters.archived_projects ? displayFilters : { ...displayFilters, show_archived_projects: true };
    return Object.values(this.projectMap).filter(
      (p) =>
        p.workspace === workspaceDetails.id &&
        (p.name.toLowerCase().includes(query) || p.identifier.toLowerCase().includes(query)) &&
        shouldFilterProject(p, scopeFilters) &&
        projectMatchesConditions(p, conditions, currentUserId)
    );
  }

  private getQuickScopeContext(): TProjectQuickScopeContext {
    const workspaceSlug = this.rootStore.router.workspaceSlug;
    const closedIds = workspaceSlug ? (this.rootStore.projectRoot.projectFilter.closedStatusIds[workspaceSlug] ?? []) : [];
    return { closedStatusIds: new Set(closedIds), today: renderFormattedPayloadDate(new Date()) ?? "" };
  }

  /**
   * @description returns filtered projects based on filters and search query
   */
  get filteredProjectIds() {
    const candidates = this.quickScopeCandidates;
    const displayFilters = this.rootStore.projectRoot.projectFilter.currentWorkspaceDisplayFilters;
    if (!candidates || !displayFilters) return;
    let workspaceProjects = candidates;
    // 归档页没有页签条；列表页按选中的页签再筛一层
    if (!displayFilters.archived_projects) {
      const ctx = this.getQuickScopeContext();
      const scope = displayFilters.quick_scope ?? "all";
      workspaceProjects = workspaceProjects.filter((p) => projectMatchesQuickScope(p, scope, ctx));
    }
    workspaceProjects = orderProjects(workspaceProjects, displayFilters.order_by);
    return workspaceProjects.map((p) => p.id);
  }

  get quickScopeCounts() {
    const candidates = this.quickScopeCandidates;
    if (!candidates) return;
    return countProjectQuickScopes(candidates, this.getQuickScopeContext());
  }

  /**
   * Returns project IDs belong to the current workspace
   */
  get workspaceProjectIds() {
    const workspaceDetails = this.rootStore.workspaceRoot.currentWorkspace;
    if (!workspaceDetails) return;
    const workspaceProjects = Object.values(this.projectMap).filter(
      (p) => p.workspace === workspaceDetails.id && !p.archived_at
    );
    const projectIds = workspaceProjects.map((p) => p.id);
    return projectIds ?? null;
  }

  /**
   * Returns archived project IDs belong to current workspace.
   */
  get archivedProjectIds() {
    const currentWorkspace = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspace) return;

    let projects = Object.values(this.projectMap ?? {});
    projects = sortBy(projects, "archived_at");

    const projectIds = projects
      .filter((project) => project.workspace === currentWorkspace.id && !!project.archived_at)
      .map((project) => project.id);
    return projectIds;
  }

  /**
   * Returns total project IDs belong to the current workspace
   */
  // workspaceProjectIds + archivedProjectIds
  get totalProjectIds() {
    const currentWorkspace = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspace) return;

    const workspaceProjects = this.workspaceProjectIds ?? [];
    const archivedProjects = this.archivedProjectIds ?? [];
    return [...workspaceProjects, ...archivedProjects];
  }

  /**
   * Returns current project details
   */
  get currentProjectDetails() {
    if (!this.rootStore.router.projectId) return;
    return this.projectMap?.[this.rootStore.router.projectId];
  }

  /**
   * Returns the next sequence ID for the current project
   * Used for calculating identifier width in list layouts
   */
  get currentProjectNextSequenceId() {
    if (!this.rootStore.router.projectId) return undefined;
    return this.currentProjectDetails?.next_work_item_sequence;
  }

  /**
   * Returns joined project IDs belong to the current workspace
   */
  get joinedProjectIds() {
    const currentWorkspace = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspace) return [];

    let projects = Object.values(this.projectMap ?? {});
    projects = sortBy(projects, "sort_order");

    const projectIds = projects
      .filter((project) => project.workspace === currentWorkspace.id && !!project.member_role && !project.archived_at)
      .map((project) => project.id);
    return projectIds;
  }

  /**
   * Returns favorite project IDs belong to the current workspace
   */
  get favoriteProjectIds() {
    const currentWorkspace = this.rootStore.workspaceRoot.currentWorkspace;
    if (!currentWorkspace) return [];

    let projects = Object.values(this.projectMap ?? {});
    projects = sortBy(projects, "created_at");

    const projectIds = projects
      .filter(
        (project) =>
          project.workspace === currentWorkspace.id &&
          !!project.member_role &&
          project.is_favorite &&
          !project.archived_at
      )
      .map((project) => project.id);
    return projectIds;
  }

  setOpenCollapsibleSection = (section: ProjectOverviewCollapsible[]) => {
    this.openCollapsibleSection = section;
    if (this.lastCollapsibleAction) this.lastCollapsibleAction = null;
  };

  setLastCollapsibleAction = (section: ProjectOverviewCollapsible) => {
    this.openCollapsibleSection = [...this.openCollapsibleSection, section];
  };

  toggleOpenCollapsibleSection = (section: ProjectOverviewCollapsible) => {
    if (this.openCollapsibleSection && this.openCollapsibleSection.includes(section)) {
      this.openCollapsibleSection = this.openCollapsibleSection.filter((s) => s !== section);
    } else {
      this.openCollapsibleSection = [...this.openCollapsibleSection, section];
    }
  };

  /**
   * @description process project after creation
   * @param workspaceSlug
   * @param data
   */
  /**
   * 研发模式的类型关联变了：跟随该模式的项目能用的类型（visible_issue_type_ids）就地改掉，
   * 按项目过滤状态等地方不用等整页刷新。项目自定义的（visible_issue_type_ids 为 null）不动。
   */
  setFollowingProjectsVisibleTypes = (devModeId: string, issueTypeIds: string[]) => {
    Object.values(this.projectMap).forEach((project) => {
      if (project?.dev_mode === devModeId && Array.isArray(project.visible_issue_type_ids)) {
        set(this.projectMap, [project.id, "visible_issue_type_ids"], [...issueTypeIds]);
      }
    });
  };

  processProjectAfterCreation = (workspaceSlug: string, data: TProject) => {
    runInAction(() => {
      set(this.projectMap, [data.id], data);
      // updating the user project role in workspaceProjectsPermissions
      set(this.rootStore.user.permission.workspaceProjectsPermissions, [workspaceSlug, data.id], data.member_role);
    });
  };

  /**
   * get Workspace projects partial data using workspace slug
   * @param workspaceSlug
   * @returns Promise<TPartialProject[]>
   *
   */
  fetchPartialProjects = async (workspaceSlug: string) => {
    try {
      this.loader = "init-loader";
      const projectsResponse = await this.projectService.getProjectsLite(workspaceSlug);
      runInAction(() => {
        projectsResponse.forEach((project) => {
          // 轻量接口不返回 is_favorite，先用收藏 store 播种，避免表格先出图时星标是空的。
          // 顺序：已有的真实值 > 播种值，projectsResponse 里没有这个字段所以不会覆盖。
          update(this.projectMap, [project.id], (p) => ({
            is_favorite: !!this.rootStore.favorite.entityMap[project.id],
            ...p,
            ...project,
          }));
        });
        this.loader = "loaded";
        if (!this.fetchStatus) this.fetchStatus = "partial";
      });
      return projectsResponse;
    } catch (error) {
      console.log("Failed to fetch project from workspace store");
      this.loader = "loaded";
      throw error;
    }
  };

  /**
   * get Workspace projects using workspace slug
   * @param workspaceSlug
   * @returns Promise<TProject[]>
   *
   */
  fetchProjects = async (workspaceSlug: string) => {
    try {
      if (this.workspaceProjectIds && this.workspaceProjectIds.length > 0) {
        this.loader = "mutation";
      } else {
        this.loader = "init-loader";
      }
      const projectsResponse = await this.projectService.getProjects(workspaceSlug);
      runInAction(() => {
        projectsResponse.forEach((project) => {
          update(this.projectMap, [project.id], (p) => ({ ...p, ...project }));
        });
        this.loader = "loaded";
        this.fetchStatus = "complete";
      });
      return projectsResponse;
    } catch (error) {
      console.log("Failed to fetch project from workspace store");
      this.loader = "loaded";
      throw error;
    }
  };

  /**
   * Fetches project details using workspace slug and project id
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<TProject>
   */
  fetchProjectDetails = async (workspaceSlug: string, projectId: string) => {
    try {
      const response = await this.projectService.getProject(workspaceSlug, projectId);
      runInAction(() => {
        update(this.projectMap, [projectId], (p) => ({ ...p, ...response }));
      });
      return response;
    } catch (error) {
      console.log("Error while fetching project details", error);
      throw error;
    }
  };

  fetchProjectAnalyze = async (workspaceSlug: string, projectId: string) => {
    try {
      const response = await this.projectService.getProjectAnalyze(workspaceSlug, projectId);
      return response;
    } catch (error) {
      console.log("Error while fetching project details", error);
      throw error;
    }
  };

  fetchProjectHistory = async (workspaceSlug: string, projectId: string) => {
    try {
      // 目前后端尚未实现该接口，返回模拟数据
      // const response = await this.projectService.getProjectHistory(workspaceSlug, projectId);
      // return response;

      const response =
        '[{"id":"83c4c56e-f267-4f18-81a3-d5776d856b8b","deleted_at":null,"actor_detail":{"id":"0b8a2dc5-2043-4a7e-8726-19ec159cf6a8","first_name":"YZ","last_name":"","avatar":"","avatar_url":null,"is_bot":false,"display_name":"xxxx2024"},"project_detail":{"id":"9b9fd37c-359f-4969-87ac-19377ba05c61","identifier":"KF789","name":"kf789","cover_image":"https://images.unsplash.com/photo-1691230995681-480d86cbc135?auto=format&fit=crop&q=80&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&w=870&q=80","cover_image_url":"https://images.unsplash.com/photo-1691230995681-480d86cbc135?auto=format&fit=crop&q=80&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&w=870&q=80","logo_props":{"emoji":{"url":"https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f447.png","value":"128071"},"in_use":"emoji"},"description":"Welcome to the Plane Demo Project! This project throws you into the driver’s seat of Plane, work management software. Through curated work items, you’ll uncover key features, pick up best practices, and see how Plane can streamline your team’s workflow. Whether you’re a startup hungry to scale or an enterprise sharpening efficiency, this demo is your launchpad to mastering Plane. Jump in and see what it can do!"},"workspace_detail":{"name":"kf789","slug":"kf789","id":"a29df89c-6208-4272-a18d-ec491b81d183","logo_url":null},"created_at":"2025-09-25T06:46:35.434624Z","updated_at":"2025-09-25T06:46:35.434638Z","verb":"updated","field":"description","old_value":null,"new_value":"<p class=\\"editor-paragraph-block\\">DSFSDFSD</p>","comment":"updated the description to","old_identifier":null,"new_identifier":null,"epoch":1758869195,"created_by":null,"updated_by":null,"project":"9b9fd37c-359f-4969-87ac-19377ba05c61","workspace":"a29df89c-6208-4272-a18d-ec491b81d183","issue":null,"issue_comment":null,"actor":"0b8a2dc5-2043-4a7e-8726-19ec159cf6a8"},{"id":"93c4c56e-f267-4f18-81a3-d5776d856b8b","deleted_at":null,"actor_detail":{"id":"0b8a2dc5-2043-4a7e-8726-19ec159cf6a8","first_name":"YZ","last_name":"","avatar":"","avatar_url":null,"is_bot":false,"display_name":"zhenggg2024"},"project_detail":{"id":"9b9fd37c-359f-4969-87ac-19377ba05c61","identifier":"KF789","name":"kf789","cover_image":"https://images.unsplash.com/photo-1691230995681-480d86cbc135?auto=format&fit=crop&q=80&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&w=870&q=80","cover_image_url":"https://images.unsplash.com/photo-1691230995681-480d86cbc135?auto=format&fit=crop&q=80&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&w=870&q=80","logo_props":{"emoji":{"url":"https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/1f447.png","value":"128071"},"in_use":"emoji"},"description":"Welcome to the Plane Demo Project! This project throws you into the driver’s seat of Plane, work management software. Through curated work items, you’ll uncover key features, pick up best practices, and see how Plane can streamline your team’s workflow. Whether you’re a startup hungry to scale or an enterprise sharpening efficiency, this demo is your launchpad to mastering Plane. Jump in and see what it can do!"},"workspace_detail":{"name":"kf789","slug":"kf789","id":"a29df89c-6208-4272-a18d-ec491b81d183","logo_url":null},"created_at":"2025-09-26T06:46:35.434624Z","updated_at":"2025-09-26T06:46:35.434638Z","verb":"updated","field":"description","old_value":null,"new_value":"<p class=\\"editor-paragraph-block\\">DSFSDFSD</p>","comment":"updated the description to","old_identifier":null,"new_identifier":null,"epoch":1758869195,"created_by":null,"updated_by":null,"project":"9b9fd37c-359f-4969-87ac-19377ba05c61","workspace":"a29df89c-6208-4272-a18d-ec491b81d183","issue":null,"issue_comment":null,"actor":"0b8a2dc5-2043-4a7e-8726-19ec159cf6a8"}]';
      return JSON.parse(response);
    } catch (error) {
      console.log("Error while fetching project details", error);
      throw error;
    }
  };

  /**
   * Fetches project analytics count using workspace slug and project id
   * @param workspaceSlug
   * @param params TProjectAnalyticsCountParams
   * @returns Promise<TProjectAnalyticsCount[]>
   */
  fetchProjectAnalyticsCount = async (
    workspaceSlug: string,
    params?: TProjectAnalyticsCountParams
  ): Promise<TProjectAnalyticsCount[]> => {
    try {
      const response = await this.projectService.getProjectAnalyticsCount(workspaceSlug, params);
      runInAction(() => {
        for (const analyticsData of response) {
          set(this.projectAnalyticsCountMap, [analyticsData.id], analyticsData);
        }
      });
      return response;
    } catch (error) {
      console.log("Failed to fetch project analytics count", error);
      throw error;
    }
  };

  /**
   * Returns project details using project id
   * @param projectId
   * @returns TProject | null
   */
  getProjectById = computedFn((projectId: string | undefined | null) => {
    const projectInfo = this.projectMap[projectId ?? ""] || undefined;
    return projectInfo;
  });

  /**
   * Returns project details using project identifier
   * @param projectIdentifier
   * @returns TProject | undefined
   */
  getProjectByIdentifier = computedFn((projectIdentifier: string) =>
    Object.values(this.projectMap).find((project) => project.identifier === projectIdentifier)
  );

  /**
   * Returns project lite using project id
   * This method is used just for type safety
   * @param projectId
   * @returns TPartialProject | null
   */
  getPartialProjectById = computedFn((projectId: string | undefined | null) => {
    const projectInfo = this.projectMap[projectId ?? ""] || undefined;
    return projectInfo;
  });

  /**
   * Returns project identifier using project id
   * @param projectId
   * @returns string
   */
  getProjectIdentifierById = computedFn((projectId: string | undefined | null) => {
    const projectInfo = this.projectMap?.[projectId ?? ""];
    return projectInfo?.identifier;
  });

  /**
   * Returns project analytics count using project id
   * @param projectId
   * @returns TProjectAnalyticsCount[]
   */
  getProjectAnalyticsCountById = computedFn((projectId: string | undefined | null) => {
    if (!projectId) return undefined;
    return this.projectAnalyticsCountMap?.[projectId];
  });

  /**
   * Adds project to favorites and updates project favorite status in the store
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  addProjectToFavorites = async (workspaceSlug: string, projectId: string) => {
    try {
      const currentProject = this.getProjectById(projectId);
      if (currentProject.is_favorite) return;
      runInAction(() => {
        set(this.projectMap, [projectId, "is_favorite"], true);
      });
      const response = await this.rootStore.favorite.addFavorite(workspaceSlug.toString(), {
        entity_type: "project",
        entity_identifier: projectId,
        project_id: projectId,
        entity_data: { name: this.projectMap[projectId].name || "" },
      });
      return response;
    } catch (error) {
      console.log("Failed to add project to favorite");
      runInAction(() => {
        set(this.projectMap, [projectId, "is_favorite"], false);
      });
      throw error;
    }
  };

  /**
   * Removes project from favorites and updates project favorite status in the store
   * @param workspaceSlug
   * @param projectId
   * @returns
   */
  removeProjectFromFavorites = async (workspaceSlug: string, projectId: string) => {
    try {
      const currentProject = this.getProjectById(projectId);
      if (!currentProject.is_favorite) return;
      runInAction(() => {
        set(this.projectMap, [projectId, "is_favorite"], false);
      });
      const response = await this.rootStore.favorite.removeFavoriteEntity(workspaceSlug.toString(), projectId);

      return response;
    } catch (error) {
      console.log("Failed to add project to favorite");
      runInAction(() => {
        set(this.projectMap, [projectId, "is_favorite"], true);
      });
      throw error;
    }
  };

  /**
   * Updates the project view
   * @param workspaceSlug
   * @param projectId
   * @param viewProps
   * @returns
   */
  updateProjectView = async (workspaceSlug: string, projectId: string, viewProps: { sort_order: number }) => {
    const currentProjectSortOrder = this.getProjectById(projectId)?.sort_order;
    try {
      runInAction(() => {
        set(this.projectMap, [projectId, "sort_order"], viewProps?.sort_order);
      });
      const response = await this.projectService.updateProjectUserProperties(workspaceSlug, projectId, viewProps);
      return response;
    } catch (error) {
      runInAction(() => {
        set(this.projectMap, [projectId, "sort_order"], currentProjectSortOrder);
      });
      console.log("Failed to update sort order of the projects");
      throw error;
    }
  };

  /**
   * Creates a project in the workspace and adds it to the store
   * @param workspaceSlug
   * @param data
   * @returns Promise<TProject>
   */
  createProject = async (workspaceSlug: string, data: any) => {
    try {
      const response = await this.projectService.createProject(workspaceSlug, data);
      this.processProjectAfterCreation(workspaceSlug, response);
      return response;
    } catch (error) {
      console.log("Failed to create project from project store");
      throw error;
    }
  };

  /**
   * Updates a details of a project and updates it in the store
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns Promise<TProject>
   */
  updateProject = async (workspaceSlug: string, projectId: string, data: Partial<TProject>) => {
    const projectDetails = cloneDeep(this.getProjectById(projectId));
    try {
      runInAction(() => {
        set(this.projectMap, [projectId], { ...projectDetails, ...data });
        this.isUpdatingProject = true;
      });
      const response = await this.projectService.updateProject(workspaceSlug, projectId, data);
      runInAction(() => {
        // 用服务端真值覆盖乐观值：*_detail（字典值 / 研发产品经理）只有响应里才有
        update(this.projectMap, [projectId], (p) => ({ ...p, ...response }));
        this.isUpdatingProject = false;
      });
      return response;
    } catch (error) {
      console.log("Failed to create project from project store");
      runInAction(() => {
        set(this.projectMap, [projectId], projectDetails);
        this.isUpdatingProject = false;
      });
      throw error;
    }
  };

  /**
   * Deletes a project from specific workspace and deletes it from the store
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<void>
   */
  deleteProject = async (workspaceSlug: string, projectId: string) => {
    try {
      if (!this.projectMap?.[projectId]) return;
      await this.projectService.deleteProject(workspaceSlug, projectId);
      runInAction(() => {
        delete this.projectMap[projectId];
        if (this.rootStore.favorite.entityMap[projectId]) this.rootStore.favorite.removeFavoriteFromStore(projectId);
        delete this.rootStore.user.permission.workspaceProjectsPermissions[workspaceSlug][projectId];
      });
    } catch (error) {
      console.log("Failed to delete project from project store");
      throw error;
    }
  };

  /**
   * Archives a project from specific workspace and updates it in the store
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<void>
   */
  archiveProject = async (workspaceSlug: string, projectId: string) => {
    await this.projectArchiveService
      .archiveProject(workspaceSlug, projectId)
      .then((response) => {
        runInAction(() => {
          set(this.projectMap, [projectId, "archived_at"], response.archived_at);
          this.rootStore.favorite.removeFavoriteFromStore(projectId);
        });
      })
      .catch((error) => {
        console.log("Failed to archive project from project store");
        throw error;
      });
  };

  /**
   * Restores a project from specific workspace and updates it in the store
   * @param workspaceSlug
   * @param projectId
   * @returns Promise<void>
   */
  restoreProject = async (workspaceSlug: string, projectId: string) => {
    await this.projectArchiveService
      .restoreProject(workspaceSlug, projectId)
      .then(() => {
        runInAction(() => {
          set(this.projectMap, [projectId, "archived_at"], null);
        });
      })
      .catch((error) => {
        console.log("Failed to restore project from project store");
        throw error;
      });
  };

  /**
   * 列表行操作「关闭项目」：状态改成终态 + 实际完成日期 + 备注。响应只回这几个字段，合并进 projectMap
   */
  closeProject = async (workspaceSlug: string, projectId: string, data: TProjectClosePayload) => {
    const response = await this.projectCloseService.closeProject(workspaceSlug, projectId, data);
    runInAction(() => {
      update(this.projectMap, [projectId], (p) => ({ ...p, ...response }));
    });
  };

  /**
   * 列表行操作「重新开启」：状态改回活跃中，实际完成日期与备注清空
   */
  reopenProject = async (workspaceSlug: string, projectId: string) => {
    const response = await this.projectCloseService.reopenProject(workspaceSlug, projectId);
    runInAction(() => {
      update(this.projectMap, [projectId], (p) => ({ ...p, ...response }));
    });
  };
}
