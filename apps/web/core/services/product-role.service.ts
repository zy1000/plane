import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateProductRolePayload,
  TProductRole,
  TProductRolePermissionData,
  TUpdateProductRolePayload,
} from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProductRoleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, productId: string): Promise<TProductRole[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, productId: string, payload: TCreateProductRolePayload): Promise<TProductRole> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    productId: string,
    roleId: number,
    payload: TUpdateProductRolePayload
  ): Promise<TProductRole> {
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/${roleId}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRole(workspaceSlug: string, productId: string, roleId: number): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/${roleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async fetchPermissions(
    workspaceSlug: string,
    productId: string,
    roleId: number
  ): Promise<TProductRolePermissionData> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/${roleId}/permissions/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePermissions(
    workspaceSlug: string,
    productId: string,
    roleId: number,
    permissionKeys: string[]
  ): Promise<TProductRolePermissionData> {
    return this.patch(`/api/workspaces/${workspaceSlug}/products/${productId}/roles/${roleId}/permissions/`, {
      permission_keys: permissionKeys,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
