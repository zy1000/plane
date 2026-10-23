import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import { issueConfigBasePath } from "@/services/project/issue-scheme-scope";

export type TIssueTypeIconProps = {
  name: string;
  color?: string;
  background_color?: string;
};

/**
 * 工作项类型的系统标识（后端 seed_data/issue_scheme.py）：种子五个类型的固定 key，
 * 按它判断类型而不按名字。用户自建的类型为 null。
 */
export type TIssueTypeSystemKey = "epic" | "feature" | "story" | "task" | "bug";

export type TIssueType = {
  id: string;
  project?: string;
  project_id?: string;
  name: string;
  /** 系统标识，只读；自建类型为 null */
  system_key?: TIssueTypeSystemKey | null;
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
  /** IssueTypeCategory 的主键（工作区级别），后端使用 IntegerField，序列化为数字 */
  category_id?: number | string | null;
  /** IssueTypeCategory 的名称 */
  category_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TTypeExtraField = {
  id: string;
  project?: string;
  project_id?: string;
  workspace?: string;
  workspace_id?: string;
  issue_type?: string;
  issue_type_id: string;
  name: string;
  description?: string;
  logo_props?: Record<string, unknown>;
  field_type: "text" | "number" | "date" | "boolean" | "select" | "user";
  is_required?: boolean;
  is_default?: boolean;
  is_active?: boolean;
  sort_order?: number;
  options?: Record<string, unknown>;
  default_value?: unknown;
  validation?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type TTypeExtraFieldPayload = Omit<Partial<TTypeExtraField>, "id" | "project" | "workspace"> & {
  issue_type_id: string;
  name: string;
  field_type: TTypeExtraField["field_type"];
};

export const projectIssueTypesCache: Map<string, Record<string, TIssueType>> = new Map();

// extra-fields schema cache: key = `${workspaceSlug}:${projectId}:${issueTypeId}`
const EXTRA_FIELDS_CACHE_TTL_MS = 10_000; // 10 秒

type TCacheEntry = { data: TTypeExtraField[]; expiresAt: number };
const typeExtraFieldsCache = new Map<string, TCacheEntry>();
// in-flight dedup: same key, same Promise
const typeExtraFieldsInflight = new Map<string, Promise<TTypeExtraField[]>>();

const extraFieldsCacheKey = (slug: string, projectId: string, issueTypeId?: string, lite?: boolean) =>
  `${slug}:${projectId}:${issueTypeId ?? "*"}${lite ? ":lite" : ""}`;

export const getCachedTypeExtraFields = (
  slug: string,
  projectId: string,
  issueTypeId?: string,
  lite?: boolean
): TTypeExtraField[] | undefined => {
  const key = extraFieldsCacheKey(slug, projectId, issueTypeId, lite);
  const entry = typeExtraFieldsCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    typeExtraFieldsCache.delete(key);
    return undefined;
  }
  return entry.data;
};

const clearExtraFieldsCacheForProject = (slug: string, projectId: string) => {
  const prefix = `${slug}:${projectId}:`;
  for (const key of typeExtraFieldsCache.keys()) {
    if (key.startsWith(prefix)) typeExtraFieldsCache.delete(key);
  }
  for (const key of typeExtraFieldsInflight.keys()) {
    if (key.startsWith(prefix)) typeExtraFieldsInflight.delete(key);
  }
};

const getErrorPayload = (error: any) => error?.response?.data ?? error;

export class ProjectIssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  /**
   * 创建 / 更新后把返回的类型合并进已有缓存。缓存不存在时不动（留给下一次列表请求填充），
   * 否则会造出一份只含这一条的「残缺缓存」，其他页面会把它当完整列表用。
   */
  private upsertCache(projectId: string, issueType: TIssueType | undefined): void {
    const cached = projectIssueTypesCache.get(projectId);
    if (!cached || !issueType?.id) return;
    projectIssueTypesCache.set(projectId, { ...cached, [issueType.id]: issueType });
  }

  private removeFromCache(projectId: string, issueTypeId: string): void {
    const cached = projectIssueTypesCache.get(projectId);
    if (!cached) return;
    const rest = { ...cached };
    delete rest[issueTypeId];
    projectIssueTypesCache.set(projectId, rest);
  }

  async fetchProjectIssueTypes(workspaceSlug: string, projectId: string, force = false): Promise<TIssueType[]> {
    const cacheKey = projectId;
    const cached = projectIssueTypesCache.get(cacheKey);
    if (!force && cached && Object.keys(cached).length > 0) {
      return Promise.resolve(Object.values(cached));
    }
    return this.get(`${issueConfigBasePath(workspaceSlug, projectId)}/issue-types/`)
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
        throw getErrorPayload(error);
      });
  }

  async fetchProjectIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<TIssueType> {
    return this.get(`${issueConfigBasePath(workspaceSlug, projectId)}/issue-types/${issueTypeId}/`)
      .then((response) => {
        const issueType = response?.data;
        if (issueType?.id) {
          const map = projectIssueTypesCache.get(projectId) || {};
          map[issueType.id] = issueType;
          projectIssueTypesCache.set(projectId, map);
        }
        return issueType;
      })
      .catch((error) => {
        throw getErrorPayload(error);
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
        throw getErrorPayload(error);
      });
  }


  // 新增：创建工作项类型，请求风格与其他服务保持一致
  async createProjectIssueType(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.post(`${issueConfigBasePath(workspaceSlug, projectId)}/issue-types/`, data)
      .then((response) => {
        this.upsertCache(projectId, response?.data);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }

  async updateProjectIssueType(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: Partial<TIssueType>
  ): Promise<TIssueType> {
    return this.patch(`${issueConfigBasePath(workspaceSlug, projectId)}/issue-types/${issueTypeId}/`, data)
      .then((response) => {
        this.upsertCache(projectId, response?.data);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }

  // 新增：删除工作项类型
  async deleteProjectIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<any> {
    return this.delete(`${issueConfigBasePath(workspaceSlug, projectId)}/issue-types/${issueTypeId}/`)
      .then((response) => {
        this.removeFromCache(projectId, issueTypeId);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }

  async fetchTypeExtraFields(
    workspaceSlug: string,
    projectId: string,
    issueTypeId?: string,
    lite?: boolean
  ): Promise<TTypeExtraField[]> {
    const key = extraFieldsCacheKey(workspaceSlug, projectId, issueTypeId, lite);

    // return in-flight promise if already running
    const inflight = typeExtraFieldsInflight.get(key);
    if (inflight) return inflight;

    const queryParams: Record<string, string | number> = {};
    if (issueTypeId) queryParams["issue_type"] = issueTypeId;
    if (lite) queryParams["lite"] = 1;
    const promise = this.get(`${issueConfigBasePath(workspaceSlug, projectId)}/type-extra-fields/`, {
      params: queryParams,
    })
      .then((response) => {
        const data: TTypeExtraField[] = response?.data ?? [];
        typeExtraFieldsCache.set(key, { data, expiresAt: Date.now() + EXTRA_FIELDS_CACHE_TTL_MS });
        return data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      })
      .finally(() => {
        typeExtraFieldsInflight.delete(key);
      });

    typeExtraFieldsInflight.set(key, promise);
    return promise;
  }

  async createTypeExtraField(
    workspaceSlug: string,
    projectId: string,
    data: TTypeExtraFieldPayload
  ): Promise<TTypeExtraField> {
    return this.post(`${issueConfigBasePath(workspaceSlug, projectId)}/type-extra-fields/`, data)
      .then((response) => {
        clearExtraFieldsCacheForProject(workspaceSlug, projectId);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }

  async updateTypeExtraField(
    workspaceSlug: string,
    projectId: string,
    fieldId: string,
    data: Partial<TTypeExtraField>
  ): Promise<TTypeExtraField> {
    return this.patch(`${issueConfigBasePath(workspaceSlug, projectId)}/type-extra-fields/${fieldId}/`, data)
      .then((response) => {
        clearExtraFieldsCacheForProject(workspaceSlug, projectId);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }

  async deleteTypeExtraField(workspaceSlug: string, projectId: string, fieldId: string): Promise<void> {
    return this.delete(`${issueConfigBasePath(workspaceSlug, projectId)}/type-extra-fields/${fieldId}/`)
      .then((response) => {
        clearExtraFieldsCacheForProject(workspaceSlug, projectId);
        return response?.data;
      })
      .catch((error) => {
        throw getErrorPayload(error);
      });
  }
  
}
