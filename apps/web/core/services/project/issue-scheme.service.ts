/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueSchemeLite, TIssueTypeLibrary } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TIssueSchemeDetachResponse = {
  issue_scheme: string;
  issue_scheme_detail: TIssueSchemeLite;
  /** false = 本来就是项目自定义（重复请求） */
  detached: boolean;
};

/**
 * 工作项方案（docs/issue-scheme/）。方案下的类型 / 字段 / 状态 / 工作流接口不在这里：
 * 它们与项目级同名接口共用 service，按作用域键拼路径（issue-scheme-scope.ts）。
 * 研发模式视图挂在研发模式上，见 DevModeService。
 */
export class IssueSchemeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /** 工作区的工作项类型库（不存在时后端自动建并生成种子） */
  async getIssueTypeLibrary(workspaceSlug: string): Promise<TIssueTypeLibrary> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-type-library/`)
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
