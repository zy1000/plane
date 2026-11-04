/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, set } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import {
  PROJECT_MEMBER_ACCESS,
  WORKSPACE_MEMBER_ACCESS,
  WORKSPACE_OWNER_ACCESS,
  WORKSPACE_SIDEBAR_DYNAMIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
} from "@plane/constants";
import type { IUserProjectsRole, IWorkspaceMemberMe, TProjectMembership } from "@plane/types";
// plane web imports
import { WorkspaceService } from "@/services/workspace.service";
import type { RootStore } from "@/plane-web/store/root.store";
// services
import projectMemberService from "@/services/project/project-member.service";
import userService from "@/services/user.service";

// derived services
const workspaceService = new WorkspaceService();

/** 工作项类型的类别名为「缺陷」时按 project.defect.* 判，其余按 project.issue.*（与后端 DEFECT_CATEGORY_NAME 一致） */
export const DEFECT_CATEGORY_NAME = "缺陷";

/** 判工作项权限需要的类型信息：类别决定模块，id / library_type_id 用来比对权限组的类型限定 */
export type TIssueTypeLike =
  | { id?: string | null; category_name?: string | null; library_type_id?: string | null }
  | null
  | undefined;

export type TIssuePermissionAction = "view" | "create" | "edit" | "delete" | "archive" | "import" | "export";

/** 只有工作项 / 缺陷有这些动作（缺陷没有单独的归档 / 导入 / 导出，跟工作项走） */
const DEFECT_ACTIONS = new Set<TIssuePermissionAction>(["view", "create", "edit", "delete"]);

export interface IBaseUserPermissionStore {
  loader: boolean;
  // observables
  workspaceUserInfo: Record<string, IWorkspaceMemberMe>; // workspaceSlug -> IWorkspaceMemberMe
  workspacePermissionKeys: Record<string, string[]>; // workspaceSlug -> permission keys
  projectUserInfo: Record<string, Record<string, TProjectMembership>>; // workspaceSlug -> projectId -> TProjectMembership
  workspaceProjectsPermissions: Record<string, IUserProjectsRole>; // workspaceSlug -> { projectId: {accessible, member} }（能进的项目）
  // computed helpers
  workspaceInfoBySlug: (workspaceSlug: string) => IWorkspaceMemberMe | undefined;
  getWorkspacePermissionKeysByWorkspaceSlug: (workspaceSlug: string) => string[];
  /** 能进的项目 id（成员、负责人等直通身份、工作区权限组白名单）。名字沿用，语义是「能进」不是「已加入」 */
  getJoinedProjectIdsByWorkspaceSlug: (workspaceSlug: string) => string[];
  /** 成员表里有自己的项目 id（侧栏「我的项目」这种只看真成员的地方用） */
  getMemberProjectIdsByWorkspaceSlug: (workspaceSlug: string) => string[];
  getProjectPermissionKeysByWorkspaceSlugAndProjectId: (workspaceSlug: string, projectId?: string) => string[];
  /** {key: [不适用的工作项类型 id]}，只有工作项 / 缺陷的新建、编辑、删除会出现 */
  getProjectTypeLimits: (workspaceSlug: string, projectId?: string) => Record<string, string[]>;
  fetchWorkspaceLevelProjectEntities: (workspaceSlug: string, projectId: string) => void;
  isWorkspaceMember: (workspaceSlug?: string) => boolean;
  isWorkspaceOwner: (workspaceSlug?: string) => boolean;
  /** 能进这个项目：成员、直通身份，或项目在自己某个工作区权限组的白名单里（白名单访客）。名字沿用，70 多处在用 */
  isProjectMember: (workspaceSlug?: string, projectId?: string) => boolean;
  /** 成员表里真有自己 */
  isProjectJoined: (workspaceSlug?: string, projectId?: string) => boolean;
  /** 任一 key（或成员身份类访问条件，见 @plane/constants permission-access）满足即可 */
  allowProjectPermissionKeys: (permissionKeys: string[], workspaceSlug?: string, projectId?: string) => boolean;
  allowWorkspacePermissionKeys: (permissionKeys: string[], workspaceSlug?: string) => boolean;
  /** 工作项 / 缺陷的动作：按类型类别选模块，再看类型限定。不传类型按工作项判 */
  allowIssuePermission: (
    action: TIssuePermissionAction,
    issueType?: TIssueTypeLike,
    workspaceSlug?: string,
    projectId?: string
  ) => boolean;
  // actions
  fetchUserWorkspaceInfo: (workspaceSlug: string) => Promise<IWorkspaceMemberMe>;
  fetchWorkspacePermissionKeys: (workspaceSlug: string) => Promise<string[]>;
  leaveWorkspace: (workspaceSlug: string) => Promise<void>;
  fetchUserProjectInfo: (workspaceSlug: string, projectId: string) => Promise<TProjectMembership>;
  fetchUserProjectPermissions: (workspaceSlug: string) => Promise<IUserProjectsRole>;
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

