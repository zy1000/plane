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

export type TOnlyOfficeConfigResponse = {
  document_server_url: string;
  config: Record<string, any>;
};

export type TOnlyOfficeSaveRequestStatus = "pending" | "saved" | "no_changes" | "failed";

export type TOnlyOfficeSaveRequest = {
  id: string;
  sequence: number;
  status: TOnlyOfficeSaveRequestStatus;
  requested_at: string;
  completed_at: string;
  error: string;
};

export type TOnlyOfficeSessionStatus = {
  doc_key: string;
  is_active: boolean;
  state: string;
  last_callback_status: number;
  last_callback_at: string;
  last_saved_at: string;
  last_saved_version_id: string;
  last_error: string;
  save_request: TOnlyOfficeSaveRequest | null;
};

export type TOnlyOfficeStatusResponse = {
  onlyoffice: Record<string, any>;
  session: TOnlyOfficeSessionStatus;
  versions_count: number;
  updated_at: string;
};

export type TOnlyOfficeForceSaveResponse = {
  doc_key: string;
  save_request_id: string;
  status: "accepted" | "no_changes";
};

export type TOnlyOfficeVersionsResponse = {
  versions: Array<Record<string, any>>;
};

export type TFilestoreAssetVersion = {
  id: string;
  version_id: string;
  alias: string;
  filename: string;
  content_type: string;
  size: number;
  etag?: string | null;
  is_current: boolean;
  created_at?: string;
  created_by_id?: string | null;
  created_by_name?: string | null;
};

export type TFilestoreAssetVersionListResponse = {
  versions: TFilestoreAssetVersion[];
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
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/`, {
      params: params ?? {},
    })
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

  async getOnlyOfficeConfig(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    mode?: "view" | "edit",
    versionId?: string
  ): Promise<TOnlyOfficeConfigResponse> {
    const params: Record<string, string> = {};
    if (mode) params.mode = mode;
    if (versionId) params.version_id = versionId;
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/onlyoffice/config/`,
      {
        params: Object.keys(params).length > 0 ? params : undefined,
      }
    )
      .then((response) => response?.data ?? { document_server_url: "", config: {} })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * 需求级附件的 OnlyOffice **只读**预览配置。需求附件挂在产品 / 标准库上没有 project_id，
   * 所以走工作区级端点；只有 view 模式，没有编辑与回调。
   */
  async getRequirementAssetOnlyOfficePreviewConfig(
    workspaceSlug: string,
    assetId: string
  ): Promise<TOnlyOfficeConfigResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/requirement-assets/${assetId}/onlyoffice/config/`)
      .then((response) => response?.data ?? { document_server_url: "", config: {} })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getOnlyOfficeStatus(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    params?: { docKey?: string; saveRequestId?: string }
  ): Promise<TOnlyOfficeStatusResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/onlyoffice/status/`,
      {
        params: {
          ...(params?.docKey ? { doc_key: params.docKey } : {}),
          ...(params?.saveRequestId ? { save_request_id: params.saveRequestId } : {}),
        },
      }
    )
      .then(
        (response) =>
          response?.data ?? {
            onlyoffice: {},
            session: {
              doc_key: "",
              is_active: false,
              state: "",
              last_callback_status: 0,
              last_callback_at: "",
              last_saved_at: "",
              last_saved_version_id: "",
              last_error: "",
              save_request: null,
            },
            versions_count: 0,
            updated_at: "",
          }
      )
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listOnlyOfficeVersions(
    workspaceSlug: string,
    projectId: string,
    assetId: string
  ): Promise<TOnlyOfficeVersionsResponse> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/onlyoffice/versions/`
    )
      .then((response) => response?.data ?? { versions: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async restoreOnlyOfficeVersion(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    versionKey: string
  ): Promise<{ status: string }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/onlyoffice/versions/restore/`,
      { version_key: versionKey }
    )
      .then((response) => response?.data ?? { status: "ok" })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listFilestoreAssetVersions(
    workspaceSlug: string,
    projectId: string,
    assetId: string
  ): Promise<TFilestoreAssetVersionListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/`)
      .then((response) => response?.data ?? { versions: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async restoreFilestoreAssetVersion(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    versionId: string
  ): Promise<{ current_version: TFilestoreAssetVersion; deleted_version_ids: string[] }> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/${encodeURIComponent(
        versionId
      )}/restore/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async forceSaveOnlyOffice(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    docKey: string
  ): Promise<TOnlyOfficeForceSaveResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/onlyoffice/forcesave/`,
      {
        doc_key: docKey,
      }
    )
      .then((response) => response?.data as TOnlyOfficeForceSaveResponse)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
