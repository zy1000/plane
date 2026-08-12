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
    // 不透传 cover_image_asset：编辑换封面统一走资产上传确认由后端回写绑定
    const { name, identifier, description_html, network, owner, reviewers, logo_props, cover_image } = payload;
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/`, {
      ...(name !== undefined ? { name } : {}),
      ...(identifier !== undefined ? { identifier } : {}),
      ...(description_html !== undefined ? { description_html } : {}),
      ...(network !== undefined ? { network } : {}),
      ...(owner !== undefined ? { owner } : {}),
      ...(reviewers !== undefined ? { reviewers } : {}),
      ...(logo_props !== undefined ? { logo_props } : {}),
      ...(cover_image !== undefined ? { cover_image } : {}),
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
