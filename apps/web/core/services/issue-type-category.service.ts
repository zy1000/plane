/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueTypeCategory } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssueTypeCategoryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TIssueTypeCategory[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-type-categories/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: Partial<TIssueTypeCategory>): Promise<TIssueTypeCategory> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-type-categories/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, categoryId: string, data: Partial<TIssueTypeCategory>): Promise<TIssueTypeCategory> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-type-categories/${categoryId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCategory(workspaceSlug: string, categoryId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/issue-type-categories/${categoryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
