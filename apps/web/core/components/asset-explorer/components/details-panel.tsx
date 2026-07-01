import { Download, Eye, Pencil, SquarePen, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TAssetExplorerFile, TAssetFileVersion } from "@/services/asset-explorer.service";
import type { TAssetExplorerPermissions } from "../types";
import { confirmDeleteFiles } from "./confirm-delete";
import { FileTypeIcon } from "./file-icon";
import { formatBytes, formatMinIODate, getFileExtension } from "../utils/format";
import { VersionAliasModal } from "./version-alias-modal";
import { VersionHistoryModal } from "./version-history-modal";

type TDetailsPanelProps = {
  file: TAssetExplorerFile | null;
  permissions: TAssetExplorerPermissions;
  hasPreviewCapability: boolean;
  hasEditCapability: boolean;
  onClose: () => void;
  onPreviewFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onEditFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onRenameFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onDownloadFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onDeleteFile: (assetId: string) => void | Promise<void>;
  versions: TAssetFileVersion[];
  onUploadVersion: (file: TAssetExplorerFile, replacement: File) => void | Promise<void>;
  onRefreshVersions: (file: TAssetExplorerFile) => void | Promise<void>;
  onDownloadVersion: (file: TAssetExplorerFile, version: TAssetFileVersion) => void | Promise<void>;
  onRenameVersion: (file: TAssetExplorerFile, version: TAssetFileVersion, alias: string) => void | Promise<void>;
  onRestoreVersion: (file: TAssetExplorerFile, version: TAssetFileVersion) => void | Promise<void>;
};

type TActionRowProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

