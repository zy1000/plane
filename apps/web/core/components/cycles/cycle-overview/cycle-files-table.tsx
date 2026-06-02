"use client";

import { Popconfirm } from "antd";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@plane/ui";
import type { TCycleFile } from "@/components/cycles/cycle-overview/use-cycle-files";

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
  onDownloadFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
};

export const CycleFilesTable = ({
  files,
  filesDownloadingId,
  filesDeletingId,
  onDownloadFile,
  onDeleteFile,
}: TCycleFilesTableProps) => (
  <table className="min-w-full table-fixed">
    <thead>
      <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
        <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
        <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
        <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
        <th className="w-1/4 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
      </tr>
    </thead>
    <tbody>
      {files.map((file) => (
        <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
          <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
            <span className="truncate">{file.name}</span>
          </td>
          <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
          <td className="px-2 py-2 text-sm text-primary">{file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}</td>
          <td className="px-2 py-2 text-left">
            <div className="flex items-center justify-start gap-2">
              <Button
                variant="link-neutral"
                className="p-0"
                disabled={filesDownloadingId === file.id}
                onClick={() => onDownloadFile(file.id)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Popconfirm title="确认删除该附件？" okText="删除" cancelText="取消" onConfirm={() => onDeleteFile(file.id)}>
                <Button
                  variant="link-danger"
                  className="p-0"
                  disabled={filesDeletingId === file.id}
                  loading={filesDeletingId === file.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </Popconfirm>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
