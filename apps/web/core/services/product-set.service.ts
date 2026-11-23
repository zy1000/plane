import { API_BASE_URL } from "@plane/constants";
import type { TProductSet, TProductSetMember, TProductSetPayload } from "@plane/types";
import { APIService } from "@/services/api.service";

/** 产品集（后端是 is_set=True 的产品）。详情页签沿用 ProductService / 产品路由，这里只有产品集独有的接口。 */
export class ProductSetService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProductSet[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/product-sets/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, payload: TProductSetPayload): Promise<{ id: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/product-sets/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(workspaceSlug: string, productSetId: string, payload: Partial<TProductSetPayload>): Promise<void> {
    return this.patch(`/api/workspaces/${workspaceSlug}/product-sets/${productSetId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, productSetId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/product-sets/${productSetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listMembers(workspaceSlug: string, productSetId: string): Promise<TProductSetMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/product-sets/${productSetId}/products/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addMembers(workspaceSlug: string, productSetId: string, productIds: string[]): Promise<{ added: string[] }> {
    return this.post(`/api/workspaces/${workspaceSlug}/product-sets/${productSetId}/products/`, {
      product_ids: productIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeMember(workspaceSlug: string, productSetId: string, productId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/product-sets/${productSetId}/products/${productId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
