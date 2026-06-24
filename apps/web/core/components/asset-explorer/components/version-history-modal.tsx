import { Modal } from "antd";
import { Download, History, Pencil, RotateCcw, X } from "lucide-react";
import type { TAssetExplorerFile, TAssetFileVersion } from "@/services/asset-explorer.service";
import { formatBytes, formatMinIODate } from "../utils/format";

type TVersionHistoryModalProps = {
  open: boolean;
  file: TAssetExplorerFile | null;
  versions: TAssetFileVersion[];
  onCancel: () => void;
  onDownloadVersion: (file: TAssetExplorerFile, version: TAssetFileVersion) => void | Promise<void>;
  onRenameVersion: (version: TAssetFileVersion) => void;
  onRestoreVersion: (file: TAssetExplorerFile, version: TAssetFileVersion) => void | Promise<void>;
};

const getVersionLabel = (version: TAssetFileVersion) => version.alias || version.filename || version.version_id;

export const VersionHistoryModal = ({
  open,
  file,
  versions,
  onCancel,
  onDownloadVersion,
  onRenameVersion,
  onRestoreVersion,
}: TVersionHistoryModalProps) => (
  <Modal open={open} title={null} closable={false} footer={null} onCancel={onCancel} width="min(920px, calc(100vw - 32px))">
    <div className="flex h-[82vh] max-h-[82vh] flex-col gap-4 pb-1">
      <div className="flex shrink-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
          <History className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[15px] font-semibold tracking-tight text-primary">历史版本</span>
              <span className="block truncate text-[12px] text-tertiary" title={file?.name || file?.filename}>
                {file?.name || file?.filename || "—"} · {versions.length} 个版本
              </span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              title="关闭"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-subtle bg-layer-1">
        {versions.length === 0 && (
          <div className="flex h-full items-center justify-center px-4 py-8 text-center text-[13px] text-tertiary">
            暂无历史版本
          </div>
        )}

        {versions.length > 0 && (
          <div className="h-full overflow-y-auto">
            {versions.map((version) => {
              const label = getVersionLabel(version);
              return (
                <div
                  key={version.id || version.version_id}
                  className="flex items-center gap-3 border-b border-subtle/60 px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-primary" title={label}>
                        {label}
                      </span>
                      {version.is_current && (
                        <span className="shrink-0 rounded border border-accent-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-tertiary">
                      <span className="font-mono tabular-nums">{formatBytes(version.size)}</span>
                      <span className="text-subtle">·</span>
                      <span className="font-mono tabular-nums">{formatMinIODate(version.created_at)}</span>
                      {version.created_by_name && (
                        <>
                          <span className="text-subtle">·</span>
                          <span className="truncate">上传者：{version.created_by_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="下载版本"
                      onClick={() => {
                        if (file) void onDownloadVersion(file, version);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="重命名版本"
                      onClick={() => onRenameVersion(version)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {!version.is_current && (
                      <button
                        type="button"
                        title="回退到此版本"
                        onClick={() => {
                          Modal.confirm({
                            title: "确认回退到该版本？",
                            content: "回退后，更新的版本会被物理删除。",
                            okText: "回退",
                            cancelText: "取消",
                            okButtonProps: { danger: true },
                            onOk: () => {
                              if (file) return onRestoreVersion(file, version);
                            },
                          });
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  </Modal>
);
