/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectRole, IProjectRolePermissionData } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectRoleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<IProjectRole[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, roleId: string): Promise<IProjectRole> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: { name: string; description?: string }
  ): Promise<IProjectRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    roleId: string,
    data: Partial<{ name: string; description: string }>
  ): Promise<IProjectRole> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/${roleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, roleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/${roleId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从工作区角色模板导入为项目角色（独立副本，与模板解绑） */
  async importFromTemplate(
    workspaceSlug: string,
    projectId: string,
    payload: { workspace_role_id: string }
  ): Promise<IProjectRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/import/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchPermissions(
    workspaceSlug: string,
    projectId: string,
    roleId: string
  ): Promise<IProjectRolePermissionData> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/${roleId}/permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePermissions(
    workspaceSlug: string,
    projectId: string,
    roleId: string,
    permissionKeys: string[]
  ): Promise<IProjectRolePermissionData> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/roles/${roleId}/permissions/`, {
      permission_keys: permissionKeys,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
