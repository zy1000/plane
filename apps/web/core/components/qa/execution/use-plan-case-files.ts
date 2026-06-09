"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFileUploadProgress } from "@/hooks/use-file-upload-progress";
import { PlanService } from "@/services/qa/plan.service";

export type TPlanCaseFile = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

type TUsePlanCaseFilesProps = {
  workspaceSlug: string;
  planId: string;
  caseId: string;
};

const PLAN_CASE_FILES_FETCH_PAGE_SIZE = 100;

export const usePlanCaseFiles = ({ workspaceSlug, planId, caseId }: TUsePlanCaseFilesProps) => {
  const planService = useMemo(() => new PlanService(), []);
  const { uploadStatuses, trackUpload } = useFileUploadProgress();
  const [files, setFiles] = useState<TPlanCaseFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesDownloadingId, setFilesDownloadingId] = useState<string | null>(null);
  const [filesDeletingId, setFilesDeletingId] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!workspaceSlug || !planId || !caseId) return;
    try {
      setFilesLoading(true);
      setFilesError(null);
      const aggregated: TPlanCaseFile[] = [];
      let total = 0;
      let page = 1;

      for (;;) {
        const response = await planService.getPlanCaseFiles(workspaceSlug, planId, caseId, {
          page,
          page_size: PLAN_CASE_FILES_FETCH_PAGE_SIZE,
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
        if (list.length === 0 || list.length < PLAN_CASE_FILES_FETCH_PAGE_SIZE || aggregated.length >= total) break;
        page += 1;
      }

      setFiles(aggregated);
      setFilesTotal(total);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "获取用例文件失败");
    } finally {
      setFilesLoading(false);
    }
  }, [caseId, planId, planService, workspaceSlug]);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  const uploadFile = useCallback(
    async (selectedFile: File) => {
      if (!selectedFile || !workspaceSlug || !planId || !caseId) return;

      try {
        setFilesUploading(true);
        await trackUpload(selectedFile, (onProgress) =>
          planService.uploadPlanCaseFile(workspaceSlug, planId, caseId, selectedFile, onProgress)
        );
        await fetchFiles();
        setFilesError(null);
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "上传文件失败");
      } finally {
        setFilesUploading(false);
      }
    },
    [caseId, fetchFiles, planId, planService, trackUpload, workspaceSlug]
  );

  const downloadFile = useCallback(
    async (fileId: string) => {
      if (!workspaceSlug) return;
      try {
        setFilesDownloadingId(fileId);
        const url = await planService.downloadPlanCaseFile(workspaceSlug, fileId);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "下载文件失败");
      } finally {
        setFilesDownloadingId(null);
      }
    },
    [planService, workspaceSlug]
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      if (!workspaceSlug) return;
      try {
        setFilesDeletingId(fileId);
        await planService.deletePlanCaseFile(workspaceSlug, fileId);
        await fetchFiles();
      } catch (error: any) {
        setFilesError(error?.error || error?.detail || "删除文件失败");
      } finally {
        setFilesDeletingId(null);
      }
    },
    [fetchFiles, planService, workspaceSlug]
  );

  return {
    files,
    filesLoading,
    filesUploading,
    uploadStatuses,
    filesTotal,
    filesDownloadingId,
    filesDeletingId,
    filesError,
    fetchFiles,
    uploadFile,
    downloadFile,
    deleteFile,
  };
};
