"use client";

import type { ChangeEvent } from "react";
import { useRef } from "react";
import { ReleaseFilesSection } from "@/components/releases/release-overview/release-scope-tab";
import { usePlanCaseFiles } from "@/components/qa/execution/use-plan-case-files";

type Props = {
  workspaceSlug?: string;
  planId?: string;
  caseId?: string;
};

export const PlanCaseFilesContent = ({ workspaceSlug, planId, caseId }: Props) => {
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
  } = usePlanCaseFiles({
    workspaceSlug: workspaceSlug ?? "",
    planId: planId ?? "",
    caseId: caseId ?? "",
  });

  if (!workspaceSlug || !planId || !caseId) {
    return <div className="py-6 text-sm text-secondary">请选择测试计划和用例后上传文件</div>;
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) void uploadFile(selectedFile);
    event.target.value = "";
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col py-2">
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
};
