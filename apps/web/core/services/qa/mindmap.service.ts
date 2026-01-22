import type { AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@plane/constants";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { APIService } from "@/services/api.service";
import { FileUploadService } from "@/services/file-upload.service";

export type TMindmapAsset = {
  id: string;
  attributes?: {
    name?: string;
    type?: string;
    size?: number;
  };
  created_at?: string;
  created_by?: any;
  is_uploaded?: boolean;
};

export type TMindmapAssetListResponse = {
  count: number;
  data: TMindmapAsset[];
};

export class MindmapService extends APIService {
  private fileUploadService: FileUploadService = new FileUploadService();

  constructor() {
    super(API_BASE_URL);
  }

  async listMindmapAssets(
    workspaceSlug: string,
    projectId: string,
    params?: { page?: number; page_size?: number; name__icontains?: string }
  ): Promise<TMindmapAssetListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/mindmap/assets/`, {
      params: { project_id: projectId, ...(params ?? {}) },
    })
      .then((response) => response?.data ?? { count: 0, data: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private async markMindmapAssetUploaded(workspaceSlug: string, assetId: string): Promise<void> {
    return this.patch(`/api/workspaces/${workspaceSlug}/test/mindmap/assets/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadMindmapAsset(
    workspaceSlug: string,
    projectId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TMindmapAsset> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(`/api/workspaces/${workspaceSlug}/test/mindmap/assets/`, { ...fileMetaData, project_id: projectId })
      .then(async (response) => {
        const signedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.markMindmapAssetUploaded(workspaceSlug, signedURLResponse.asset_id);
        return signedURLResponse.asset as TMindmapAsset;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  getMindmapAssetDownloadURL(workspaceSlug: string, assetId: string, projectId: string): string {
    const base = API_BASE_URL || "";
    return `${base}/api/workspaces/${workspaceSlug}/test/mindmap/assets/${assetId}/download/?project_id=${encodeURIComponent(
      String(projectId)
    )}`;
  }

  async getMindmapAssetPresignedURL(
    workspaceSlug: string,
    assetId: string,
    projectId: string,
    disposition: "inline" | "attachment" = "inline"
  ): Promise<string> {
    return this.get(`/api/workspaces/${workspaceSlug}/test/mindmap/assets/${assetId}/download/`, {
      params: { project_id: projectId, disposition, redirect: 0 },
    })
      .then((response) => response?.data?.download_url ?? "")
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteMindmapAsset(workspaceSlug: string, assetId: string, projectId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/test/mindmap/assets/${assetId}/`, {
      project_id: projectId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
