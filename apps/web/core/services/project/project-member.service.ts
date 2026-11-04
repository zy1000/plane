/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { IProjectBulkAddFormData, TProjectMembership } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/** 成员的权限组（本项目权限组 id）与角色（数据字典 job_role 的值 id） */
export type TProjectMemberAccess = { custom_role_ids: string[]; job_role_ids: string[] };

export class ProjectMemberService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchProjectMembers(workspaceSlug: string, projectId: string): Promise<TProjectMembership[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bulkAddMembersToProject(
    workspaceSlug: string,
    projectId: string,
    data: IProjectBulkAddFormData
  ): Promise<TProjectMembership[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async projectMemberMe(workspaceSlug: string, projectId: string): Promise<TProjectMembership> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/project-members/me/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async getProjectMember(workspaceSlug: string, projectId: string, memberId: string): Promise<TProjectMembership> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${memberId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProjectMember(
    workspaceSlug: string,
    projectId: string,
    memberId: string,
    data: Partial<TProjectMembership>
  ): Promise<TProjectMembership> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${memberId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProjectMember(workspaceSlug: string, projectId: string, memberId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${memberId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 整份替换成员的权限组（custom_role_ids，可给模板 id）和 / 或角色（job_role_ids）；没传的那一项不动。
   * memberId 是项目成员行 id。
   */
  async updateMemberAccess(
    workspaceSlug: string,
    projectId: string,
    memberId: string,
    data: { custom_role_ids?: string[]; job_role_ids?: string[] }
  ): Promise<TProjectMemberAccess> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/members/${memberId}/custom-roles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getMyPermissionKeys(workspaceSlug: string, projectId: string): Promise<string[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/my-permission-keys/`)
      .then((response) => (response?.data?.permission_keys as string[]) ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

const projectMemberService = new ProjectMemberService();

export default projectMemberService;
