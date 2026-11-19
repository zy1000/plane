// plane imports
import { API_BASE_URL } from "@plane/constants";
import type {
  TCreateRequirementModulePayload,
  TMoveRequirementModulePayload,
  TRequirementModule,
  TUpdateRequirementModulePayload,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

/** 用例库模块（产品下给用例库分组的树）：节点形状与需求模块一致，侧栏共用 */
export type TCaseRepositoryModule = TRequirementModule;

export type TCaseRepositoryModuleTreeResponse = {
  modules: TCaseRepositoryModule[];
  /** 产品下全部用例库数，「全部用例库」的计数 */
  total: number;
  /** 没挂模块的用例库数，「未归类」的计数 */
  unassigned: number;
};

export class RepositoryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getRepositories(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/repository/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRepository(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/repository/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRepository(workspaceSlug: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/test/repository/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRepository(workspaceSlug: string, data: { ids: string[] }): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/repository/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listRepositoryModules(workspaceSlug: string, productId: string): Promise<TCaseRepositoryModuleTreeResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/products/${productId}/test/repository-modules/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createRepositoryModule(
    workspaceSlug: string,
    productId: string,
    data: TCreateRequirementModulePayload
  ): Promise<TCaseRepositoryModule> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/${productId}/test/repository-modules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateRepositoryModule(
    workspaceSlug: string,
    productId: string,
    moduleId: string,
    data: TUpdateRequirementModulePayload
  ): Promise<TCaseRepositoryModule> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/products/${productId}/test/repository-modules/${moduleId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteRepositoryModule(workspaceSlug: string, productId: string, moduleId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/products/${productId}/test/repository-modules/${moduleId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async moveRepositoryModule(
    workspaceSlug: string,
    productId: string,
    data: TMoveRequirementModulePayload
  ): Promise<TCaseRepositoryModule> {
    return this.post(`/api/workspaces/${workspaceSlug}/products/${productId}/test/repository-modules/move/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }



  async enumsList(workspaceSlug: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/enums/`)
    .then((response) => response?.data)
    .catch((error) => {
      throw error?.response?.data;
    });
}
}
