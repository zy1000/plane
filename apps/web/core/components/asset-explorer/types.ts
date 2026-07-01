import type { TAssetExplorerFile, TAssetFolder } from "@/services/asset-explorer.service";

export type TAssetExplorerPermissions = {
  canUpload: boolean;
  canDelete: boolean;
  canCreateFolder: boolean;
  canEdit: boolean;
  canDownload: boolean;
};

export type TAssetExplorerProps = {
  workspaceSlug: string;
  projectId: string;
  permissions: TAssetExplorerPermissions;
  versionRefreshSignal?: number;
  onPreview?: (asset: TAssetExplorerFile) => void | Promise<void>;
  onEdit?: (asset: TAssetExplorerFile) => void | Promise<void>;
};

export type TExplorerRow =
  | {
      key: string;
      kind: "folder";
      folder: TAssetFolder;
    }
  | {
      key: string;
      kind: "file";
      file: TAssetExplorerFile;
    };

export type TMoveConflictItem = {
  asset_id: string;
  filename: string;
};
