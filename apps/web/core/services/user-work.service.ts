/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type {
  TUserWorkConfig,
  TUserWorkConfigPatch,
  TUserWorkInitiatedParams,
  TUserWorkInitiatedResponse,
  TUserWorkPendingParams,
  TUserWorkPendingResponse,
  TUserWorkProcessedParams,
  TUserWorkProcessedResponse,
  TUserWorkSummary,
} from "@/types/user-work";

const csv = (values?: string[] | null) => (values && values.length ? values.join(",") : undefined);

/** 个人主页「我的工作」：待处理 / 已处理 / 我发起的 + 视图设置（`workspaces/<slug>/user-work/<user_id>/…`） */
export class UserWorkService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, userId: string) {
    return `/api/workspaces/${workspaceSlug}/user-work/${userId}`;
  }

  async getSummary(workspaceSlug: string, userId: string): Promise<TUserWorkSummary> {
    return this.get(`${this.base(workspaceSlug, userId)}/summary/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPending(
    workspaceSlug: string,
    userId: string,
    params: TUserWorkPendingParams = {}
  ): Promise<TUserWorkPendingResponse> {
    return this.get(`${this.base(workspaceSlug, userId)}/pending/`, {
      params: {
        types: csv(params.types),
        search: params.search || undefined,
        quick: params.quick || undefined,
        owners: csv(params.owners),
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProcessed(
    workspaceSlug: string,
    userId: string,
    params: TUserWorkProcessedParams = {}
  ): Promise<TUserWorkProcessedResponse> {
    return this.get(`${this.base(workspaceSlug, userId)}/processed/`, {
      params: {
        types: csv(params.types),
        search: params.search || undefined,
        owners: csv(params.owners),
        days: params.days,
        page: params.page,
        page_size: params.page_size,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInitiated(
    workspaceSlug: string,
    userId: string,
    params: TUserWorkInitiatedParams = {}
  ): Promise<TUserWorkInitiatedResponse> {
    return this.get(`${this.base(workspaceSlug, userId)}/initiated/`, {
      params: { types: csv(params.types), search: params.search || undefined, owners: csv(params.owners) },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPreferences(workspaceSlug: string, userId: string): Promise<{ config: TUserWorkConfig }> {
    return this.get(`${this.base(workspaceSlug, userId)}/preferences/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePreferences(
    workspaceSlug: string,
    userId: string,
    patch: TUserWorkConfigPatch
  ): Promise<{ config: TUserWorkConfig }> {
    return this.patch(`${this.base(workspaceSlug, userId)}/preferences/`, patch)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const userWorkService = new UserWorkService();
