/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { uniq, unset, set, update, sortBy } from "lodash-es";
import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type {
  IProjectBulkAddFormData,
  IProjectUserPropertiesResponse,
  IUserLite,
  TProjectMembership,
} from "@plane/types";
// plane web imports
import type { RootStore } from "@/plane-web/store/root.store";
// services
import { ProjectMemberService, ProjectService } from "@/services/project";
// store
import type { IProjectStore } from "@/store/project/project.store";
import type { IRouterStore } from "@/store/router.store";
import type { IUserStore } from "@/store/user";
// local imports
import type { IMemberRootStore } from "../index";
import { sortProjectMembers } from "../utils";
import type { IProjectMemberFiltersStore } from "./project-member-filters.store";
import { ProjectMemberFiltersStore } from "./project-member-filters.store";

export interface IProjectMemberDetails extends Omit<TProjectMembership, "member"> {
  member: IUserLite;
}

export interface IBaseProjectMemberStore {
  // observables
  projectMemberFetchStatusMap: {
    [projectId: string]: boolean;
  };
  projectMemberMap: {
    [projectId: string]: Record<string, TProjectMembership>;
  };
  projectUserPropertiesMap: {
    [projectId: string]: IProjectUserPropertiesResponse;
  };
  // filters store
  filters: IProjectMemberFiltersStore;
  // computed
  projectMemberIds: string[] | null;
  // computed actions
  getProjectMemberFetchStatus: (projectId: string) => boolean;
  getProjectMemberDetails: (userId: string, projectId: string) => IProjectMemberDetails | null;
  /** 第二个参数是整数角色时代「是否含访客」的遗留，已无访客，忽略 */
  getProjectMemberIds: (projectId: string, includeGuestUsers: boolean) => string[] | null;
  getFilteredProjectMemberDetails: (userId: string, projectId: string) => IProjectMemberDetails | null;
  getProjectUserProperties: (projectId: string) => IProjectUserPropertiesResponse | null;
  // fetch actions
  fetchProjectMembers: (
    workspaceSlug: string,
    projectId: string,
    clearExistingMembers?: boolean
  ) => Promise<TProjectMembership[]>;
  fetchProjectUserProperties: (workspaceSlug: string, projectId: string) => Promise<IProjectUserPropertiesResponse>;
  // update actions
  updateProjectUserProperties: (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectUserPropertiesResponse>
  ) => Promise<IProjectUserPropertiesResponse>;
  // bulk operation actions
  bulkAddMembersToProject: (
    workspaceSlug: string,
    projectId: string,
    data: IProjectBulkAddFormData
  ) => Promise<TProjectMembership[]>;
  // crud actions
  /** 整份替换成员的权限组（custom_role_ids）和 / 或角色（job_role_ids），没传的不动 */
  updateMemberAccess: (
    workspaceSlug: string,
    projectId: string,
    userId: string,
    data: { custom_role_ids?: string[]; job_role_ids?: string[] }
  ) => Promise<void>;
  removeMemberFromProject: (workspaceSlug: string, projectId: string, userId: string) => Promise<void>;
}

export abstract class BaseProjectMemberStore implements IBaseProjectMemberStore {
  // observables
  projectMemberFetchStatusMap: {
    [projectId: string]: boolean;
  } = {};
  projectMemberMap: {
    [projectId: string]: Record<string, TProjectMembership>;
  } = {};
  projectUserPropertiesMap: {
    [projectId: string]: IProjectUserPropertiesResponse;
  } = {};
  // filters store
  filters: IProjectMemberFiltersStore;
  // stores
  routerStore: IRouterStore;
  userStore: IUserStore;
  memberRoot: IMemberRootStore;
  projectRoot: IProjectStore;
  rootStore: RootStore;
  // services
  projectMemberService;
  projectService;

  constructor(_memberRoot: IMemberRootStore, _rootStore: RootStore) {
    makeObservable(this, {
      // observables
      projectMemberMap: observable,
      projectUserPropertiesMap: observable,
      // computed
      projectMemberIds: computed,
      // actions
      fetchProjectMembers: action,
      fetchProjectUserProperties: action,
      updateProjectUserProperties: action,
      bulkAddMembersToProject: action,
      updateMemberAccess: action,
      removeMemberFromProject: action,
    });
    // root store
    this.rootStore = _rootStore;
    this.routerStore = _rootStore.router;
    this.userStore = _rootStore.user;
    this.memberRoot = _memberRoot;
    this.projectRoot = _rootStore.projectRoot.project;
    this.filters = new ProjectMemberFiltersStore();
    // services
    this.projectMemberService = new ProjectMemberService();
    this.projectService = new ProjectService();
  }

