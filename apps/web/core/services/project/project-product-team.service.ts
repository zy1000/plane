/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TProductTeam, TProductTeamCell, TProjectProductTeamMatrix } from "@plane/types";
import { APIService } from "@/services/api.service";

/**
 * 研发矩阵（项目 × 产品 × 角色 → 成员），后端 plane/app/views/project/product_team.py。
 * 只回答「找谁」（审批人按角色、评审候选人），鉴权不读它。
 */
export class ProjectProductTeamService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchMatrix(workspaceSlug: string, projectId: string): Promise<TProjectProductTeamMatrix> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/product-team/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 整格替换；成员必须是本项目活跃成员 */
  async updateCell(workspaceSlug: string, projectId: string, cell: TProductTeamCell): Promise<TProductTeamCell> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/product-team/`, cell)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 产品设置「研发团队」：按关联项目分组（只读） */
  async fetchProductTeam(workspaceSlug: string, productId: string): Promise<TProductTeam> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/team/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
