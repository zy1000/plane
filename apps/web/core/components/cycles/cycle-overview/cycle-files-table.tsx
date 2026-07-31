"use client";

import { Checkbox, Popconfirm } from "antd";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TCycleFile } from "@/components/cycles/cycle-overview/use-cycle-files";
import { useFileSelection } from "@/hooks/use-file-selection";

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

type TCycleFilesTableProps = {
  files: TCycleFile[];
  filesDownloadingId: string | null;
  filesDeletingId: string | null;
  canDeleteCycleFile?: boolean;
  canDownloadCycleFile?: boolean;
  onDownloadFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  /** 传入后才会展示勾选列与批量下载入口 */
  onBatchDownloadFiles?: (fileIds: string[]) => Promise<void> | void;
  filesBatchDownloading?: boolean;
};

export const CycleFilesTable = ({
  files,
  filesDownloadingId,
  filesDeletingId,
  canDeleteCycleFile = true,
  canDownloadCycleFile = true,
  onDownloadFile,
  onDeleteFile,
  onBatchDownloadFiles,
  filesBatchDownloading = false,
}: TCycleFilesTableProps) => {
  const selection = useFileSelection(files);
  const canBatchDownload = Boolean(onBatchDownloadFiles) && canDownloadCycleFile;

  return (
    <>
      {canBatchDownload && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs text-secondary">
            {selection.selectedCount > 0 ? `已选 ${selection.selectedCount} 个附件` : "勾选附件后可批量下载为压缩包"}
          </span>
          <div className="flex items-center gap-2">
            {selection.selectedCount > 0 && (
              <Button
                variant="link-neutral"
                className="p-0"
                onClick={selection.clear}
                disabled={filesBatchDownloading}
              >
                取消选择
              </Button>
            )}
            <Button
              variant="neutral-primary"
              className="px-2 py-1"
              onClick={() => onBatchDownloadFiles?.(selection.selectedIds)}
              loading={filesBatchDownloading}
              disabled={selection.selectedCount === 0 || filesBatchDownloading}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              下载选中
            </Button>
          </div>
        </div>
      )}
      <table className="min-w-full table-fixed">
        <thead>
          <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
            {canBatchDownload && (
              <th className="w-10 px-2 py-2">
                <Checkbox
                  checked={selection.isAllSelected}
                  indeterminate={selection.isPartiallySelected}
                  onChange={selection.toggleAll}
                  aria-label="全选附件"
                />
              </th>
            )}
            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
            <th className="w-1/4 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => {
            const isDownloadDisabled = filesDownloadingId === file.id || !canDownloadCycleFile;
            const isDeleteDisabled = filesDeletingId === file.id || !canDeleteCycleFile;

            return (
              <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                {canBatchDownload && (
                  <td className="px-2 py-2">
                    <Checkbox
                      checked={selection.isSelected(file.id)}
                      onChange={() => selection.toggle(file.id)}
                      aria-label={`选择 ${file.name}`}
                    />
                  </td>
                )}
                <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                  <span className="truncate">{file.name}</span>
                </td>
                <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
                <td className="px-2 py-2 text-sm text-primary">
                  {file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}
                </td>
                <td className="px-2 py-2 text-left">
                  <div className="flex items-center justify-start gap-2">
                    <Button
                      variant="link-neutral"
                      className={cn("p-0", isDownloadDisabled && "cursor-not-allowed opacity-50")}
                      disabled={isDownloadDisabled}
                      aria-disabled={isDownloadDisabled}
                      onClick={() => {
                        if (isDownloadDisabled) return;
                        onDownloadFile(file.id);
                      }}
                    >
                      <Download className={cn("h-3.5 w-3.5", !canDownloadCycleFile && "text-placeholder")} />
                    </Button>
                    <Popconfirm
                      title="确认删除该附件？"
                      okText="删除"
                      cancelText="取消"
                      disabled={isDeleteDisabled}
                      onConfirm={() => {
                        if (isDeleteDisabled) return;
                        onDeleteFile(file.id);
                      }}
                    >
                      <Button
                        variant={canDeleteCycleFile ? "link-danger" : "link-neutral"}
                        className={cn("p-0", isDeleteDisabled && "cursor-not-allowed opacity-50")}
                        disabled={isDeleteDisabled}
                        loading={filesDeletingId === file.id}
                        aria-disabled={isDeleteDisabled}
                      >
                        <Trash2
                          className={cn("h-3.5 w-3.5", canDeleteCycleFile ? "text-danger-primary" : "text-placeholder")}
                        />
                      </Button>
                    </Popconfirm>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
};
