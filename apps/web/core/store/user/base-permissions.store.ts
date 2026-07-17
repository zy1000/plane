/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type { TUserPermissions, TUserPermissionsLevel } from "@plane/constants";
import {
  EUserPermissions,
  EUserPermissionsLevel,
  WORKSPACE_ANALYTICS_EXPORT_PERMISSION_KEY,
  WORKSPACE_ANALYTICS_MANAGE_SAVED_VIEW_PERMISSION_KEY,
  WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY,
  WORKSPACE_GROUP_CREATE_PERMISSION_KEY,
  WORKSPACE_GROUP_DELETE_PERMISSION_KEY,
  WORKSPACE_GROUP_EDIT_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY,
  WORKSPACE_GROUP_VIEW_PERMISSION_KEY,
  WORKSPACE_MEMBER_EDIT_PERMISSION_KEY,
  WORKSPACE_MEMBER_INVITE_PERMISSION_KEY,
  WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY,
  WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY,
  WORKSPACE_MEMBER_VIEW_PERMISSION_KEY,
  WORKSPACE_PROJECT_CREATE_PERMISSION_KEY,
  WORKSPACE_PROJECT_VIEW_PERMISSION_KEY,
  WORKSPACE_ROLE_CREATE_PERMISSION_KEY,
  WORKSPACE_ROLE_DELETE_PERMISSION_KEY,
  WORKSPACE_ROLE_EDIT_PERMISSION_KEY,
  WORKSPACE_ROLE_VIEW_PERMISSION_KEY,
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
  WORKSPACE_SETTINGS_DELETE_PERMISSION_KEY,
  WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY,
  WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY,
  WORKSPACE_USER_PROFILE_EXPORT_PERMISSION_KEY,
  WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import type { EUserProjectRoles, IUserProjectsRole, IWorkspaceMemberMe, TProjectMembership } from "@plane/types";
import { EUserWorkspaceRoles } from "@plane/types";
// plane web imports
import { WorkspaceService } from "@/services/workspace.service";
import type { RootStore } from "@/plane-web/store/root.store";
// services
import projectMemberService from "@/services/project/project-member.service";
import userService from "@/services/user.service";

// derived services
const workspaceService = new WorkspaceService();

const WORKSPACE_ALL_PERMISSION_KEYS = [
  WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY,
  WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY,
  WORKSPACE_SETTINGS_DELETE_PERMISSION_KEY,
  WORKSPACE_MEMBER_VIEW_PERMISSION_KEY,
  WORKSPACE_MEMBER_INVITE_PERMISSION_KEY,
  WORKSPACE_MEMBER_EDIT_PERMISSION_KEY,
  WORKSPACE_MEMBER_REMOVE_PERMISSION_KEY,
  WORKSPACE_MEMBER_LEAVE_PERMISSION_KEY,
  WORKSPACE_ROLE_VIEW_PERMISSION_KEY,
  WORKSPACE_ROLE_CREATE_PERMISSION_KEY,
  WORKSPACE_ROLE_EDIT_PERMISSION_KEY,
  WORKSPACE_ROLE_DELETE_PERMISSION_KEY,
  WORKSPACE_GROUP_VIEW_PERMISSION_KEY,
  WORKSPACE_GROUP_CREATE_PERMISSION_KEY,
  WORKSPACE_GROUP_EDIT_PERMISSION_KEY,
  WORKSPACE_GROUP_DELETE_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY,
  WORKSPACE_PROJECT_VIEW_PERMISSION_KEY,
  WORKSPACE_PROJECT_CREATE_PERMISSION_KEY,
  WORKSPACE_USER_PROFILE_VIEW_PERMISSION_KEY,
  WORKSPACE_USER_PROFILE_EXPORT_PERMISSION_KEY,
  WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY,
  WORKSPACE_ANALYTICS_MANAGE_SAVED_VIEW_PERMISSION_KEY,
  WORKSPACE_ANALYTICS_EXPORT_PERMISSION_KEY,
] as const;

type ETempUserRole = TUserPermissions | EUserWorkspaceRoles | EUserProjectRoles; // TODO: Remove this once we have migrated user permissions to enums to plane constants package

export interface IBaseUserPermissionStore {
  loader: boolean;
  // observables
  workspaceUserInfo: Record<string, IWorkspaceMemberMe>; // workspaceSlug -> IWorkspaceMemberMe
  workspacePermissionKeys: Record<string, string[]>; // workspaceSlug -> permission keys
  projectUserInfo: Record<string, Record<string, TProjectMembership>>; // workspaceSlug -> projectId -> TProjectMembership
  workspaceProjectsPermissions: Record<string, IUserProjectsRole>; // workspaceSlug -> IUserProjectsRole
  // computed helpers
  workspaceInfoBySlug: (workspaceSlug: string) => IWorkspaceMemberMe | undefined;
  getWorkspaceRoleByWorkspaceSlug: (workspaceSlug: string) => TUserPermissions | EUserWorkspaceRoles | undefined;
  getWorkspacePermissionKeysByWorkspaceSlug: (workspaceSlug: string) => string[];
  getProjectRolesByWorkspaceSlug: (workspaceSlug: string) => IUserProjectsRole;
  getProjectRoleByWorkspaceSlugAndProjectId: (
    workspaceSlug: string,
    projectId?: string
  ) => EUserPermissions | undefined;
  getProjectPermissionKeysByWorkspaceSlugAndProjectId: (workspaceSlug: string, projectId?: string) => string[];
  fetchWorkspaceLevelProjectEntities: (workspaceSlug: string, projectId: string) => void;
  allowPermissions: (
    allowPermissions: ETempUserRole[],
    level: TUserPermissionsLevel,
    workspaceSlug?: string,
    projectId?: string,
    onPermissionAllowed?: () => boolean
  ) => boolean;
  allowProjectPermissionKeys: (permissionKeys: string[], workspaceSlug?: string, projectId?: string) => boolean;
  allowWorkspacePermissionKeys: (permissionKeys: string[], workspaceSlug?: string) => boolean;
  hasAllWorkspacePermissions: (workspaceSlug?: string) => boolean;
  // actions
  fetchUserWorkspaceInfo: (workspaceSlug: string) => Promise<IWorkspaceMemberMe>;
  fetchWorkspacePermissionKeys: (workspaceSlug: string) => Promise<string[]>;
  leaveWorkspace: (workspaceSlug: string) => Promise<void>;
  fetchUserProjectInfo: (workspaceSlug: string, projectId: string) => Promise<TProjectMembership>;
  fetchUserProjectPermissions: (workspaceSlug: string) => Promise<IUserProjectsRole>;
  joinProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  leaveProject: (workspaceSlug: string, projectId: string) => Promise<void>;
  hasPageAccess: (workspaceSlug: string, key: string) => boolean;
}

/**
 * @description This store is used to handle permission layer for the currently logged user.
 * It manages workspace and project level permissions, roles and access control.
 */
export abstract class BaseUserPermissionStore implements IBaseUserPermissionStore {
  loader: boolean = false;
  // constants
  workspaceUserInfo: Record<string, IWorkspaceMemberMe> = {};
  workspacePermissionKeys: Record<string, string[]> = {};
  projectUserInfo: Record<string, Record<string, TProjectMembership>> = {};
  workspaceProjectsPermissions: Record<string, IUserProjectsRole> = {};
  // observables

  constructor(protected store: RootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      workspaceUserInfo: observable,
      workspacePermissionKeys: observable,
      projectUserInfo: observable,
      workspaceProjectsPermissions: observable,
      // computed
      // actions
      fetchUserWorkspaceInfo: action,
      fetchWorkspacePermissionKeys: action,
      leaveWorkspace: action,
      fetchUserProjectInfo: action,
      fetchUserProjectPermissions: action,
      joinProject: action,
      leaveProject: action,
    });
  }

  // computed helpers
  /**
   * @description Returns the current workspace information
   * @param { string } workspaceSlug
   * @returns { IWorkspaceMemberMe | undefined }
   */
  workspaceInfoBySlug = computedFn((workspaceSlug: string): IWorkspaceMemberMe | undefined => {
    if (!workspaceSlug) return undefined;
    return this.workspaceUserInfo[workspaceSlug] || undefined;
  });

  /**
   * @description Returns the workspace role by slug
   * @param { string } workspaceSlug
   * @returns { TUserPermissions | EUserWorkspaceRoles | undefined }
   */
  getWorkspaceRoleByWorkspaceSlug = computedFn(
    (workspaceSlug: string): TUserPermissions | EUserWorkspaceRoles | undefined => {
      if (!workspaceSlug) return undefined;
      return this.workspaceUserInfo[workspaceSlug]?.role as TUserPermissions | EUserWorkspaceRoles | undefined;
    }
  );

  getWorkspacePermissionKeysByWorkspaceSlug = computedFn((workspaceSlug: string): string[] => {
    if (!workspaceSlug) return [];
    return this.workspacePermissionKeys[workspaceSlug] ?? [];
  });

  /**
   * @description Returns the project membership permission
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { EUserPermissions | undefined }
   */
  protected getProjectRole = computedFn((workspaceSlug: string, projectId?: string): EUserPermissions | undefined => {
    if (!workspaceSlug || !projectId) return undefined;
    const projectRole = this.workspaceProjectsPermissions?.[workspaceSlug]?.[projectId];
    if (!projectRole) return undefined;
    return projectRole;
  });

  /**
   * @description Returns the project permissions by workspace slug
   * @param { string } workspaceSlug
   * @returns { IUserProjectsRole }
   */
  getProjectRolesByWorkspaceSlug = computedFn((workspaceSlug: string): IUserProjectsRole => {
    const projectPermissions = this.workspaceProjectsPermissions[workspaceSlug] || {};
    return Object.keys(projectPermissions).reduce((acc, projectId) => {
      const projectRole = this.getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
      if (projectRole) {
        acc[projectId] = projectRole;
      }
      return acc;
    }, {} as IUserProjectsRole);
  });

  /**
   * @description Returns the current project permissions
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { EUserPermissions | undefined }
   */
  abstract getProjectRoleByWorkspaceSlugAndProjectId: (
    workspaceSlug: string,
    projectId?: string
  ) => EUserPermissions | undefined;

  getProjectPermissionKeysByWorkspaceSlugAndProjectId = computedFn(
    (workspaceSlug: string, projectId?: string): string[] => {
      if (!workspaceSlug || !projectId) return [];
      return this.projectUserInfo?.[workspaceSlug]?.[projectId]?.permission_keys ?? [];
    }
  );

  /**
   * @description Fetches project-level entities that are not automatically loaded by the project wrapper.
   * This is used when joining a project to ensure all necessary workspace-level project data is available.
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  abstract fetchWorkspaceLevelProjectEntities: (workspaceSlug: string, projectId: string) => void;

  /**
   * @description Returns whether the user has the permission to access a page
   * @param { string } page
   * @returns { boolean }
   */
  hasPageAccess = computedFn((workspaceSlug: string, key: string): boolean => {
    if (!workspaceSlug || !key) return false;
    const settings =
      WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS.find((item) => item.key === key) ??
      Object.values(WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS).find((item) => item.key === key);
    if (settings) {
      if (settings.permissionKeys?.length) {
        return this.allowWorkspacePermissionKeys(settings.permissionKeys, workspaceSlug);
      }
      return Boolean(this.workspaceInfoBySlug(workspaceSlug));
    }
    return false;
  });

  // action helpers
  /**
   * @description Returns whether the user has the permission to perform an action
   * @param { TUserPermissions[] } allowPermissions
   * @param { TUserPermissionsLevel } level
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @param { () => boolean } onPermissionAllowed
   * @returns { boolean }
   */
  allowPermissions = (
    allowPermissions: ETempUserRole[],
    level: TUserPermissionsLevel,
    workspaceSlug?: string,
    projectId?: string,
    onPermissionAllowed?: () => boolean
  ): boolean => {
    const { workspaceSlug: currentWorkspaceSlug, projectId: currentProjectId } = this.store.router;
    if (!workspaceSlug) workspaceSlug = currentWorkspaceSlug;
    if (!projectId) projectId = currentProjectId;

    let currentUserRole: TUserPermissions | undefined = undefined;

    if (level === EUserPermissionsLevel.WORKSPACE) {
      if (!workspaceSlug || !this.workspaceInfoBySlug(workspaceSlug)) return false;
      return this.hasAllWorkspacePermissions(workspaceSlug);
    }

    if (level === EUserPermissionsLevel.PROJECT) {
      currentUserRole = (workspaceSlug &&
        projectId &&
        this.getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId)) as EUserPermissions | undefined;
    }

    if (typeof currentUserRole === "string") {
      currentUserRole = parseInt(currentUserRole);
    }

    if (currentUserRole && typeof currentUserRole === "number" && allowPermissions.includes(currentUserRole)) {
      if (onPermissionAllowed) {
        return onPermissionAllowed();
      } else {
        return true;
      }
    }

    return false;
  };

  allowProjectPermissionKeys = (permissionKeys: string[], workspaceSlug?: string, projectId?: string): boolean => {
    const { workspaceSlug: currentWorkspaceSlug, projectId: currentProjectId } = this.store.router;
    const resolvedWorkspaceSlug = workspaceSlug ?? currentWorkspaceSlug;
    const resolvedProjectId = projectId ?? currentProjectId;

    if (!resolvedWorkspaceSlug || !resolvedProjectId || permissionKeys.length === 0) return false;

    const currentPermissionKeys = this.getProjectPermissionKeysByWorkspaceSlugAndProjectId(
      resolvedWorkspaceSlug,
      resolvedProjectId
    );

    return permissionKeys.some((key) => currentPermissionKeys.includes(key));
  };

  allowWorkspacePermissionKeys = (permissionKeys: string[], workspaceSlug?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    if (!resolvedWorkspaceSlug || permissionKeys.length === 0) return false;
    const currentPermissionKeys = this.getWorkspacePermissionKeysByWorkspaceSlug(resolvedWorkspaceSlug);
    return permissionKeys.some((key) => currentPermissionKeys.includes(key));
  };

  hasAllWorkspacePermissions = (workspaceSlug?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    if (!resolvedWorkspaceSlug || !this.workspaceInfoBySlug(resolvedWorkspaceSlug)) return false;
    const currentPermissionKeys = this.getWorkspacePermissionKeysByWorkspaceSlug(resolvedWorkspaceSlug);
    return WORKSPACE_ALL_PERMISSION_KEYS.every((permissionKey) => currentPermissionKeys.includes(permissionKey));
  };

  // actions
  /**
   * @description Fetches the user's workspace information
   * @param { string } workspaceSlug
   * @returns { Promise<IWorkspaceMemberMe | undefined> }
   */
  fetchUserWorkspaceInfo = async (workspaceSlug: string): Promise<IWorkspaceMemberMe> => {
    try {
      this.loader = true;
      const [response, permissionKeys] = await Promise.all([
        workspaceService.workspaceMemberMe(workspaceSlug),
        workspaceService.fetchMyWorkspacePermissionKeys(workspaceSlug),
      ]);
      if (response) {
        runInAction(() => {
          set(this.workspaceUserInfo, [workspaceSlug], response);
          set(this.workspacePermissionKeys, [workspaceSlug], permissionKeys);
          this.loader = false;
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user workspace information", error);
      this.loader = false;
      throw error;
    }
  };

  fetchWorkspacePermissionKeys = async (workspaceSlug: string): Promise<string[]> => {
    try {
      const permissionKeys = await workspaceService.fetchMyWorkspacePermissionKeys(workspaceSlug);
      runInAction(() => {
        set(this.workspacePermissionKeys, [workspaceSlug], permissionKeys);
      });
      return permissionKeys;
    } catch (error) {
      console.error("Error fetching workspace permission keys", error);
      throw error;
    }
  };

  /**
   * @description Leaves a workspace
   * @param { string } workspaceSlug
   * @returns { Promise<void | undefined> }
   */
  leaveWorkspace = async (workspaceSlug: string): Promise<void> => {
    try {
      await userService.leaveWorkspace(workspaceSlug);
      runInAction(() => {
        unset(this.workspaceUserInfo, workspaceSlug);
        unset(this.workspacePermissionKeys, workspaceSlug);
        unset(this.projectUserInfo, workspaceSlug);
        unset(this.workspaceProjectsPermissions, workspaceSlug);
      });
    } catch (error) {
      console.error("Error user leaving the workspace", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project information
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<TProjectMembership | undefined> }
   */
  fetchUserProjectInfo = async (workspaceSlug: string, projectId: string): Promise<TProjectMembership> => {
    try {
      const response = await projectMemberService.projectMemberMe(workspaceSlug, projectId);
      if (response) {
        runInAction(() => {
          set(this.projectUserInfo, [workspaceSlug, projectId], response);
          set(this.workspaceProjectsPermissions, [workspaceSlug, projectId], response.role);
        });
      }
      return response;
    } catch (error) {
      console.error("Error fetching user project information", error);
      throw error;
    }
  };

  /**
   * @description Fetches the user's project permissions
   * @param { string } workspaceSlug
   * @returns { Promise<IUserProjectsRole | undefined> }
   */
  fetchUserProjectPermissions = async (workspaceSlug: string): Promise<IUserProjectsRole> => {
    try {
      const response = await workspaceService.getWorkspaceUserProjectsRole(workspaceSlug);
      runInAction(() => {
        set(this.workspaceProjectsPermissions, [workspaceSlug], response);
      });
      return response;
    } catch (error) {
      console.error("Error fetching user project permissions", error);
      throw error;
    }
  };

  /**
   * @description Joins a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  joinProject = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      const response = await userService.joinProject(workspaceSlug, [projectId]);
      const projectMemberRole = this.getWorkspaceRoleByWorkspaceSlug(workspaceSlug) ?? EUserPermissions.MEMBER;
      if (response) {
        runInAction(() => {
          set(this.workspaceProjectsPermissions, [workspaceSlug, projectId], projectMemberRole);
        });
        void this.fetchWorkspaceLevelProjectEntities(workspaceSlug, projectId);
      }
    } catch (error) {
      console.error("Error user joining the project", error);
      throw error;
    }
  };

  /**
   * @description Leaves a project
   * @param { string } workspaceSlug
   * @param { string } projectId
   * @returns { Promise<void> }
   */
  leaveProject = async (workspaceSlug: string, projectId: string): Promise<void> => {
    try {
      await userService.leaveProject(workspaceSlug, projectId);
      runInAction(() => {
        unset(this.workspaceProjectsPermissions, [workspaceSlug, projectId]);
        unset(this.projectUserInfo, [workspaceSlug, projectId]);
        unset(this.store.projectRoot.project.projectMap, [projectId]);
      });
    } catch (error) {
      console.error("Error user leaving the project", error);
      throw error;
    }
  };
}
