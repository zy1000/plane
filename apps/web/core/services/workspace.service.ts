/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IWorkspace,
  IWorkspaceMemberMe,
  IWorkspaceMember,
  IWorkspaceMemberInvitation,
  ILastActiveWorkspaceDetails,
  IWorkspaceSearchResults,
  IProductUpdateResponse,
  IWorkspaceBulkInviteFormData,
  TWorkspaceInvitableUser,
  IWorkspaceViewProps,
  IUserProjectsRole,
  IWorkspaceView,
  TIssuesResponse,
  TLink,
  TSearchResponse,
  TSearchEntityRequestPayload,
  TWidgetEntityData,
  TActivityEntityData,
  IWorkspaceSidebarNavigationItem,
  IWorkspaceSidebarNavigation,
  IWorkspaceUserPropertiesResponse,
  IWorkspaceGroup,
  IWorkspaceGroupMember,
  IWorkspaceGroupRole,
  IWorkspaceMyAccess,
  IMyAccessProjectPermissions,
  IPermissionGroup,
  IPermissionGroupDetail,
  TPermissionGroupKind,
  TPermissionGroupContent,
  TPermissionGroupTemplateProjects,
  TDataScope,
  TDataScopeEntry,
  TDataScopePreview,
} from "@plane/types";
import type { TNetworkZone } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class WorkspaceService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async userWorkspaces(): Promise<IWorkspace[]> {
    return this.get("/api/users/me/workspaces/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkspace(workspaceSlug: string): Promise<IWorkspace> {
    return this.get(`/api/workspaces/${workspaceSlug}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async createWorkspace(data: Partial<IWorkspace>): Promise<IWorkspace> {
    return this.post("/api/workspaces/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspace(workspaceSlug: string, data: Partial<IWorkspace>): Promise<IWorkspace> {
    return this.patch(`/api/workspaces/${workspaceSlug}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspace(workspaceSlug: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async inviteWorkspace(workspaceSlug: string, data: IWorkspaceBulkInviteFormData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/invitations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchInvitableUsers(
    workspaceSlug: string,
    params: { search: string }
  ): Promise<TWorkspaceInvitableUser[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/invitable-users/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async joinWorkspace(workspaceSlug: string, invitationId: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/invitations/${invitationId}/join/`, data, {
      headers: {},
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async joinWorkspaces(data: any): Promise<any> {
    return this.post("/api/users/me/workspaces/invitations/", data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLastActiveWorkspaceAndProjects(): Promise<ILastActiveWorkspaceDetails> {
    return this.get("/api/users/last-visited-workspace/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async userWorkspaceInvitations(): Promise<IWorkspaceMemberInvitation[]> {
    return this.get("/api/users/me/workspaces/invitations/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async workspaceMemberMe(workspaceSlug: string): Promise<IWorkspaceMemberMe> {
    return this.get(`/api/workspaces/${workspaceSlug}/workspace-members/me/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async fetchMyWorkspacePermissionKeys(workspaceSlug: string): Promise<string[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/my-permission-keys/`)
      .then((response) => (response?.data?.permission_keys as string[]) ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 项目权限切到某个项目：工作区组的项目 key + 本项目绑定的模板 / 本项目组，带来源 */
  async fetchMyWorkspaceProjectAccess(workspaceSlug: string, projectId: string): Promise<IMyAccessProjectPermissions> {
    return this.get(`/api/workspaces/${workspaceSlug}/my-access/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchMyWorkspaceAccess(workspaceSlug: string): Promise<IWorkspaceMyAccess> {
    return this.get(`/api/workspaces/${workspaceSlug}/my-access/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceView(workspaceSlug: string, data: { view_props: IWorkspaceViewProps }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/workspace-views/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchWorkspaceMembers(workspaceSlug: string): Promise<IWorkspaceMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceMember(
    workspaceSlug: string,
    memberId: string,
    data: Partial<IWorkspaceMember>
  ): Promise<IWorkspaceMember> {
    return this.patch(`/api/workspaces/${workspaceSlug}/members/${memberId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchWorkspaceMemberCustomRoles(
    workspaceSlug: string,
    memberId: string
  ): Promise<{ custom_role_ids: string[]; job_role_ids: string[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/members/${memberId}/custom-roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 管理员改成员的大网 / 小网归属；后端会踢掉此人全部会话。memberId 是 WorkspaceMember 主键 */
  async updateWorkspaceMemberNetworkZone(
    workspaceSlug: string,
    memberId: string,
    networkZone: TNetworkZone | null
  ): Promise<{ id: string; network_zone: TNetworkZone | null }> {
    return this.patch(`/api/workspaces/${workspaceSlug}/members/${memberId}/network-zone/`, {
      network_zone: networkZone,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整份替换成员的权限组和 / 或角色（job_role）；没传的那一项后端不动 */
  async updateWorkspaceMemberCustomRoles(
    workspaceSlug: string,
    memberId: string,
    payload: { custom_role_ids?: string[]; job_role_ids?: string[] }
  ): Promise<{ custom_role_ids: string[]; job_role_ids: string[] }> {
    return this.put(`/api/workspaces/${workspaceSlug}/members/${memberId}/custom-roles/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceMemberGroups(
    workspaceSlug: string,
    memberId: string,
    groupIds: string[]
  ): Promise<{ group_ids: string[]; group_role_ids: string[] }> {
    return this.put(`/api/workspaces/${workspaceSlug}/members/${memberId}/groups/`, {
      group_ids: groupIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceMember(workspaceSlug: string, memberId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/members/${memberId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async workspaceInvitations(workspaceSlug: string): Promise<IWorkspaceMemberInvitation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/invitations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkspaceInvitation(workspaceSlug: string, invitationId: string): Promise<IWorkspaceMemberInvitation> {
    return this.get(`/api/workspaces/${workspaceSlug}/invitations/${invitationId}/join/`, { headers: {} })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceInvitation(
    workspaceSlug: string,
    invitationId: string,
    data: Partial<IWorkspaceMember>
  ): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/invitations/${invitationId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceInvitations(workspaceSlug: string, invitationId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/invitations/${invitationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async workspaceSlugCheck(slug: string): Promise<any> {
    return this.get(`/api/workspace-slug-check/?slug=${slug}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async searchWorkspace(
    workspaceSlug: string,
    params: {
      project_id?: string;
      search: string;
      workspace_search: boolean;
    }
  ): Promise<IWorkspaceSearchResults> {
    return this.get(`/api/workspaces/${workspaceSlug}/search/`, {
      params,
    })
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getProductUpdates(): Promise<IProductUpdateResponse[]> {
    return this.get("/api/release-notes/")
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createView(workspaceSlug: string, data: Partial<IWorkspaceView>): Promise<IWorkspaceView> {
    return this.post(`/api/workspaces/${workspaceSlug}/views/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateView(workspaceSlug: string, viewId: string, data: Partial<IWorkspaceView>): Promise<IWorkspaceView> {
    return this.patch(`/api/workspaces/${workspaceSlug}/views/${viewId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteView(workspaceSlug: string, viewId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getAllViews(workspaceSlug: string): Promise<IWorkspaceView[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/views/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getViewDetails(workspaceSlug: string, viewId: string): Promise<IWorkspaceView> {
    return this.get(`/api/workspaces/${workspaceSlug}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getViewIssues(workspaceSlug: string, params: any, config = {}): Promise<TIssuesResponse> {
    const path = params.expand?.includes("issue_relation")
      ? `/api/workspaces/${workspaceSlug}/issues-detail/`
      : `/api/workspaces/${workspaceSlug}/issues/`;
    return this.get(
      path,
      {
        params,
      },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getWorkspaceUserProjectsRole(workspaceSlug: string): Promise<IUserProjectsRole> {
    return this.get(`/api/users/me/workspaces/${workspaceSlug}/project-roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // quicklinks
  async fetchWorkspaceLinks(workspaceSlug: string): Promise<TLink[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/quick-links/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async createWorkspaceLink(workspaceSlug: string, data: Partial<TLink>): Promise<TLink> {
    return this.post(`/api/workspaces/${workspaceSlug}/quick-links/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateWorkspaceLink(workspaceSlug: string, linkId: string, data: Partial<TLink>): Promise<TLink> {
    return this.patch(`/api/workspaces/${workspaceSlug}/quick-links/${linkId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteWorkspaceLink(workspaceSlug: string, linkId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/quick-links/${linkId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async searchEntity(workspaceSlug: string, params: TSearchEntityRequestPayload): Promise<TSearchResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/entity-search/`, {
      params: {
        ...params,
        query_type: params.query_type.join(","),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // recents
  async fetchWorkspaceRecents(workspaceSlug: string, entity_name?: string): Promise<TActivityEntityData[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/recent-visits/`, {
      params: {
        entity_name,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  // widgets
  async fetchWorkspaceWidgets(workspaceSlug: string): Promise<TWidgetEntityData[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/home-preferences/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateWorkspaceWidget(
    workspaceSlug: string,
    widgetKey: string,
    data: Partial<TWidgetEntityData>
  ): Promise<TWidgetEntityData> {
    return this.patch(`/api/workspaces/${workspaceSlug}/home-preferences/${widgetKey}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async fetchSidebarNavigationPreferences(workspaceSlug: string): Promise<IWorkspaceSidebarNavigation> {
    return this.get(`/api/workspaces/${workspaceSlug}/sidebar-preferences/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateSidebarPreference(
    workspaceSlug: string,
    key: string,
    data: Partial<IWorkspaceSidebarNavigationItem>
  ): Promise<IWorkspaceSidebarNavigationItem> {
    return this.patch(`/api/workspaces/${workspaceSlug}/sidebar-preferences/${key}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async updateBulkSidebarPreferences(
    workspaceSlug: string,
    data: Array<{ key: string; is_pinned: boolean; sort_order: number }>
  ): Promise<IWorkspaceSidebarNavigation> {
    return this.patch(`/api/workspaces/${workspaceSlug}/sidebar-preferences/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async fetchWorkspaceFilters(workspaceSlug: string): Promise<IWorkspaceUserPropertiesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/user-properties/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchWorkspaceFilters(
    workspaceSlug: string,
    data: Partial<IWorkspaceUserPropertiesResponse>
  ): Promise<IWorkspaceUserPropertiesResponse> {
    return this.patch(`/api/workspaces/${workspaceSlug}/user-properties/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // workspace permission groups（后端 WorkspaceRole，按 kind 分 工作区权限组 / 项目权限模板 / 数据权限 三类）
  async fetchWorkspaceRoles(workspaceSlug: string, params?: { kind?: TPermissionGroupKind }): Promise<IPermissionGroup[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchWorkspaceRole(workspaceSlug: string, roleId: string): Promise<IPermissionGroup> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** kind 创建后不可改；copy_from：照同类型的另一个组建（工作区组 / 模板复制权限内容，数据权限复制白名单） */
  async createWorkspaceRole(
    workspaceSlug: string,
    data: { name: string; description?: string; kind: TPermissionGroupKind; copy_from?: string | null }
  ): Promise<IPermissionGroup> {
    return this.post(`/api/workspaces/${workspaceSlug}/roles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceRole(
    workspaceSlug: string,
    roleId: string,
    data: Partial<{ name: string; description: string }>
  ): Promise<IPermissionGroup> {
    return this.patch(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceRole(workspaceSlug: string, roleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/roles/${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchWorkspaceRolePermissions(workspaceSlug: string, roleId: string): Promise<IPermissionGroupDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整份替换权限内容（permission_keys + type_limits） */
  async updateWorkspaceRolePermissions(
    workspaceSlug: string,
    roleId: string,
    content: TPermissionGroupContent
  ): Promise<IPermissionGroupDetail> {
    return this.patch(`/api/workspaces/${workspaceSlug}/roles/${roleId}/permissions/`, content)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 工作区权限组的成员（用户 id）。「工作区成员」组返回全部活跃成员 */
  async fetchWorkspaceRoleMembers(workspaceSlug: string, roleId: string): Promise<{ member_ids: string[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addWorkspaceRoleMembers(
    workspaceSlug: string,
    roleId: string,
    userIds: string[]
  ): Promise<{ member_ids: string[] }> {
    return this.post(`/api/workspaces/${workspaceSlug}/roles/${roleId}/members/`, { member_ids: userIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceRoleMember(workspaceSlug: string, roleId: string, userId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/roles/${roleId}/members/${userId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 模板组的「引用项目」：白名单命中的项目，带已排除标记 */
  async fetchWorkspaceRoleTemplateProjects(
    workspaceSlug: string,
    roleId: string
  ): Promise<TPermissionGroupTemplateProjects> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/projects/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 项目不再引用这个模板（记排除、解绑项目里绑到它的人） */
  async excludeTemplateProject(workspaceSlug: string, roleId: string, projectId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/roles/${roleId}/projects/${projectId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从排除列表拿掉，项目还在白名单里就恢复引用 */
  async restoreTemplateProject(
    workspaceSlug: string,
    roleId: string,
    projectId: string
  ): Promise<TPermissionGroupTemplateProjects> {
    return this.put(`/api/workspaces/${workspaceSlug}/roles/${roleId}/projects/${projectId}/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchWorkspaceRoleDataScope(workspaceSlug: string, roleId: string): Promise<{ data_scope: TDataScope }> {
    return this.get(`/api/workspaces/${workspaceSlug}/roles/${roleId}/data-scope/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整份替换数据权限（项目 + 产品白名单） */
  async updateWorkspaceRoleDataScope(
    workspaceSlug: string,
    roleId: string,
    dataScope: TDataScope
  ): Promise<{ data_scope: TDataScope }> {
    return this.patch(`/api/workspaces/${workspaceSlug}/roles/${roleId}/data-scope/`, { data_scope: dataScope })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 编辑白名单时的实时预览：一段白名单现在命中多少 */
  async previewWorkspaceRoleDataScope(
    workspaceSlug: string,
    kind: "projects" | "products",
    entry: TDataScopeEntry
  ): Promise<TDataScopePreview> {
    return this.post(`/api/workspaces/${workspaceSlug}/roles/data-scope-preview/`, { kind, entry })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // workspace groups
  async fetchWorkspaceGroups(workspaceSlug: string): Promise<IWorkspaceGroup[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/groups/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createWorkspaceGroup(workspaceSlug: string, data: { name: string; description?: string }): Promise<IWorkspaceGroup> {
    return this.post(`/api/workspaces/${workspaceSlug}/groups/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateWorkspaceGroup(
    workspaceSlug: string,
    groupId: string,
    data: Partial<{ name: string; description: string }>
  ): Promise<IWorkspaceGroup> {
    return this.patch(`/api/workspaces/${workspaceSlug}/groups/${groupId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteWorkspaceGroup(workspaceSlug: string, groupId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/groups/${groupId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // workspace group members
  async fetchWorkspaceGroupMembers(workspaceSlug: string, groupId: string): Promise<IWorkspaceGroupMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/groups/${groupId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addWorkspaceGroupMember(workspaceSlug: string, groupId: string, memberId: string): Promise<IWorkspaceGroupMember> {
    return this.post(`/api/workspaces/${workspaceSlug}/groups/${groupId}/members/`, { member: memberId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceGroupMember(workspaceSlug: string, groupId: string, membershipId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/groups/${groupId}/members/${membershipId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // workspace group roles
  async fetchWorkspaceGroupRoles(workspaceSlug: string, groupId: string): Promise<IWorkspaceGroupRole[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/groups/${groupId}/roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addWorkspaceGroupRole(workspaceSlug: string, groupId: string, roleId: string): Promise<IWorkspaceGroupRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/groups/${groupId}/roles/`, { role: roleId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceGroupRole(workspaceSlug: string, groupId: string, groupRoleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/groups/${groupId}/roles/${groupRoleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
