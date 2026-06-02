"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { observer } from "mobx-react";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import { useCycleFiles } from "@/components/cycles/cycle-overview/use-cycle-files";
import { ReleaseFilesSection } from "@/components/releases/release-overview/release-scope-tab";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

export const CycleAttachmentsContent = observer(function CycleAttachmentsContent(props: Props) {
  const { workspaceSlug, projectId, cycleId } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    files,
    filesLoading,
    filesUploading,
    uploadStatuses,
    filesDownloadingId,
    filesDeletingId,
    filesError,
    uploadFile,
    downloadFile,
    deleteFile,
  } = useCycleFiles({
    workspaceSlug,
    projectId,
    cycleId,
  });

  useCyclesDetails({ workspaceSlug, projectId, cycleId });

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) void uploadFile(selectedFile);
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
          uploadStatuses={uploadStatuses}
          onTriggerUploadFile={() => {
            if (!filesUploading) fileInputRef.current?.click();
          }}
          onDeleteFile={(fileId) => void deleteFile(fileId)}
          onDownloadFile={(fileId, _fileName) => void downloadFile(fileId)}
        />
      </div>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInputChange} />
    </div>
  );
});