  getWorkspacePermissionKeysByWorkspaceSlug = computedFn((workspaceSlug: string): string[] => {
    if (!workspaceSlug) return [];
    return this.workspacePermissionKeys[workspaceSlug] ?? [];
  });

  getJoinedProjectIdsByWorkspaceSlug = computedFn((workspaceSlug: string): string[] => {
    if (!workspaceSlug) return [];
    const projects = this.workspaceProjectsPermissions[workspaceSlug] ?? {};
    return Object.keys(projects).filter((projectId) => Boolean(projects[projectId]?.accessible));
  });

  getMemberProjectIdsByWorkspaceSlug = computedFn((workspaceSlug: string): string[] => {
    if (!workspaceSlug) return [];
    const projects = this.workspaceProjectsPermissions[workspaceSlug] ?? {};
    return Object.keys(projects).filter((projectId) => Boolean(projects[projectId]?.member));
  });

  /** 进入过的项目有完整 key（project-members/me）；没进过的退回项目列表接口带的那几个 key */
  getProjectPermissionKeysByWorkspaceSlugAndProjectId = computedFn(
    (workspaceSlug: string, projectId?: string): string[] => {
      if (!workspaceSlug || !projectId) return [];
      const membership = this.projectUserInfo?.[workspaceSlug]?.[projectId];
      if (membership?.permission_keys) return membership.permission_keys;
      return this.store.projectRoot.project.projectMap?.[projectId]?.permission_keys ?? [];
    }
  );

  getProjectTypeLimits = computedFn((workspaceSlug: string, projectId?: string): Record<string, string[]> => {
    if (!workspaceSlug || !projectId) return {};
    return this.projectUserInfo?.[workspaceSlug]?.[projectId]?.type_limits ?? {};
  });

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

  // membership helpers
  isWorkspaceMember = (workspaceSlug?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    if (!resolvedWorkspaceSlug) return false;
    return Boolean(this.workspaceInfoBySlug(resolvedWorkspaceSlug));
  };

  isWorkspaceOwner = (workspaceSlug?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    if (!resolvedWorkspaceSlug) return false;
    const workspace = this.store.workspaceRoot.getWorkspaceBySlug(resolvedWorkspaceSlug);
    const currentUserId = this.store.user.data?.id;
    return Boolean(workspace?.owner?.id && currentUserId && workspace.owner.id === currentUserId);
  };

  isProjectMember = (workspaceSlug?: string, projectId?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    const resolvedProjectId = projectId ?? this.store.router.projectId;
    if (!resolvedWorkspaceSlug || !resolvedProjectId) return false;
    if (this.workspaceProjectsPermissions?.[resolvedWorkspaceSlug]?.[resolvedProjectId]?.accessible) return true;
    if (this.projectUserInfo?.[resolvedWorkspaceSlug]?.[resolvedProjectId]) return true;
    return Boolean(this.store.projectRoot.project.projectMap?.[resolvedProjectId]?.is_member);
  };

