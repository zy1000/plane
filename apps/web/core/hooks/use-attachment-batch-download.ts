"use client";

import { useCallback, useState } from "react";

/** responseType=blob 时后端返回的 JSON 错误体会被包成 Blob，这里解回可展示的文案。 */
const extractErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
  if (error instanceof Blob) {
    try {
      const parsed = JSON.parse(await error.text());
      return parsed?.error || parsed?.detail || fallback;
    } catch {
      return fallback;
    }
  }
  const err = error as { error?: string; detail?: string; message?: string } | null;
  return err?.error || err?.detail || err?.message || fallback;
};

const saveBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** 后端打包结果；`skipped` 是因大网 / 小网限制被跳过的文件数（响应头 X-Zone-Skipped） */
export type TZipDownloadResult = { blob: Blob; skipped?: number };

type TUseAttachmentBatchDownloadProps = {
  /** 保存到本地的压缩包文件名 */
  filename: string;
  /** 拉取后端打包好的 zip */
  fetchZip: (fileIds: string[]) => Promise<Blob | TZipDownloadResult>;
  onError?: (message: string) => void;
  onSuccess?: () => void;
  /** 打包时跳过了受限文件（大网用户选中了小网文件） */
  onSkipped?: (count: number) => void;
};

/** 附件批量下载：请求后端打包的 zip 并触发浏览器保存。 */
export const useAttachmentBatchDownload = ({
  filename,
  fetchZip,
  onError,
  onSuccess,
  onSkipped,
}: TUseAttachmentBatchDownloadProps) => {
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const batchDownload = useCallback(
    async (fileIds: string[]) => {
      if (!fileIds.length || isBatchDownloading) return;
      try {
        setIsBatchDownloading(true);
        const result = await fetchZip(fileIds);
        const { blob, skipped } = result instanceof Blob ? { blob: result, skipped: 0 } : result;
        saveBlob(blob, filename);
        if (skipped) onSkipped?.(skipped);
        onSuccess?.();
      } catch (error: unknown) {
        onError?.(await extractErrorMessage(error, "批量下载失败"));
      } finally {
        setIsBatchDownloading(false);
      }
    },
    [fetchZip, filename, isBatchDownloading, onError, onSuccess, onSkipped]
  );

  return { isBatchDownloading, batchDownload };
};
