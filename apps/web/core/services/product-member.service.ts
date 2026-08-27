import { API_BASE_URL } from "@plane/constants";
import type { TCreateProductMemberPayload, TProductMember, TUpdateProductMemberRolesPayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProductMemberService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, productId: string): Promise<TProductMember[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/members/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    productId: string,
    payload: TCreateProductMemberPayload
  ): Promise<TProductMember> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/${productId}/members/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRoles(
    workspaceSlug: string,
    productId: string,
    membershipId: number,
    payload: TUpdateProductMemberRolesPayload
  ): Promise<TProductMember> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/products/${productId}/members/${membershipId}/custom-roles/`,
      payload
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, productId: string, membershipId: number): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/members/${membershipId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
