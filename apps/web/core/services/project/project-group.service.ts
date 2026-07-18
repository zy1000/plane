/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectGroup, IProjectGroupMember, IProjectGroupRole } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectGroupService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<IProjectGroup[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/groups/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listMembers(workspaceSlug: string, projectId: string, groupId: string): Promise<IProjectGroupMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/groups/${groupId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRole(
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    roleId: string
  ): Promise<IProjectGroupRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/groups/${groupId}/roles/`, {
      role: roleId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRole(workspaceSlug: string, projectId: string, groupId: string, grantId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/groups/${groupId}/roles/${grantId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
