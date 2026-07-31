"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAttachmentBatchDownload } from "@/hooks/use-attachment-batch-download";
import { useFileUploadProgress } from "@/hooks/use-file-upload-progress";
import { CycleService } from "@/services/cycle.service";

export type TCycleFile = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

type TUseCycleFilesProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

const CYCLE_FILES_FETCH_PAGE_SIZE = 100;

export const useCycleFiles = ({ workspaceSlug, projectId, cycleId }: TUseCycleFilesProps) => {
  const cycleService = useMemo(() => new CycleService(), []);
  const { uploadStatuses, trackUpload } = useFileUploadProgress();
  const [files, setFiles] = useState<TCycleFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesDownloadingId, setFilesDownloadingId] = useState<string | null>(null);
  const [filesDeletingId, setFilesDeletingId] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    try {
      setFilesLoading(true);
      setFilesError(null);
      const aggregated: TCycleFile[] = [];
      let total = 0;
      let page = 1;

      for (;;) {
        const response = await cycleService.getCycleFileList(workspaceSlug, projectId, cycleId, {
          page,
          page_size: CYCLE_FILES_FETCH_PAGE_SIZE,
        });
        const list = Array.isArray(response?.data) ? response.data : [];
        total = Number(response?.count ?? total);
        for (const file of list as any[]) {
          aggregated.push({
            id: file.id,
            name: file.name,
            size: Number(file.size ?? 0),
            created_at: file.created_at,
          });
        }
        if (list.length === 0 || list.length < CYCLE_FILES_FETCH_PAGE_SIZE || aggregated.length >= total) break;
        page += 1;
      }

      setFiles(aggregated);
      setFilesTotal(total);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "获取迭代文件失败");
    } finally {
      setFilesLoading(false);
    }
  }, [cycleId, cycleService, projectId, workspaceSlug]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const uploadFile = useCallback(
    async (selectedFile: File) => {
      if (!selectedFile || !workspaceSlug || !projectId || !cycleId) return;

      try {
        setFilesUploading(true);
        await trackUpload(selectedFile, (onProgress) =>
          cycleService.uploadCycleFile(workspaceSlug, projectId, cycleId, selectedFile, onProgress)
        );
        await fetchFiles();
        setFilesError(null);
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "上传文件失败");
      } finally {
        setFilesUploading(false);
      }
    },
    [cycleId, cycleService, fetchFiles, projectId, trackUpload, workspaceSlug]
  );

  const downloadFile = useCallback(
    async (fileId: string) => {
      if (!workspaceSlug || !projectId) return;
      try {
        setFilesDownloadingId(fileId);
        const url = await cycleService.downloadCycleFile(workspaceSlug, projectId, fileId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "下载文件失败");
      } finally {
        setFilesDownloadingId(null);
      }
    },
    [cycleService, projectId, workspaceSlug]
  );

  const fetchFilesZip = useCallback(
    (fileIds: string[]) => cycleService.batchDownloadCycleFiles(workspaceSlug, projectId, cycleId, fileIds),
    [cycleId, cycleService, projectId, workspaceSlug]
  );

  const { isBatchDownloading: filesBatchDownloading, batchDownload: batchDownloadFiles } = useAttachmentBatchDownload({
    filename: "cycle-attachments.zip",
    fetchZip: fetchFilesZip,
    onError: setFilesError,
  });

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!workspaceSlug || !projectId) return;
      try {
        setFilesDeletingId(fileId);
        await cycleService.deleteCycleFile(workspaceSlug, projectId, fileId);
        await fetchFiles();
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "删除文件失败");
      } finally {
        setFilesDeletingId(null);
      }
    },
    [cycleService, fetchFiles, projectId, workspaceSlug]
  );

  return {
    files,
    filesLoading,
    filesUploading,
    uploadStatuses,
    filesTotal,
    filesDownloadingId,
    filesDeletingId,
    filesBatchDownloading,
    filesError,
    fetchFiles,
    uploadFile,
    downloadFile,
    batchDownloadFiles,
    deleteFile,
  };
};
