"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { observer } from "mobx-react";
import {
  PROJECT_SPRINTS_FILE_DELETE_PERMISSION_KEY,
  PROJECT_SPRINTS_FILE_DOWNLOAD_PERMISSION_KEY,
  PROJECT_SPRINTS_FILE_UPLOAD_PERMISSION_KEY,
} from "@plane/constants";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import { useCycleFiles } from "@/components/cycles/cycle-overview/use-cycle-files";
import { ReleaseFilesSection } from "@/components/releases/release-overview/release-scope-tab";
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

export const CycleAttachmentsContent = observer(function CycleAttachmentsContent(props: Props) {
  const { workspaceSlug, projectId, cycleId } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { getCycleById } = useCycle();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const {
    files,
    filesLoading,
    filesUploading,
    uploadStatuses,
    filesDownloadingId,
    filesDeletingId,
    filesBatchDownloading,
    filesError,
    uploadFile,
    downloadFile,
    batchDownloadFiles,
    deleteFile,
  } = useCycleFiles({
    workspaceSlug,
    projectId,
    cycleId,
  });

  useCyclesDetails({ workspaceSlug, projectId, cycleId });
  const cycleDetails = getCycleById(cycleId);
  const isCycleArchived = Boolean(cycleDetails?.archived_at);
  const canUploadCycleFile =
    allowProjectPermissionKeys([PROJECT_SPRINTS_FILE_UPLOAD_PERMISSION_KEY], workspaceSlug, projectId) &&
    !isCycleArchived;
  const canDeleteCycleFile =
    allowProjectPermissionKeys([PROJECT_SPRINTS_FILE_DELETE_PERMISSION_KEY], workspaceSlug, projectId) &&
    !isCycleArchived;
  const canDownloadCycleFile = allowProjectPermissionKeys(
    [PROJECT_SPRINTS_FILE_DOWNLOAD_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && canUploadCycleFile) void uploadFile(selectedFile);
    event.target.value = "";
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col px-6 py-4">
        <ReleaseFilesSection
          className="min-h-0 flex-1"
          files={files}
          filesLoading={filesLoading}
          filesError={filesError}
          filesUploading={filesUploading}
          filesDeletingId={filesDeletingId}
          filesDownloadingId={filesDownloadingId}
          filesBatchDownloading={filesBatchDownloading}
          uploadStatuses={uploadStatuses}
          canUploadReleaseFile={canUploadCycleFile}
          canDeleteReleaseFile={canDeleteCycleFile}
          canDownloadReleaseFile={canDownloadCycleFile}
          onTriggerUploadFile={() => {
            if (!filesUploading && canUploadCycleFile) fileInputRef.current?.click();
          }}
          onDeleteFile={(fileId) => void deleteFile(fileId)}
          onDownloadFile={(fileId, _fileName) => void downloadFile(fileId)}
          onBatchDownloadFiles={(fileIds) => void batchDownloadFiles(fileIds)}
        />
      </div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
    </div>
  );
});
