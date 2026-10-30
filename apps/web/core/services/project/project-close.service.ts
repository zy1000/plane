/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
import type { TProject } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export type TProjectClosePayload = {
  /** 终态（已完成 / 已取消）的字典值 id */
  status: string;
  /** YYYY-MM-DD */
  actual_end_date: string;
  close_note?: string;
};

/** 关闭 / 重新开启只回被改的几个字段，前端合并进 projectMap */
export type TProjectCloseResponse = Pick<TProject, "id" | "status" | "status_detail" | "actual_end_date" | "close_note">;

/** 列表行操作「关闭 / 重新开启」项目；归档走 ProjectArchiveService，是另一回事 */
export class ProjectCloseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async closeProject(workspaceSlug: string, projectId: string, data: TProjectClosePayload): Promise<TProjectCloseResponse> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/close/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reopenProject(workspaceSlug: string, projectId: string): Promise<TProjectCloseResponse> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/close/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
