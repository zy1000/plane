/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Tooltip } from "@plane/propel/tooltip";
import { CircularProgressIndicator } from "@plane/ui";
import { getFileExtension } from "@plane/utils";
// icons
import { getFileIcon } from "@/components/icons";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TFileUploadStatus } from "@/hooks/use-file-upload-progress";

type ItemProps = {
  uploadStatus: TFileUploadStatus;
};

/**
 * 单条文件上传进度行（圆环 + 文件名 + 百分比），与工作项附件保持一致的视觉。
 */
export const FileUploadProgressItem = function FileUploadProgressItem(props: ItemProps) {
  const { uploadStatus } = props;
  const fileName = uploadStatus.name;
  const fileExtension = getFileExtension(uploadStatus.name ?? "");
  const fileIcon = getFileIcon(fileExtension, 18);
  const { isMobile } = usePlatformOS();

  return (
    <div className="pointer-events-none flex h-11 items-center justify-between gap-3 rounded-md bg-surface-2 px-3">
      <div className="flex items-center gap-3 truncate text-13">
        <div className="flex-shrink-0">{fileIcon}</div>
        <Tooltip tooltipContent={fileName} isMobile={isMobile}>
          <p className="truncate font-medium text-secondary">{fileName}</p>
        </Tooltip>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="flex-shrink-0">
          <CircularProgressIndicator size={20} strokeWidth={3} percentage={uploadStatus.progress} />
        </span>
        <div className="flex-shrink-0 text-13 font-medium">{uploadStatus.progress}%</div>
      </div>
    </div>
  );
};

type ListProps = {
  uploadStatuses: TFileUploadStatus[];
  className?: string;
};

/**
 * 上传进度列表，直接渲染在文件列表上方即可。无上传中文件时不渲染任何内容。
 */
export const FileUploadProgressList = function FileUploadProgressList(props: ListProps) {
  const { uploadStatuses, className } = props;
  if (!uploadStatuses?.length) return null;
  return (
    <div className={className ?? "flex flex-col gap-1"}>
      {uploadStatuses.map((uploadStatus) => (
        <FileUploadProgressItem key={uploadStatus.id} uploadStatus={uploadStatus} />
      ))}
    </div>
  );
};
