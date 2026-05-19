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
};

export type TAssetExplorerFile = {
  id: string;
  name: string;
  filename: string;
  size: number;
  type: string;
  attributes?: {
    name?: string;
    type?: string;
    size?: number;
    [key: string]: any;
  };
  created_at?: string;
  created_by_id?: string | null;
  created_by_name?: string | null;
  created_by_avatar?: string | null;
  is_uploaded?: boolean;
  parent_folder_id?: number;
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

  getBatchDownloadURL(
    workspaceSlug: string,
    projectId: string,
    params: { assetIds?: string[]; folderIds?: number[] }
  ): string {
    const searchParams = new URLSearchParams();
    if (params.assetIds?.length) searchParams.set("asset_ids", params.assetIds.join(","));
    if (params.folderIds?.length) searchParams.set("folder_ids", params.folderIds.join(","));
    const query = searchParams.toString();
    const prefix = `${API_BASE_URL || ""}/api/workspaces/${workspaceSlug}/projects/${encodeURIComponent(
      String(projectId)
    )}/filestore/explorer/batch-download/`;
    return query ? `${prefix}?${query}` : prefix;
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
        throw error?.response?.data;
      });
  }
}
