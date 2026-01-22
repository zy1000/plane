import type { AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@plane/constants";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { APIService } from "@/services/api.service";
import { FileUploadService } from "@/services/file-upload.service";

export type TFilestoreAsset = {
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

export type TFilestoreAssetListResponse = {
  count: number;
  data: TFilestoreAsset[];
};

export class FilestoreService extends APIService {
  private fileUploadService: FileUploadService = new FileUploadService();

  constructor() {
    super(API_BASE_URL);
  }

  async listFilestoreAssets(
    workspaceSlug: string,
    projectId: string,
    params?: { page?: number; page_size?: number; name__icontains?: string }
  ): Promise<TFilestoreAssetListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/`, { params: params ?? {} })
      .then((response) => response?.data ?? { count: 0, data: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private async markFilestoreAssetUploaded(workspaceSlug: string, projectId: string, assetId: string): Promise<void> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadFilestoreAsset(
    workspaceSlug: string,
    projectId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TFilestoreAsset> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/`, { ...fileMetaData })
      .then(async (response) => {
        const signedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.markFilestoreAssetUploaded(workspaceSlug, projectId, signedURLResponse.asset_id);
        return signedURLResponse.asset as TFilestoreAsset;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  getFilestoreAssetDownloadURL(workspaceSlug: string, projectId: string, assetId: string): string {
    const base = API_BASE_URL || "";
    return `${base}/api/workspaces/${workspaceSlug}/projects/${encodeURIComponent(
      String(projectId)
    )}/filestore/assets/${encodeURIComponent(String(assetId))}/download/`;
  }

  async getFilestoreAssetPresignedURL(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    disposition: "inline" | "attachment" = "inline"
  ): Promise<string> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/download/`, {
      params: { disposition, redirect: 0 },
    })
      .then((response) => response?.data?.download_url ?? "")
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteFilestoreAsset(workspaceSlug: string, projectId: string, assetId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

