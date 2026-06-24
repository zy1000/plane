import type { AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@plane/constants";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "@plane/services";
import { APIService } from "@/services/api.service";
import { FileUploadService } from "@/services/file-upload.service";

export type TAssetFolder = {
  id: number;
  name: string;
  entity_type: string;
  parent_id: number | null;
  updated_at: string | null;
  is_root: boolean;
  // 搜索结果中携带：相对 filestore 的父级路径（不含 filestore 与自身名），形如 "A/B"
  path?: string;
};

export type TAssetExplorerFile = {
  id: string;
  name: string;
  filename: string;
  size: number;
  type: string;
  version_id?: string | null;
  attributes?: {
    name?: string;
    type?: string;
    size?: number;
    [key: string]: any;
  };
  created_at?: string;
  updated_at?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  is_uploaded?: boolean;
  parent_folder_id?: number;
  // 搜索结果中携带：相对 filestore 的所在目录路径，形如 "A/B"
  path?: string;
};

export type TAssetFileVersion = {
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

export type TAssetVersionListResponse = {
  versions: TAssetFileVersion[];
};

export type TAssetListResponse = {
  current_folder: TAssetFolder;
  folders: TAssetFolder[];
  files: {
    count: number;
    data: TAssetExplorerFile[];
  };
};

export type TFolderTreeNode = TAssetFolder & {
  children: TFolderTreeNode[];
};

export type TFolderTreeResponse = {
  tree: TFolderTreeNode;
};

export type TBreadcrumbResponse = {
  workspace_id: string;
  project_id: string;
  breadcrumbs: TAssetFolder[];
};

export type TFolderStatsResponse = {
  folder_id: number;
  recursive_size: number;
  recursive_file_count: number;
  direct_folder_count: number;
  direct_file_count: number;
};

export type TAssetSearchItem =
  | ({ kind: "folder" } & TAssetFolder)
  | ({ kind: "file" } & TAssetExplorerFile);

export type TAssetSearchResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: TAssetSearchItem[];
};

export class AssetExplorerService extends APIService {
  private fileUploadService: FileUploadService = new FileUploadService();

  constructor() {
    super(API_BASE_URL);
  }

  async ensureRoot(workspaceSlug: string, projectId: string): Promise<{ root_folder: TAssetFolder }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/ensure-root/`)
      .then((response) => response?.data ?? { root_folder: null })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listFolder(
    workspaceSlug: string,
    projectId: string,
    params?: { folder_id?: number; page?: number; page_size?: number; name__icontains?: string }
  ): Promise<TAssetListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/list/`, {
      params: params ?? {},
    })
      .then(
        (response) =>
          response?.data ?? {
            current_folder: null,
            folders: [],
            files: { count: 0, data: [] },
          }
      )
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getFolderTree(workspaceSlug: string, projectId: string): Promise<TFolderTreeResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/tree/`)
      .then((response) => response?.data ?? { tree: null })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getBreadcrumb(workspaceSlug: string, projectId: string, folderId: number): Promise<TBreadcrumbResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/breadcrumb/`, {
      params: { folder_id: folderId },
    })
      .then((response) => response?.data ?? { breadcrumbs: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getFolderStats(workspaceSlug: string, projectId: string, folderId: number): Promise<TFolderStatsResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/folder-stats/`, {
      params: { folder_id: folderId },
    })
      .then(
        (response) =>
          (response?.data as TFolderStatsResponse | undefined) ?? {
            folder_id: folderId,
            recursive_size: 0,
            recursive_file_count: 0,
            direct_folder_count: 0,
            direct_file_count: 0,
          }
      )
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async searchFilestore(
    workspaceSlug: string,
    projectId: string,
    params: { folder_id?: number; name__icontains?: string; page?: number; page_size?: number }
  ): Promise<TAssetSearchResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/search/`, {
      params: params ?? {},
    })
      .then(
        (response) =>
          (response?.data as TAssetSearchResponse | undefined) ?? {
            count: 0,
            next: null,
            previous: null,
            results: [],
          }
      )
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createFolder(workspaceSlug: string, projectId: string, parentFolderId: number, name: string): Promise<{ folder: TAssetFolder }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/folder/`, {
      parent_folder_id: parentFolderId,
      name,
    })
      .then((response) => response?.data ?? { folder: null })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameFolder(workspaceSlug: string, projectId: string, folderId: number, name: string): Promise<{ folder: TAssetFolder }> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/folder/${folderId}/`, { name })
      .then((response) => response?.data ?? { folder: null })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameAsset(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    name: string
  ): Promise<{ asset: TAssetExplorerFile }> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/${assetId}/rename/`, { name })
      .then((response) => response?.data ?? { asset: null })
      .catch((error) => {
        const data = error?.response?.data;
        const status = Number(error?.response?.status ?? 0) || undefined;
        if (data && typeof data === "object") {
          if (status !== undefined && (data as Record<string, any>).status === undefined) {
            (data as Record<string, any>).status = status;
          }
          throw data;
        }
        if (typeof data === "string") {
          throw { error: data, status };
        }
        throw { error: error?.message || "重命名文件失败", status };
      });
  }

  async deleteFolder(workspaceSlug: string, projectId: string, folderId: number): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/folder/${folderId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  private async markUploaded(workspaceSlug: string, projectId: string, assetId: string): Promise<void> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/${assetId}/uploaded/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadAsset(
    workspaceSlug: string,
    projectId: string,
    parentFolderId: number,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TAssetExplorerFile> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/upload/`, {
      ...fileMetaData,
      parent_folder_id: parentFolderId,
    })
      .then(async (response) => {
        const signedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.markUploaded(workspaceSlug, projectId, signedURLResponse.asset_id);
        return signedURLResponse.asset as TAssetExplorerFile;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async batchDelete(workspaceSlug: string, projectId: string, assetIds: string[]): Promise<{ deleted_ids: string[] }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/batch-delete/`, {
      asset_ids: assetIds,
    })
      .then((response) => response?.data ?? { deleted_ids: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async batchCopy(
    workspaceSlug: string,
    projectId: string,
    assetIds: string[],
    targetFolderId: number
  ): Promise<{ copied_ids: string[] }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/batch-copy/`, {
      asset_ids: assetIds,
      target_folder_id: targetFolderId,
    })
      .then((response) => response?.data ?? { copied_ids: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async batchMove(
    workspaceSlug: string,
    projectId: string,
    assetIds: string[],
    targetFolderId: number,
    onConflict: "overwrite" | "rename" | "cancel" = "rename"
  ): Promise<{ moved_ids: string[]; conflicts: Array<{ asset_id: string; filename: string }> }> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/explorer/batch-move/`, {
      asset_ids: assetIds,
      target_folder_id: targetFolderId,
      on_conflict: onConflict,
    })
      .then((response) => response?.data ?? { moved_ids: [], conflicts: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async downloadBatch(
    workspaceSlug: string,
    projectId: string,
    params: { assetIds?: string[]; folderIds?: number[] }
  ): Promise<{ blob: Blob; filename: string }> {
    const queryParams: Record<string, string> = {};
    if (params.assetIds?.length) queryParams.asset_ids = params.assetIds.join(",");
    if (params.folderIds?.length) queryParams.folder_ids = params.folderIds.join(",");
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${encodeURIComponent(
        String(projectId)
      )}/filestore/explorer/batch-download/`,
      { params: queryParams },
      { responseType: "blob" }
    )
      .then((response) => {
        const blob: Blob = response?.data;
        const disposition: string = response?.headers?.["content-disposition"] ?? "";
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        const filename = match
          ? decodeURIComponent(match[1].trim().replace(/^"|"$/g, ""))
          : "filestore-assets.zip";
        return { blob, filename };
      })
      .catch(async (error) => {
        // responseType=blob 时后端的 JSON 错误体会被包成 Blob，需解回 JSON，便于上层按权限错误识别。
        const data = error?.response?.data;
        const status = Number(error?.response?.status ?? 0) || undefined;
        if (data instanceof Blob) {
          let parsed: any = { error: "下载失败", status };
          try {
            parsed = JSON.parse(await data.text());
            if (status !== undefined && parsed && typeof parsed === "object" && parsed.status === undefined) {
              parsed.status = status;
            }
            if (
              parsed &&
              typeof parsed === "object" &&
              typeof parsed.error !== "string" &&
              typeof parsed.detail === "string"
            ) {
              parsed.error = parsed.detail;
            }
          } catch {
            // 解析失败则保留默认错误
          }
          throw parsed;
        }
        if (data && typeof data === "object") {
          if (status !== undefined && (data as Record<string, any>).status === undefined) {
            (data as Record<string, any>).status = status;
          }
          if (
            typeof (data as Record<string, any>).error !== "string" &&
            typeof (data as Record<string, any>).detail === "string"
          ) {
            (data as Record<string, any>).error = (data as Record<string, any>).detail;
          }
          throw data;
        }
        if (typeof data === "string") {
          throw { error: data, status };
        }
        throw { error: error?.message || "下载失败", status };
      });
  }

  async getAssetPresignedURL(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    disposition: "inline" | "attachment" = "attachment"
  ): Promise<string> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/download/`, {
      params: { disposition, redirect: 0 },
    })
      .then((response) => response?.data?.download_url ?? "")
      .catch((error) => {
        const data = error?.response?.data;
        const status = Number(error?.response?.status ?? 0) || undefined;
        if (data && typeof data === "object") {
          if (status !== undefined && (data as Record<string, any>).status === undefined) {
            (data as Record<string, any>).status = status;
          }
          if (
            typeof (data as Record<string, any>).error !== "string" &&
            typeof (data as Record<string, any>).detail === "string"
          ) {
            (data as Record<string, any>).error = (data as Record<string, any>).detail;
          }
          throw data;
        }
        if (typeof data === "string") {
          throw { error: data, status };
        }
        throw { error: error?.message || "下载失败", status };
      });
  }

  async listAssetVersions(workspaceSlug: string, projectId: string, assetId: string): Promise<TAssetVersionListResponse> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/`)
      .then((response) => response?.data ?? { versions: [] })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getAssetVersionPresignedURL(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    versionId: string,
    disposition: "inline" | "attachment" = "attachment"
  ): Promise<string> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/${encodeURIComponent(
        versionId
      )}/download/`,
      { params: { disposition, redirect: 0 } }
    )
      .then((response) => response?.data?.download_url ?? "")
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async renameAssetVersion(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    versionId: string,
    alias: string
  ): Promise<{ version: TAssetFileVersion }> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/${encodeURIComponent(
        versionId
      )}/`,
      { alias }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadAssetVersion(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    file: File,
    alias?: string,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TAssetFileVersion> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/upload/`, {
      ...fileMetaData,
    })
      .then(async (response) => {
        const signedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        return this.patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/filestore/assets/${assetId}/versions/upload/`,
          { ...fileMetaData, alias }
        ).then((uploadedResponse) => uploadedResponse?.data?.version as TAssetFileVersion);
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async restoreAssetVersion(
    workspaceSlug: string,
    projectId: string,
    assetId: string,
    versionId: string
  ): Promise<{ current_version: TAssetFileVersion; deleted_version_ids: string[] }> {
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
}
