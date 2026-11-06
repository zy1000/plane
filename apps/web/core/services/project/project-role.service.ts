/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TPermissionGroupContent,
  TProjectPermissionGroup,
  TProjectPermissionGroupDetail,
  TProjectPermissionGroupList,
  TProjectVisibleMembers,
} from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 项目设置 › 权限组（后端 plane/app/views/project/role.py）。
 * 列表 = 引用了本项目的工作区模板组 + 本项目自定义组；引用来的组只读，只能「删除引用」（本项目不再引用它）。
 */
export class ProjectRoleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectPermissionGroupList> {
    return this.get(`${this.base(workspaceSlug, projectId)}/roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 可见人员：谁能看到本项目（成员、负责人、直通、数据权限白名单），以及各自在本项目的权限数 */
  async fetchVisibleMembers(workspaceSlug: string, projectId: string): Promise<TProjectVisibleMembers> {
    return this.get(`${this.base(workspaceSlug, projectId)}/visible-members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 新建本项目自定义组；copy_from 可给引用中的模板 id 或本项目组 id，照它的权限起步 */
  async create(
    workspaceSlug: string,
    projectId: string,
    data: { name: string; description?: string; copy_from?: string | null }
  ): Promise<TProjectPermissionGroup> {
    return this.post(`${this.base(workspaceSlug, projectId)}/roles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    data: Partial<{ name: string; description: string }>
  ): Promise<TProjectPermissionGroup> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/roles/${groupId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 本项目组：删除；模板 id 或它的引用行：本项目不再引用（记排除、解绑本项目里绑到它的成员） */
  async destroy(workspaceSlug: string, projectId: string, groupId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId)}/roles/${groupId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchPermissions(
    workspaceSlug: string,
    projectId: string,
    groupId: string
  ): Promise<TProjectPermissionGroupDetail> {
    return this.get(`${this.base(workspaceSlug, projectId)}/roles/${groupId}/permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePermissions(
    workspaceSlug: string,
    projectId: string,
    groupId: string,
    data: TPermissionGroupContent
  ): Promise<TProjectPermissionGroupDetail> {
    return this.patch(`${this.base(workspaceSlug, projectId)}/roles/${groupId}/permissions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 组里的成员（用户 id） */
  async fetchMemberIds(workspaceSlug: string, projectId: string, groupId: string): Promise<string[]> {
    return this.get(`${this.base(workspaceSlug, projectId)}/roles/${groupId}/members/`)
      .then((response) => (response?.data?.member_ids as string[]) ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
