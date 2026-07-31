/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import type { AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@plane/constants";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import type {
  CycleDateCheckData,
  ICycle,
  ICycleOverdueRecord,
  TIssuesResponse,
  IWorkspaceActiveCyclesResponse,
  TCycleDistribution,
  TProgressSnapshot,
  TCycleEstimateDistribution,
  TFileSignedURLResponse,
} from "@plane/types";
import { APIService } from "@/services/api.service";
import { FileUploadService } from "@/services/file-upload.service";

export class CycleService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async workspaceActiveCyclesAnalytics(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    analytic_type: string = "points"
  ): Promise<TCycleDistribution | TCycleEstimateDistribution> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/analytics?type=${analytic_type}`
    )
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgress(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCyclesProgressPro(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TProgressSnapshot> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-progress/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async workspaceActiveCycles(
    workspaceSlug: string,
    cursor: string,
    per_page: number
  ): Promise<IWorkspaceActiveCyclesResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/active-cycles/`, {
      params: {
        per_page,
        cursor,
      },
    })
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getWorkspaceCycles(workspaceSlug: string): Promise<ICycle[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/cycles/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createCycle(workspaceSlug: string, projectId: string, data: any): Promise<ICycle> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCyclesWithParams(workspaceSlug: string, projectId: string, cycleType?: "current"): Promise<ICycle[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, {
      params: {
        cycle_view: cycleType,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCyclesWithStatus(workspaceSlug: string, projectId: string, status: Array<string>): Promise<ICycle[]> {
    const query =
      Array.isArray(status) && status.length > 0 ? status.map((s) => `status=${encodeURIComponent(s)}`).join("&") : "";
    const url = `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${query ? `?${query}` : ""}`;
    return this.get(url)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleDetails(workspaceSlug: string, projectId: string, cycleId: string): Promise<ICycle> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getCycleIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    queries?: any,
    config = {}
  ): Promise<TIssuesResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
      {
        params: queries,
      },
      config
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchCycle(workspaceSlug: string, projectId: string, cycleId: string, data: Partial<ICycle>): Promise<any> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCycle(workspaceSlug: string, projectId: string, cycleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async cycleDateCheck(workspaceSlug: string, projectId: string, data: CycleDateCheckData): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/date-check/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async addCycleToFavorites(
    workspaceSlug: string,
    projectId: string,
    data: {
      cycle: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async transferIssues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    data: {
      new_cycle_id: string;
    }
  ): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/transfer-issues/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleFileList(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    queries?: { page?: number; page_size?: number }
  ): Promise<any> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/list/`, {
      params: {
        cycle_id: cycleId,
        ...queries,
      },
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadCycleFile(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<any> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    const presignResponse = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/upload/`,
      {
        ...fileMetaData,
        cycle_id: cycleId,
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
    await fileUploader.uploadFile(presignResponse.upload_data.url, fileUploadPayload, uploadProgressHandler);

    await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/${presignResponse.asset_id}/uploaded/`,
      { attributes: fileMetaData }
    ).catch((error) => {
      throw error?.response?.data;
    });

    return { asset_id: presignResponse.asset_id };
  }

  async downloadCycleFile(workspaceSlug: string, projectId: string, fileId: string): Promise<string> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/${fileId}/download/`
    )
      .then((response) => response?.data?.download_url as string)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 批量下载迭代附件：后端打包成 zip 直接返回二进制流 */
  async batchDownloadCycleFiles(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    fileIds: string[]
  ): Promise<Blob> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/batch-download/`,
      { params: { cycle_id: cycleId, asset_ids: fileIds.join(",") } },
      { responseType: "blob" }
    )
      .then((response) => response?.data as Blob)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCycleFile(workspaceSlug: string, projectId: string, fileId: string): Promise<any> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/file/${fileId}/delete/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async removeCycleFromFavorites(workspaceSlug: string, projectId: string, cycleId: string): Promise<any> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/user-favorite-cycles/${cycleId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleOverdueByAssignee(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TCycleOverdueByAssigneeResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/overdue-by-assignee/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleIssueTypeDistribution(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<TCycleIssueTypeDistributionResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/issue-type-distribution/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCycleOverdues(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<ICycleOverdueRecord[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/overdues/`)
      .then((response) => response?.data ?? [])
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 获取当前迭代已关联的测试计划列表 */
  async getCyclePlans(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<{ data: any[]; count: number }> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/plans/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 获取当前项目下、尚未关联到任何迭代的可选测试计划（用于迭代 -> 关联计划弹窗） */
  async getCycleSelectablePlans(
    workspaceSlug: string,
    projectId: string,
    cycleId: string
  ): Promise<{ data: any[]; count: number }> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/selectable-plans/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 将一组测试计划批量关联到当前迭代 */
  async associateCyclePlans(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    planIds: string[]
  ): Promise<any> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/associate-plans/`,
      { plan_ids: planIds }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /** 解除一组测试计划与当前迭代的关联 */
  async cancelCyclePlanAssociation(
    workspaceSlug: string,
    projectId: string,
    cycleId: string,
    planIds: string[]
  ): Promise<any> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cancel-plan-association/`,
      { plan_ids: planIds }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export type TCycleOverdueAssigneeRow = {
  assignee_id: string | null;
  display_name: string;
  avatar_url: string;
  count: number;
};

export type TCycleOverdueByAssigneeResponse = {
  total: number;
  data: TCycleOverdueAssigneeRow[];
};

export type TCycleIssueTypeRow = {
  type_id: string | null;
  name: string;
  logo_props: Record<string, any>;
  count: number;
};

export type TCycleIssueTypeDistributionResponse = {
  total: number;
  data: TCycleIssueTypeRow[];
};
