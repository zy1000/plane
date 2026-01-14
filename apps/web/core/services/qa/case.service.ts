// plane imports
import { API_BASE_URL } from "@plane/constants";
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

  async getCases(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/case/`, {
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
    queries: { plan_id: string; repository_id?: string; module_id?: string; page?: number; page_size?: number }
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

  async createCase(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/case/`, data)
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

  async updateCase(workspaceSlug: string,  data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/test/case/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCase(workspaceSlug: string, caseId: string | string[]): Promise<any> {
    const ids = Array.isArray(caseId) ? caseId.join(",") : caseId;
    const query = { id__in: ids };
    return this.delete(`/api/workspaces/${workspaceSlug}/test/case/?${new URLSearchParams(query).toString()}`)
      .then((response) => response?.data)
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
    payload: { review_id: string; case_id: string; result: string; reason?: string; assignee?: string }
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