  isProjectJoined = (workspaceSlug?: string, projectId?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    const resolvedProjectId = projectId ?? this.store.router.projectId;
    if (!resolvedWorkspaceSlug || !resolvedProjectId) return false;
    if (this.workspaceProjectsPermissions?.[resolvedWorkspaceSlug]?.[resolvedProjectId]?.member) return true;
    // project-members/me：成员表里有行才有 id，白名单访客是 null
    if (this.projectUserInfo?.[resolvedWorkspaceSlug]?.[resolvedProjectId]?.id) return true;
    return Boolean(this.store.projectRoot.project.projectMap?.[resolvedProjectId]?.is_member);
  };

  // action helpers
  allowProjectPermissionKeys = (permissionKeys: string[], workspaceSlug?: string, projectId?: string): boolean => {
    const { workspaceSlug: currentWorkspaceSlug, projectId: currentProjectId } = this.store.router;
    const resolvedWorkspaceSlug = workspaceSlug ?? currentWorkspaceSlug;
    const resolvedProjectId = projectId ?? currentProjectId;

    if (!resolvedWorkspaceSlug || !resolvedProjectId || permissionKeys.length === 0) return false;

    const currentPermissionKeys = this.getProjectPermissionKeysByWorkspaceSlugAndProjectId(
      resolvedWorkspaceSlug,
      resolvedProjectId
    );

    return permissionKeys.some((key) => {
      if (key === PROJECT_MEMBER_ACCESS) return this.isProjectMember(resolvedWorkspaceSlug, resolvedProjectId);
      if (key === WORKSPACE_MEMBER_ACCESS) return this.isWorkspaceMember(resolvedWorkspaceSlug);
      if (key === WORKSPACE_OWNER_ACCESS) return this.isWorkspaceOwner(resolvedWorkspaceSlug);
      return currentPermissionKeys.includes(key);
    });
  };

  allowWorkspacePermissionKeys = (permissionKeys: string[], workspaceSlug?: string): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    if (!resolvedWorkspaceSlug || permissionKeys.length === 0) return false;
    const currentPermissionKeys = this.getWorkspacePermissionKeysByWorkspaceSlug(resolvedWorkspaceSlug);
    return permissionKeys.some((key) => {
      if (key === WORKSPACE_MEMBER_ACCESS) return this.isWorkspaceMember(resolvedWorkspaceSlug);
      if (key === WORKSPACE_OWNER_ACCESS) return this.isWorkspaceOwner(resolvedWorkspaceSlug);
      if (key === PROJECT_MEMBER_ACCESS) return false;
      return currentPermissionKeys.includes(key);
    });
  };

  allowIssuePermission = (
    action: TIssuePermissionAction,
    issueType?: TIssueTypeLike,
    workspaceSlug?: string,
    projectId?: string
  ): boolean => {
    const resolvedWorkspaceSlug = workspaceSlug ?? this.store.router.workspaceSlug;
    const resolvedProjectId = projectId ?? this.store.router.projectId;
    if (!resolvedWorkspaceSlug || !resolvedProjectId) return false;
    const isDefect = issueType?.category_name === DEFECT_CATEGORY_NAME && DEFECT_ACTIONS.has(action);
    const key = `project.${isDefect ? "defect" : "issue"}.${action}`;
    if (!this.allowProjectPermissionKeys([key], resolvedWorkspaceSlug, resolvedProjectId)) return false;
    const excluded = this.getProjectTypeLimits(resolvedWorkspaceSlug, resolvedProjectId)[key];
    if (!excluded?.length || !issueType) return true;
    return ![issueType.id, issueType.library_type_id].some((typeId) => typeId && excluded.includes(typeId));
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
          set(this.workspaceProjectsPermissions, [workspaceSlug, projectId], {
            accessible: true,
            member: Boolean(response.id),
          });
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
