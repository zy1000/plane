/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TJobRole,
  TJobRoleLabelUsage,
  TJobRolePayload,
  TJobRoleProjectMembers,
  TJobRoleReference,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/** 工作区设置 › 角色（数据字典 job_role 的值）。列表已按 sort_order 排好，带持有人 / 引用计数。 */
export class JobRoleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/job-roles/`;
  }

  async list(workspaceSlug: string): Promise<TJobRole[]> {
    return this.get(this.base(workspaceSlug))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, roleId: string): Promise<TJobRole> {
    return this.get(`${this.base(workspaceSlug)}${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TJobRolePayload): Promise<TJobRole> {
    return this.post(this.base(workspaceSlug), payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, roleId: string, payload: TJobRolePayload): Promise<TJobRole> {
    return this.patch(`${this.base(workspaceSlug)}${roleId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, roleId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}${roleId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reorder(workspaceSlug: string, ids: string[]): Promise<TJobRole[]> {
    return this.post(`${this.base(workspaceSlug)}reorder/`, { ids })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listProjectMembers(workspaceSlug: string, roleId: string): Promise<TJobRoleProjectMembers[]> {
    return this.get(`${this.base(workspaceSlug)}${roleId}/project-members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listReferences(workspaceSlug: string, roleId: string): Promise<TJobRoleReference[]> {
    return this.get(`${this.base(workspaceSlug)}${roleId}/references/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLabelUsage(workspaceSlug: string, roleId: string): Promise<TJobRoleLabelUsage> {
    return this.get(`${this.base(workspaceSlug)}${roleId}/label-usage/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 给一批工作区成员挂上这个角色；返回实际处理到的成员 user id */
  async addWorkspaceMembers(workspaceSlug: string, roleId: string, memberIds: string[]): Promise<{ member_ids: string[] }> {
    return this.post(`${this.base(workspaceSlug)}${roleId}/workspace-members/`, { member_ids: memberIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeWorkspaceMember(workspaceSlug: string, roleId: string, userId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug)}${roleId}/workspace-members/${userId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
