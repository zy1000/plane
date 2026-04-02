// plane imports
import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

export class CaseModuleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getCaseModules(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/module`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCaseModule(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/module`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCaseModule(workspaceSlug: string, moduleId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/module/${moduleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateCaseModule(workspaceSlug: string, moduleId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/module/${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCaseModule(workspaceSlug: string, moduleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/module/?id=${moduleId}`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getModulesByRepositories(workspaceSlug: string, repositoryIds: string[]): Promise<any[]> {
    if (!repositoryIds.length) return [];
    return this.get(`/api/workspaces/${workspaceSlug}/test/module/`, {
      params: { repository_id__in: repositoryIds.join(",") },
    })
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getUserModuleTree(): Promise<any[]> {
    return this.get("/api/users/me/test/module-tree/")
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async copyModule(
    workspaceSlug: string,
    data: { module_id: string; target_module_id?: string; repository_id?: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/module/copy/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}