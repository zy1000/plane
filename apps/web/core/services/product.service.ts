import { API_BASE_URL } from "@plane/constants";
import type { TCreateProductPayload, TProduct, TUpdateProductPayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProductService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProduct[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, productId: string): Promise<TProduct> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TCreateProductPayload): Promise<TProduct> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, productId: string, payload: TUpdateProductPayload): Promise<TProduct> {
    const { name, description_html, network, owner, reviewers } = payload;
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/`, {
      ...(name !== undefined ? { name } : {}),
      ...(description_html !== undefined ? { description_html } : {}),
      ...(network !== undefined ? { network } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(reviewers !== undefined ? { reviewers } : {}),
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteProduct(workspaceSlug: string, productId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