const ActionRow = ({ icon, label, onClick, danger, disabled }: TActionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] font-medium transition ${
      danger
        ? "text-secondary hover:bg-danger-subtle hover:text-danger-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-secondary"
        : "text-secondary hover:bg-accent-primary/[0.08] hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-secondary"
    }`}
  >
    <span
      className={`shrink-0 ${
        disabled
          ? "text-tertiary"
          : danger
            ? "text-tertiary group-hover:text-danger-primary"
            : "text-tertiary group-hover:text-accent-primary"
      }`}
    >
      {icon}
    </span>
    <span className="flex-1 truncate">{label}</span>
  </button>
);

const InfoRow = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex flex-col gap-1 py-2.5">
    <span className="text-[13px] font-medium text-tertiary">{label}</span>
    <span
      className={`break-words text-[12.5px] text-primary ${mono ? "font-mono tabular-nums" : ""}`}
    >
      {value}
    </span>
  </div>
);

const getVersionLabel = (version: TAssetFileVersion) => version.alias || version.filename || version.version_id;

export const DetailsPanel = ({
  file,
  permissions,
  hasPreviewCapability,
  hasEditCapability,
  onClose,
  onPreviewFile,
  onEditFile,
  onRenameFile,
  onDownloadFile,
  onDeleteFile,
  versions,
  onUploadVersion,
  onRefreshVersions,
  onDownloadVersion,
  onRenameVersion,
  onRestoreVersion,
}: TDetailsPanelProps) => {
  const versionInputRef = useRef<HTMLInputElement>(null);
  const [aliasEditingVersion, setAliasEditingVersion] = useState<TAssetFileVersion | null>(null);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const open = Boolean(file);
  const displayName = file ? file.name || file.filename || "未命名" : "";
  const ext = file ? getFileExtension(file.name || file.filename) : "";
  const mime = file?.type || "—";
  const currentVersion = versions.find((version) => version.is_current) ?? versions[0] ?? null;

  useEffect(() => {
    setAliasEditingVersion(null);
    setVersionHistoryOpen(false);
  }, [file?.id]);

  const openVersionHistory = () => {
    setVersionHistoryOpen(true);
    if (file) void onRefreshVersions(file);
  };

  return (
    <aside
      className={`relative shrink-0 overflow-hidden border-l border-subtle bg-layer-1 transition-[width] duration-300 ease-out ${
        open ? "w-[340px]" : "w-0"
      }`}
      aria-hidden={!open}
    >
      {file && (
        <div className="flex h-full w-[340px] flex-col">
          {/* Header: icon + name + close */}
          <div className="flex items-start gap-3 border-b border-subtle px-4 pb-4 pt-4">
            <FileTypeIcon filename={file.name || file.filename} size="md" />
            <div className="min-w-0 flex-1">
              <h3
                className="break-words text-[13.5px] font-semibold leading-snug text-primary"
                title={displayName}
              >
                {displayName}
              </h3>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                {ext ? `${ext.toUpperCase()} 文件` : "文件"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              title="关闭"
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <input
              ref={versionInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const replacement = event.target.files?.[0];
                if (file && replacement) void onUploadVersion(file, replacement);
                event.target.value = "";
              }}
            />

            {/* Actions — vertical list, MinIO-style */}
            <section className="px-2 pb-3 pt-3">
              <h4 className="mb-1.5 px-2 text-[13px] font-medium text-tertiary">
                操作
              </h4>
              <div className="flex flex-col gap-0.5">
                {hasPreviewCapability && (
                  <ActionRow
                    icon={<Eye className="size-4" strokeWidth={1.75} />}
                    label="预览"
                    onClick={() => void onPreviewFile(file)}
                  />
                )}
                {hasEditCapability && (
                  <ActionRow
                    icon={<Pencil className="size-4" strokeWidth={1.75} />}
                    label="编辑"
                    disabled={!permissions.canEdit}
                    onClick={() => void onEditFile(file)}
                  />
                )}
                <ActionRow
                  icon={<SquarePen className="size-4" strokeWidth={1.75} />}
                  label="重命名"
                  disabled={!permissions.canEdit}
                  onClick={() => void onRenameFile(file)}
                />
                <ActionRow
                  icon={<Download className="size-4" strokeWidth={1.75} />}
                  label="下载"
                  disabled={!permissions.canDownload}
                  onClick={() => void onDownloadFile(file)}
                />
                <ActionRow
                  icon={<Upload className="size-4" strokeWidth={1.75} />}
                  label="上传新版本"
                  disabled={!permissions.canEdit}
                  onClick={() => versionInputRef.current?.click()}
                />
                <ActionRow
                  icon={<Trash2 className="size-4" strokeWidth={1.75} />}
                  label="删除"
                  danger
                  disabled={!permissions.canDelete}
                  onClick={() =>
                    confirmDeleteFiles(1, () => {
                      void onDeleteFile(file.id);
                    })
                  }
                />
              </div>
            </section>

            <div className="mx-4 h-px bg-subtle" />

            <section className="px-4 pb-4 pt-3">
              <h4 className="mb-2 text-[13px] font-medium text-tertiary">
                版本
              </h4>
              <div className="rounded-md border border-subtle bg-layer-1 px-3 py-2.5">
                {!currentVersion && <div className="text-[12px] text-tertiary">暂无版本信息</div>}
                {currentVersion && (
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="truncate text-[12.5px] font-medium text-primary"
                        title={getVersionLabel(currentVersion)}
                      >
                        {getVersionLabel(currentVersion)}
                      </span>
                      <span className="shrink-0 rounded border border-accent-primary/30 px-1.5 py-0.5 text-[10px] font-medium text-accent-primary">
                        当前
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-tertiary">
                      {formatBytes(currentVersion.size)} · {formatMinIODate(currentVersion.created_at)}
                    </div>
                  </div>
                )}
                {(currentVersion || versions.length > 0) && (
                  <button
                    type="button"
                    onClick={openVersionHistory}
                    className="mt-2 h-7 w-full rounded-md border border-subtle px-2 text-[12px] font-medium text-secondary transition hover:border-strong hover:bg-layer-1-hover hover:text-primary"
                  >
                    {`查看全部版本 ${versions.length}`}
                  </button>
                )}
              </div>
            </section>

            <div className="mx-4 h-px bg-subtle" />

            {/* 文件信息 */}
            <section className="px-4 pb-6 pt-3">
              <h4 className="mb-1 text-[13px] font-medium text-tertiary">
                文件信息
              </h4>
              <div className="divide-y divide-subtle/60">
                <InfoRow label="名称" value={displayName} />
                <InfoRow label="上传者" value={file.created_by_name || "—"} />
                <InfoRow label="类型" value={mime} mono />
                <InfoRow label="大小" value={formatBytes(file.size)} mono />
                <InfoRow label="最后修改" value={formatMinIODate(file.updated_at || file.created_at)} mono />
              </div>
            </section>
          </div>
        </div>
      )}
      <VersionAliasModal
        open={Boolean(file && aliasEditingVersion)}
        version={aliasEditingVersion}
        loading={aliasSaving}
        onCancel={() => setAliasEditingVersion(null)}
        onSubmit={async (alias) => {
          if (!file || !aliasEditingVersion) return;
          setAliasSaving(true);
          try {
            await onRenameVersion(file, aliasEditingVersion, alias);
            setAliasEditingVersion(null);
          } finally {
            setAliasSaving(false);
          }
        }}
      />
      <VersionHistoryModal
        open={Boolean(file && versionHistoryOpen)}
        file={file}
        versions={versions}
        canDownload={permissions.canDownload}
        canEdit={permissions.canEdit}
        onCancel={() => setVersionHistoryOpen(false)}
        onDownloadVersion={onDownloadVersion}
        onRenameVersion={setAliasEditingVersion}
        onRestoreVersion={onRestoreVersion}
      />
    </aside>
  );
};
