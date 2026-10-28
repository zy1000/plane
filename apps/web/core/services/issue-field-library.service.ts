import { API_BASE_URL } from "@plane/constants";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { APIService } from "@/services/api.service";
import { clearExtraFieldsCacheForWorkspace } from "@/services/project/project-issue-type.service";

/**
 * 工作区「通用字段库」。读要研发模式 view，写要 manage。
 * 改定义 / 删除后后端会同步所有绑定行，这里顺手清掉工作区下所有类型字段缓存。
 */
export class IssueFieldLibraryService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private root(workspaceSlug: string) {
    return `/api/workspaces/${workspaceSlug}/issue-fields`;
  }

  async list(workspaceSlug: string): Promise<TIssueFieldLibraryItem[]> {
    return this.get(`${this.root(workspaceSlug)}/`)
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 名称工作区内唯一，重名 400 `{error}` */
  async create(workspaceSlug: string, payload: TIssueFieldLibraryPayload): Promise<TIssueFieldLibraryItem> {
    return this.post(`${this.root(workspaceSlug)}/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 改名与某个已绑定类型下的私有字段重名也是 400 `{error}` */
  async update(
    workspaceSlug: string,
    fieldId: string,
    payload: TIssueFieldLibraryPayload
  ): Promise<TIssueFieldLibraryItem> {
    return this.patch(`${this.root(workspaceSlug)}/${fieldId}/`, payload)
      .then((response) => {
        clearExtraFieldsCacheForWorkspace(workspaceSlug);
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 仍有绑定 409 `{error, code: "ISSUE_FIELD_IN_USE", binding_count}` */
  async remove(workspaceSlug: string, fieldId: string): Promise<void> {
    return this.delete(`${this.root(workspaceSlug)}/${fieldId}/`)
      .then((response) => {
        clearExtraFieldsCacheForWorkspace(workspaceSlug);
        return response?.data;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
