import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TIssueTypeIconProps = {
  name: string;
  color?: string;
  background_color?: string;
};

export type TIssueType = {
  id: string;
  project?: string;
  project_id?: string;
  name: string;
  description?: string;
  logo_props?: {
    icon?: TIssueTypeIconProps;
    in_use?: string;
  };
  is_epic?: boolean;
  is_default?: boolean;
  is_active?: boolean;
  level?: number;
  external_source?: string | null;
  external_id?: string | null;
  workspace?: string;
  created_at?: string;
  updated_at?: string;
};

export const projectIssueTypesCache: Map<string, Record<string, TIssueType>> = new Map();

export class ProjectIssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  // 添加缓存清除方法
  clearCache(workspaceSlug: string, projectId: string): void {
    const cacheKey = projectId;
    projectIssueTypesCache.delete(cacheKey);
  }

  async fetchProjectIssueTypes(workspaceSlug: string, projectId: string, force = false): Promise<TIssueType[]> {
    const cacheKey = projectId;
    const cached = projectIssueTypesCache.get(cacheKey);
    if (!force && cached && Object.keys(cached).length > 0) {
      return Promise.resolve(Object.values(cached));
    }
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`)
      .then((response) => {
        const map: Record<string, TIssueType> = {};
        response?.data.forEach((t: any) => {
          if (t?.id) {
            map[t.id] = t;
          }
        });
        projectIssueTypesCache.set(cacheKey, map);
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  
  async fetchWorkSpaceIssueTypes(workspaceSlug: string): Promise<TIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-types/`)
      .then((response) => {
        response?.data.forEach((t:any) => {
          const typeProjectId = t?.project_id ?? t?.project;
          if (t?.id && typeProjectId) {
            const map = projectIssueTypesCache.get(typeProjectId) || {};
            map[t.id] = t;
            projectIssueTypesCache.set(typeProjectId, map);
          }
        });
        return response?.data
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }


  // 新增：创建工作项类型，请求风格与其他服务保持一致
  async createProjectIssueType(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, data)
      .then((response) => {
        // 清除缓存以确保下次获取最新数据
        this.clearCache(workspaceSlug, projectId);
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // 新增：删除工作项类型
  async deleteProjectIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/`)
      .then((response) => {
        // 清除缓存以确保下次获取最新数据
        this.clearCache(workspaceSlug, projectId);
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data.msg;
      });
  }
  
}
