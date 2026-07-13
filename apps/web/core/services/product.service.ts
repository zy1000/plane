/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { API_BASE_URL } from "@plane/constants";
import type { IUserLite } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TProductNetwork = 0 | 2;

export type TWorkspaceProduct = {
  id: string;
  name: string;
  description_html: string | null;
  network: TProductNetwork;
  owner: string | null;
  owner_detail: IUserLite | null;
  workspace: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  can_manage: boolean;
};

export type TProductCreatePayload = {
  name: string;
  description_html?: string | null;
  description_asset_ids?: string[];
  network: TProductNetwork;
  owner: string;
};

export type TProductUpdatePayload = Partial<Omit<TProductCreatePayload, "description_asset_ids" | "owner">> & {
  owner?: string | null;
};

export class ProductService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getProducts(workspaceSlug: string): Promise<TWorkspaceProduct[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProduct(workspaceSlug: string, productId: string): Promise<TWorkspaceProduct> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createProduct(workspaceSlug: string, data: TProductCreatePayload): Promise<TWorkspaceProduct> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateProduct(
    workspaceSlug: string,
    productId: string,
    data: TProductUpdatePayload
  ): Promise<TWorkspaceProduct> {
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProduct(workspaceSlug: string, productId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