  /**
   * @description get the list of all the user ids of all the members of the current project
   * Returns filtered and sorted member IDs based on current filters
   */
  get projectMemberIds() {
    const projectId = this.routerStore.projectId;
    if (!projectId) return null;

    const members = Object.values(this.projectMemberMap?.[projectId] ?? {});
    if (members.length === 0) return null;

    // Access the filters directly to ensure MobX tracking
    const currentFilters = this.filters.filtersMap[projectId];

    // Apply filters and sorting directly here to ensure MobX tracking
    const sortedMembers = sortProjectMembers(
      members,
      this.memberRoot?.memberMap || {},
      (member) => member.member,
      currentFilters
    );

    return sortedMembers.map((member) => member.member);
  }

  /**
   * @description get the fetch status of a project member
   * @param projectId
   */
  getProjectMemberFetchStatus = computedFn((projectId: string) => this.projectMemberFetchStatusMap?.[projectId]);

  /**
   * @description get the project memberships
   * @param projectId
   */
  protected getProjectMemberships = computedFn((projectId: string) =>
    Object.values(this.projectMemberMap?.[projectId] ?? {})
  );

  /**
   * @description get the project membership by user id
   * @param userId
   * @param projectId
   */
  protected getProjectMembershipByUserId = computedFn(
    (userId: string, projectId: string) => this.projectMemberMap?.[projectId]?.[userId]
  );

  /**
   * @description get the details of a project member
   * @param userId
   * @param projectId
   */
  getProjectMemberDetails = computedFn((userId: string, projectId: string) => {
    const projectMember = this.getProjectMembershipByUserId(userId, projectId);
    const userDetails = this.memberRoot?.memberMap?.[projectMember?.member];
    if (!projectMember || !userDetails) return null;
    const memberDetails: IProjectMemberDetails = {
      id: projectMember.id,
      custom_role_ids: projectMember.custom_role_ids,
      job_role_ids: projectMember.job_role_ids,
      inherited_role_ids: projectMember.inherited_role_ids,
      role_template_ids: projectMember.role_template_ids,
      role_sources: projectMember.role_sources,
      member: {
        ...userDetails,
        joining_date: projectMember.created_at ?? undefined,
      },
      created_at: projectMember.created_at,
    };
    return memberDetails;
  });

  /**
   * @description get the list of all the user ids of all the members of a project using projectId
   * @param projectId
   */
  getProjectMemberIds = computedFn((projectId: string, _includeGuestUsers: boolean): string[] | null => {
    if (!this.projectMemberMap?.[projectId]) return null;
    let members = this.getProjectMemberships(projectId);
    members = sortBy(members, [
      (m) => m.member !== this.userStore.data?.id,
      (m) => this.memberRoot?.memberMap?.[m.member]?.display_name?.toLowerCase(),
    ]);
    const memberIds = members.map((m) => m.member);
    return memberIds;
  });

  /**
   * @description get the filtered project member details for a specific user
   * @param userId
   * @param projectId
   */
  getFilteredProjectMemberDetails = computedFn((userId: string, projectId: string) => {
    const projectMember = this.getProjectMembershipByUserId(userId, projectId);
    const userDetails = this.memberRoot?.memberMap?.[projectMember?.member];
    if (!projectMember || !userDetails) return null;

    // Check if this member passes the current filters
    const allMembers = this.getProjectMemberships(projectId);
    const filteredMemberIds = this.filters.getFilteredMemberIds(
      allMembers,
      this.memberRoot?.memberMap || {},
      (member) => member.member,
      projectId
    );

    // Return null if this user doesn't pass the filters
    if (!filteredMemberIds.includes(userId)) return null;

    const memberDetails: IProjectMemberDetails = {
      id: projectMember.id,
      custom_role_ids: projectMember.custom_role_ids,
      job_role_ids: projectMember.job_role_ids,
      inherited_role_ids: projectMember.inherited_role_ids,
      role_template_ids: projectMember.role_template_ids,
      role_sources: projectMember.role_sources,
      member: {
        ...userDetails,
        joining_date: projectMember.created_at ?? undefined,
      },
      created_at: projectMember.created_at,
    };
    return memberDetails;
  });

  /**
   * @description fetch the list of all the members of a project
   * @param workspaceSlug
   * @param projectId
   */
  fetchProjectMembers = async (workspaceSlug: string, projectId: string, clearExistingMembers: boolean = false) =>
    await this.projectMemberService.fetchProjectMembers(workspaceSlug, projectId).then((response) => {
      runInAction(() => {
        if (clearExistingMembers) {
          unset(this.projectMemberMap, [projectId]);
        }
        response.forEach((member) => {
          set(this.projectMemberMap, [projectId, member.member], member);
        });
        set(this.projectMemberFetchStatusMap, [projectId], true);
      });
      return response;
    });

  /**
   * @description bulk add members to a project
   * @param workspaceSlug
   * @param projectId
   * @param data
   * @returns Promise<TProjectMembership[]>
   */
  bulkAddMembersToProject = async (workspaceSlug: string, projectId: string, data: IProjectBulkAddFormData) =>
    await this.projectMemberService.bulkAddMembersToProject(workspaceSlug, projectId, data).then((response) => {
      runInAction(() => {
        response.forEach((member) => {
          set(this.projectMemberMap, [projectId, member.member], member);
        });
      });
      update(this.projectRoot.projectMap, [projectId, "members"], (memberIds) =>
        uniq([...memberIds, ...data.members.map((m) => m.member_id)])
      );
      this.projectRoot.projectMap[projectId].members = this.projectRoot.projectMap?.[projectId]?.members?.concat(
        data.members.map((m) => m.member_id)
      );

      return response;
    });

