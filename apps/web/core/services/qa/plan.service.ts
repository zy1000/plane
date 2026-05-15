// plane imports
import { API_BASE_URL } from "@plane/constants";
import { FileUploadService, generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import type { TFileSignedURLResponse } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class PlanService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPlanList(workspaceSlug: string, queries?: any): Promise<Array<{ id: string; name: string }>> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/list/`, { params: queries })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanModulesCount(workspaceSlug: string, projectId: string): Promise<any> {
    const params = { project_id: projectId };
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/module/count/`, { params })
      .then((response) => response?.data ?? {})
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlans(workspaceSlug: string, projectId: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPlan(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlan(workspaceSlug: string, projectId: string, data: any): Promise<any> {
    return this.put(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addPlanCases(workspaceSlug: string, projectId: string, data: { plan_id: string; case_ids: string[] }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/add-cases/`, data, { params: { project_id: projectId } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async associateReleases(
    workspaceSlug: string,
    projectId: string,
    data: { plan_id: string; release_ids: string[] }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/associate-releases/`, data, {
      params: { project_id: projectId },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanModules(workspaceSlug: string, projectId: string, queries?: any): Promise<any[]> {
    const params = { project_id: projectId, ...(queries || {}) };
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/module/`, { params })
      .then((response) => response?.data || [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPlanModule(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/module/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePlanModule(workspaceSlug: string, moduleIds: Array<string>): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/plan/module/`, {
      ids: moduleIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlanModule(workspaceSlug: string, moduleId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/plan/module/${moduleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePlan(workspaceSlug: string, projectId: string, planIds: Array<string>): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/test/plane/`, {
      ids: planIds,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanAssignees(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plane-assignee`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createPlanAssignee(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plane-assignee`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updatePlanAssignee(workspaceSlug: string, assigneeId: string, data: any): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/plane-assignee/${assigneeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePlanAssignee(workspaceSlug: string, assigneeId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/plane-assignee/${assigneeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCases(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plane/case/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cancelPlanCase(workspaceSlug: string, projectId: string, planCaseId: string | string[]): Promise<any> {
    const data = { id: planCaseId };
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/cancel/`, data, { params: { project_id: projectId } })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
  async getPlanCaseList(
    workspaceSlug: string,
    plan_id: string,
    queries?: {
      page?: number;
      page_size?: number;
      repository_id?: string | null;
      module_id?: string | null;
      name__icontains?: string;
    }
  ): Promise<{ data: Array<{ id: string; name: string; priority: number; assignees: string[]; result: string; created_by: string | null }>; count: number }> {
    const params = { plan_id, ...(queries || {}) } as any;
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/case-list/`, { params })
      .then((response) => ({ data: response?.data.data ?? [], count: Number(response?.data.count || 0) }))
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async caseExecute(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/execute/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCaseDetail(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/case-detail/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCaseBug(workspaceSlug: string, data: any): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/test/plan/add-bug/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getPlanCaseRecord(workspaceSlug: string, queries?: any): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/plan/records/`, {
      params: queries,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getExecutionFiles(workspaceSlug: string, recordId: string): Promise<any[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/execution-file/list/`, {
      params: { record_id: recordId },
    })
      .then((response) => response?.data?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadExecutionFile(workspaceSlug: string, recordId: string, file: File): Promise<any> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    const presignResponse = await this.post(
      `/api/workspaces/${workspaceSlug}/test/execution-file/upload/`,
      {
        ...fileMetaData,
        record_id: recordId,
      }
    )
      .then((response) => response?.data as { upload_data: TFileSignedURLResponse["upload_data"]; asset_id: string })
      .catch((error) => {
        throw error?.response?.data;
      });

    if (!presignResponse?.upload_data || !presignResponse?.asset_id) {
      throw new Error("Failed to obtain presigned upload data");
    }

    const fileUploadPayload = generateFileUploadPayload(
      { upload_data: presignResponse.upload_data, asset_id: presignResponse.asset_id, asset_url: "" } as TFileSignedURLResponse,
      file
    );

    const fileUploader = new FileUploadService();
    await fileUploader.uploadFile(presignResponse.upload_data.url, fileUploadPayload);

    await this.patch(
      `/api/workspaces/${workspaceSlug}/test/execution-file/${presignResponse.asset_id}/uploaded/`,
      { attributes: fileMetaData }
    ).catch((error) => {
      throw error?.response?.data;
    });

    return { asset_id: presignResponse.asset_id };
  }

  async deleteExecutionFile(workspaceSlug: string, recordId: string, fileId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/execution-file/delete/`, {
      record_id: recordId,
      asset_id: fileId,
    })
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadExecutionFile(workspaceSlug: string, fileId: string): Promise<string> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/execution-file/download/`, {
      params: { asset_id: fileId },
    })
      .then((response) => response?.data?.download_url as string)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

}
