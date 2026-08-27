// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TLinkableCaseRequirementsResponse, TTestCaseRequirementLink } from "@plane/types";
// services
import { APIService } from "@/services/api.service";
import type { AxiosRequestConfig } from "axios";
import { getFileMetaDataForUpload, generateFileUploadPayload } from "@plane/services";
import { FileUploadService } from "@/services/file-upload.service";


export type ModuleCountResponse = { total: number } & Record<string, number>;

export class CaseService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getCases(workspaceSlug: string, projectId: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCaseTree(workspaceSlug: string, queries: { plan_id: string }): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/plan-case-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReviewCaseTree(workspaceSlug: string, queries: { review_id: string }): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/review-case-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanUnassociatedCaseTree(workspaceSlug: string, queries: { plan_id: string }): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/plan-unassociated-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanUnassociatedCases(
    workspaceSlug: string,
    queries: {
      plan_id: string;
      repository_id?: string;
      module_id?: string;
      page?: number;
      page_size?: number;
      name__icontains?: string;
    }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/plan-unassociated-cases/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanUnassociatedCaseIds(
    workspaceSlug: string,
    queries: { plan_id: string; repository_id?: string; module_id?: string }
  ): Promise<{ data: string[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/plan-unassociated-case-ids/`, { params: queries })
      .then((response) => ({ data: response?.data?.data ?? [], count: Number(response?.data?.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectCaseTree(workspaceSlug: string, queries: { project_id: string }): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/project-case-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectCases(
    workspaceSlug: string,
    queries: { project_id: string; repository_id?: string; module_id?: string; page?: number; page_size?: number; name__icontains?: string }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/project-cases/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectCaseIds(
    workspaceSlug: string,
    queries: { project_id: string; repository_id?: string; module_id?: string }
  ): Promise<{ data: string[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/project-case-ids/`, { params: queries })
      .then((response) => ({ data: response?.data?.data ?? [], count: Number(response?.data?.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReviewUnassociatedCaseTree(workspaceSlug: string, queries: { review_id: string }): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/review-unassociated-tree/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReviewUnassociatedCases(
    workspaceSlug: string,
    queries: { review_id: string; repository_id?: string; module_id?: string; page?: number; page_size?: number; name__icontains?: string }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/review-unassociated-cases/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getReviewUnassociatedCaseIds(
    workspaceSlug: string,
    queries: { review_id: string; repository_id?: string; module_id?: string }
  ): Promise<{ data: string[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/review-unassociated-case-ids/`, { params: queries })
      .then((response) => ({ data: response?.data?.data ?? [], count: Number(response?.data?.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCase(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCase(workspaceSlug: string, caseId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/${caseId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCaseMindmap(
    workspaceSlug: string,
    queries: { repository_id: string; module_id?: string | string[] }
  ): Promise<{ root: any }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/mindmap/`, { params: queries })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createComment(workspaceSlug: string, payload: { case: string; content: string; parent?: string }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/comments/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateComment(workspaceSlug: string, id: string, content: string): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/test/comments/${id}/`, { content })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteComment(workspaceSlug: string, id: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/comments/${id}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
    async getCaseIssueWithType(workspaceSlug: string,query?:any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/issues/`,{
      params: query,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateCase(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCase(workspaceSlug: string, projectId: string, caseId: string | string[]): Promise<any> {
    const ids = Array.isArray(caseId) ? caseId.join(",") : caseId;
    const query = { id__in: ids };
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/?${new URLSearchParams(query).toString()}`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ---- 模板用例（工作区级，只作用于 is_template=true 的模板库）----

  async getTemplateCases(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/template-case/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createTemplateCase(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/template-case/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateTemplateCase(workspaceSlug: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/test/template-case/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteTemplateCases(workspaceSlug: string, caseId: string | string[]): Promise<any> {
    const ids = Array.isArray(caseId) ? caseId.join(",") : caseId;
    const query = { id__in: ids };
    return this.delete(
      `/api/workspaces/${workspaceSlug}/test/template-case/?${new URLSearchParams(query).toString()}`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 某模板库（可按模块子树收窄）下全部用例的 {id, module_id}，不分页；供导入弹窗树勾选拉全量 */
  async getTemplateCaseIds(
    workspaceSlug: string,
    queries: { repository_id: string; module_id?: string }
  ): Promise<{ data: { id: string; module_id: string | null }[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/template-case-ids/`, { params: queries })
      .then((response) => ({
        data: response?.data?.data ?? [],
        count: Number(response?.data?.count || 0),
      }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 从模板导入：复制用例进目标库，按源模块路径自动匹配/创建目标模块链 */
  async importTemplateCases(
    workspaceSlug: string,
    data: { cases_id: string[]; repository_id: string }
  ): Promise<{ data: string[]; count: number }> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/template-case/import/`, data)
      .then((response) => ({
        data: response?.data?.data ?? [],
        count: Number(response?.data?.count || 0),
      }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getCaseExecuteRecord(workspaceSlug: string, caseId: string): Promise<any> {
    const query = {case_id:caseId}
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/execute-record/`,{params:query})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCaseReviewRecord(workspaceSlug: string, caseId: string): Promise<any> {
    const query = { case_id: caseId };
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/review-record/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCaseVersions(workspaceSlug: string, caseId: string): Promise<any> {
    const query = { case_id: caseId };
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/version/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async compareCaseVersions(
    workspaceSlug: string,
    caseId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<any> {
    const query = { case_id: caseId, from_version: fromVersion, to_version: toVersion };
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/version/compare/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private fileUploadService: FileUploadService = new FileUploadService();

  // ⚠️ 下面四个 `*CaseAttachment*` 方法（updateCaseAttachmentUploadStatus / uploadCaseAttachment /
  // getCaseAttachments / deleteCaseAttachment）指向的 `projects/{pid}/cases/{caseId}/attachments/`
  // 后端并无路由，且前端无调用方，属遗留死代码。真实附件链路：
  // 上传走 /api/assets/v2 的 workspace/project 端点，列表 getCaseAssetList，下载 getCaseAsset，
  // 删除 deleteWorkspaceAsset。保留仅作参考。
  private async updateCaseAttachmentUploadStatus(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    attachmentId: string
  ): Promise<void> {
    return this.patch(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/cases/${caseId}/attachments/${attachmentId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadCaseAttachment(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<any> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/cases/${caseId}/attachments/`,
      fileMetaData
    )
      .then(async (response) => {
        const signedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.updateCaseAttachmentUploadStatus(workspaceSlug, projectId, caseId, signedURLResponse.asset_id);
        return signedURLResponse.attachment;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCaseAttachments(workspaceSlug: string, projectId: string, caseId: string): Promise<any[]> {
    return this.get(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/cases/${caseId}/attachments/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCaseAttachment(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    assetId: string
  ): Promise<any> {
    return this.delete(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/cases/${caseId}/attachments/${assetId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  // 新增：删除尚未绑定到用例的工作空间资产
  async deleteWorkspaceAsset(workspaceSlug: string, assetId: string): Promise<any> {
    return this.delete(`/api/assets/v2/workspaces/${workspaceSlug}/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  // 新增：获取模块列表，支持按 repositoryId 过滤
  async getModules(workspaceSlug: string, repositoryId: string): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/module/?repository_id=${repositoryId}`)
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // 新增：一次性批量获取多个用例库的模块树，避免逐个 repository 发请求（N+1）
  async getModulesByRepositoryIds(workspaceSlug: string, repositoryIds: string[]): Promise<any[]> {
    const ids = (repositoryIds || []).filter(Boolean).join(",");
    if (!ids) return [];
    return this.get(`/api/workspaces/${workspaceSlug}/test/module/`, {
      params: { repository_id__in: ids },
    })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createModules(workspaceSlug: string, data: any): Promise<any[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/module/`, data)
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteModules(workspaceSlug: string, moduleId: string): Promise<any[]> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/module/?id=${moduleId}`)
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }



  async getModulesCount(workspaceSlug: string, repositoryId: string): Promise<Partial<ModuleCountResponse>> {
    const params = {repository_id:repositoryId}
    return this.get(`/api/workspaces/${workspaceSlug}/test/module/count/`,{params})
      .then((response) => (response?.data ?? {}) as Partial<ModuleCountResponse>)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async putAssetCaseId(workspaceSlug: string, assetId: string, data: any): Promise<Partial<ModuleCountResponse>> {
    return this.put(`/api/assets/v2/workspaces/${workspaceSlug}/${assetId}/`, data)
      .then((response) => (response?.data ?? {}) as Partial<ModuleCountResponse>)
      .catch((error) => {
        throw error?.response?.data;
      });
}
 async getCaseAsset(workspaceSlug: string, caseId:string,asset_id:string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/cases/${caseId}/attachments/${asset_id}/`, {}, { responseType: 'blob' })
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getCaseAssetList(workspaceSlug: string, caseId:string): Promise<Partial<ModuleCountResponse>> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/${caseId}/assets/`)
      .then((response) => (response?.data ?? {}) as Partial<ModuleCountResponse>)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async deleteCaseAsset(workspaceSlug: string, caseId:string, asset_id:string): Promise<Partial<ModuleCountResponse>> {
    return this.delete(`/api/workspaces/${workspaceSlug}/case/${caseId}/attachments/${asset_id}/`)
      .then((response) => (response?.data ?? {}) as Partial<ModuleCountResponse>)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async submitCaseReview(
    workspaceSlug: string,
    payload: { review_id: string; case_id: string | string[]; result: string; reason?: string; assignee?: string }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/review/case-review/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async assocateCycle(workspaceSlug: string, data: any): Promise<any[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/associate-cycle/`, data)
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async associateModules(workspaceSlug: string, data: { plan_id: string; module_ids: string[] }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/associate-modules/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async issueList(workspaceSlug: string, query: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/issues-list/`, {params: query})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async unselectIssueList(workspaceSlug: string, query: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/unselect-issues/`, {params: query})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }


  async getIssueCase(workspaceSlug: string, issueId: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/issue-case/`, {params: {issue_id: issueId}})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async deleteIssueCase(workspaceSlug: string, issueId: string, caseId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/case/delete-issue-case/`, {issue_id: issueId, case_id: caseId})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getUnselectIssueCase(workspaceSlug: string, query: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/unselect-issue-case/`, { params: query })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async addIssueCase(workspaceSlug: string, issueId: string, caseId: string): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/add-issue-case/`, {issue_id: issueId, case_id: caseId})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /* --- 用例 ↔ 需求（RequirementTestCase） ---------------------------------
   * 与上面的 issue-case 系列是两回事：那批挂的是「工作项」（含 IssueType 名为
   * 史诗/特性/用户故事 的那些，界面上也叫"需求"），这批挂的是 requirement 域的真需求。
   * 端点是项目作用域的（吃 QA_CASE_* 权限），共享用例库（repository.project 为空）
   * 的用例只能从需求侧关联 —— 见 apps/api/plane/app/views/qa/case_requirement.py。
   */

  /** 这条用例已关联的需求列表 */
  async getCaseRequirements(
    workspaceSlug: string,
    projectId: string,
    caseId: string
  ): Promise<TTestCaseRequirementLink[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/${caseId}/requirements/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 候选池：能挂到这条用例上、且尚未挂上的需求。要写权限（会露出未关联的需求内容） */
  async getLinkableRequirements(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    params: { search?: string; cursor?: string; per_page?: number } = {}
  ): Promise<TLinkableCaseRequirementsResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/${caseId}/linkable-requirements/`,
      { params }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量关联需求。全有或全无 —— 409 时 conflicts[].reason 给原因 */
  async addCaseRequirements(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    requirementIds: string[]
  ): Promise<{ message: string }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/${caseId}/requirements/`, {
      requirements: requirementIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除单条需求关联 */
  async deleteCaseRequirement(
    workspaceSlug: string,
    projectId: string,
    caseId: string,
    requirementId: string
  ): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/case/${caseId}/requirements/`, {
      requirement_id: requirementId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async importCase(workspaceSlug: string, formData: FormData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/import-case/`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    })
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async validateImportCase(workspaceSlug: string, formData: FormData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/validate-import-case/`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    })
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadImportTemplate(workspaceSlug: string): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/import-template/`, {}, { responseType: "blob" })
      .then((response) => response)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createlabel(workspaceSlug: string, name: string, caseId: string|undefined,repositoryId:string): Promise<any[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/label/`, {name, case_id: caseId,repository_id:repositoryId})
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletelabel(workspaceSlug: string, labelId: string,caseId: string|undefined): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/case/label/`, {id: labelId,case_id:caseId})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateCaseModule(workspaceSlug: string,casesId:Array<string>,moduleId:string): Promise<Partial<ModuleCountResponse>> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/update-module/`, {cases_id: casesId, module_id: moduleId})
      .then((response) => (response?.data ?? {}) as Partial<ModuleCountResponse>)
      .catch((error) => {
        throw error?.response?.data;
      });
}

  async copyCase(workspaceSlug: string, casesId: Array<string>, moduleId: string): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/copy-case/`, { cases_id: casesId, module_id: moduleId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }




}