  /**
   * @description 整份替换成员的权限组和 / 或角色。自己的权限组变了要重拉自己的有效权限。
   * @param userId 用户 id
   */
  updateMemberAccess = async (
    workspaceSlug: string,
    projectId: string,
    userId: string,
    data: { custom_role_ids?: string[]; job_role_ids?: string[] }
  ): Promise<void> => {
    const memberDetails = this.getProjectMemberDetails(userId, projectId);
    if (!memberDetails?.id) throw new Error("Member not found");
    const before = { ...this.getProjectMembershipByUserId(userId, projectId) };

    runInAction(() => {
      if (data.custom_role_ids) set(this.projectMemberMap, [projectId, userId, "custom_role_ids"], data.custom_role_ids);
      if (data.job_role_ids) set(this.projectMemberMap, [projectId, userId, "job_role_ids"], data.job_role_ids);
    });

    try {
      const response = await this.projectMemberService.updateMemberAccess(
        workspaceSlug,
        projectId,
        memberDetails.id,
        data
      );
      runInAction(() => {
        set(this.projectMemberMap, [projectId, userId, "custom_role_ids"], response.custom_role_ids);
        set(this.projectMemberMap, [projectId, userId, "job_role_ids"], response.job_role_ids);
      });
      if (data.custom_role_ids && userId === this.rootStore.user.data?.id) {
        void this.rootStore.user.permission.fetchUserProjectInfo(workspaceSlug, projectId).catch(() => undefined);
      }
    } catch (error) {
      runInAction(() => {
        set(this.projectMemberMap, [projectId, userId, "custom_role_ids"], before.custom_role_ids);
        set(this.projectMemberMap, [projectId, userId, "job_role_ids"], before.job_role_ids);
      });
      throw error;
    }
  };

  /**
   * @description Handles the removal of a member from a project
   * @param projectId - The ID of the project to remove the member from
   * @param userId - The ID of the user to remove from the project
   */
  protected handleMemberRemoval = (projectId: string, userId: string) => {
    unset(this.projectMemberMap, [projectId, userId]);
    set(
      this.projectRoot.projectMap,
      [projectId, "members"],
      this.projectRoot.projectMap?.[projectId]?.members?.filter((memberId) => memberId !== userId)
    );
  };

  /**
   * @description Processes the removal of a member from a project
   * This abstract method handles the cleanup of member data from the project member map
   * @param projectId - The ID of the project to remove the member from
   * @param userId - The ID of the user to remove from the project
   */
  abstract processMemberRemoval: (projectId: string, userId: string) => void;

  /**
   * @description remove a member from a project
   * @param workspaceSlug
   * @param projectId
   * @param userId
   */
  removeMemberFromProject = async (workspaceSlug: string, projectId: string, userId: string) => {
    const memberDetails = this.getProjectMemberDetails(userId, projectId);
    if (!memberDetails || !memberDetails?.id) throw new Error("Member not found");
    await this.projectMemberService.deleteProjectMember(workspaceSlug, projectId, memberDetails?.id).then(() => {
      runInAction(() => {
        this.processMemberRemoval(projectId, userId);
      });
    });
  };

  /**
   * @description get project member preferences
   * @param projectId
   */
  getProjectUserProperties = computedFn(
    (projectId: string): IProjectUserPropertiesResponse | null => this.projectUserPropertiesMap[projectId] || null
  );

  /**
   * @description fetch project member preferences
   * @param workspaceSlug
   * @param projectId
   * @param data
   */
  fetchProjectUserProperties = async (
    workspaceSlug: string,
    projectId: string
  ): Promise<IProjectUserPropertiesResponse> => {
    const response = await this.projectService.getProjectUserProperties(workspaceSlug, projectId);
    runInAction(() => {
      set(this.projectUserPropertiesMap, [projectId], response);
    });
    return response;
  };

  /**
   * @description update project member preferences
   * @param workspaceSlug
   * @param projectId
   * @param data
   */
  updateProjectUserProperties = async (
    workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectUserPropertiesResponse>
  ): Promise<IProjectUserPropertiesResponse> => {
    const previousProperties = this.projectUserPropertiesMap[projectId];
    try {
      // Optimistically update the store
      runInAction(() => {
        set(this.projectUserPropertiesMap, [projectId], data);
      });
      const response = await this.projectService.updateProjectUserProperties(workspaceSlug, projectId, data);
      return response;
    } catch (error) {
      // Revert on error
      runInAction(() => {
        if (previousProperties) {
          set(this.projectUserPropertiesMap, [projectId], previousProperties);
        } else {
          unset(this.projectUserPropertiesMap, [projectId]);
        }
      });
      throw error;
    }
  };
}
