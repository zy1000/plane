/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import type { AxiosRequestConfig } from "axios";
import { v4 as uuidv4 } from "uuid";

export type TFileUploadStatus = {
  id: string;
  name: string;
  progress: number;
  size: number;
  type: string;
};

type TUploadProgressHandler = AxiosRequestConfig["onUploadProgress"];

/**
 * 通用文件上传进度管理。
 * `trackUpload` 在上传开始时插入一条占位状态（progress=0），
 * 把进度回调透传给实际的上传请求（仅覆盖 S3 直传阶段），结束后移除该条。
 * 配合 `FileUploadProgressList` 即可复用工作项附件那样的圆环进度展示。
 */
export const useFileUploadProgress = () => {
  const [uploadStatuses, setUploadStatuses] = useState<TFileUploadStatus[]>([]);

  const trackUpload = useCallback(
    async <T>(file: File, run: (onProgress: TUploadProgressHandler) => Promise<T>): Promise<T> => {
      const tempId = uuidv4();
      setUploadStatuses((prev) => [
        ...prev,
        { id: tempId, name: file.name, progress: 0, size: file.size, type: file.type },
      ]);
      try {
        return await run((progressEvent) => {
          const progress = Math.round((progressEvent?.progress ?? 0) * 100);
          setUploadStatuses((prev) => prev.map((status) => (status.id === tempId ? { ...status, progress } : status)));
        });
      } finally {
        setUploadStatuses((prev) => prev.filter((status) => status.id !== tempId));
      }
    },
    []
  );

  return { uploadStatuses, trackUpload };
};
