/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueSchemeLite, TSchemeView } from "@plane/types";
import { APIService } from "@/services/api.service";

/** 模式方案概况（模板中心「工作项配置」页头） */
export type TIssueSchemeDetail = TIssueSchemeLite & {
  following_project_count: number;
  dev_modes: { id: string; name: string }[];
};

export type TIssueSchemeDetachResponse = {
  issue_scheme: string;
  issue_scheme_detail: TIssueSchemeLite;
  /** false = 本来就是项目自定义（重复请求） */
  detached: boolean;
};

/**
 * 工作项方案（docs/issue-scheme/）。方案下的类型 / 字段 / 状态 / 工作流接口不在这里：
 * 它们与项目级同名接口共用 service，按作用域键拼路径（issue-scheme-scope.ts）。
 */
export class IssueSchemeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getIssueScheme(workspaceSlug: string, schemeId: string): Promise<TIssueSchemeDetail> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 模式方案上的研发模式视图（全部页面），按排序 */
  async getSchemeViews(workspaceSlug: string, schemeId: string): Promise<TSchemeView[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}/views/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameSchemeView(workspaceSlug: string, schemeId: string, viewId: string, name: string): Promise<void> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}/views/${viewId}/`, { name })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteSchemeView(workspaceSlug: string, schemeId: string, viewId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}/views/${viewId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 按给出的顺序重排（同一页面内的视图） */
  async reorderSchemeViews(workspaceSlug: string, schemeId: string, viewIds: string[]): Promise<void> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-schemes/${schemeId}/views/reorder/`, { view_ids: viewIds })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 项目切换为项目自定义（单向）。有待审批的状态变更时 409（code: ISSUE_SCHEME_DETACH_BLOCKED_BY_PENDING_APPROVALS） */
  async detachProjectIssueScheme(workspaceSlug: string, projectId: string): Promise<TIssueSchemeDetachResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-scheme/detach/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
