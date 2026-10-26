/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IProjectView, TViewScope } from "@plane/types";
import { APIService } from "@/services/api.service";
// types
// helpers

export class ViewService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** share_to_mode：存到研发模式（跟随该模式的项目都能看到），只有研发模式维护人能用 */
  async createView(
    workspaceSlug: string,
    projectId: string,
    data: Partial<IProjectView> & { share_to_mode?: boolean }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchView(workspaceSlug: string, projectId: string, viewId: string, data: Partial<IProjectView>): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteView(workspaceSlug: string, projectId: string, viewId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getViews(workspaceSlug: string, projectId: string, scope: TViewScope = "issues"): Promise<IProjectView[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/`, { params: { scope } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 本项目能看到的研发模式视图（不分页面），只取 id，给「切换为项目自定义」弹窗计数 */
  async getProjectModeViews(workspaceSlug: string, projectId: string): Promise<Pick<IProjectView, "id">[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/`, {
      params: { scope: "all", mode_only: "true", fields: "id" },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getViewDetails(workspaceSlug: string, projectId: string, viewId: string): Promise<IProjectView> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getViewIssues(workspaceSlug: string, projectId: string, viewId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/views/${viewId}/issues/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addViewToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: {
      view: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-views/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeViewFromFavorites(workspaceSlug: string, projectId: string, viewId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
