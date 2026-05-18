import { ChevronRight, Download, Eye, Pencil, Trash2, X } from "lucide-react";
import type { TAssetExplorerFile } from "@/services/asset-explorer.service";
import type { TAssetExplorerPermissions } from "../types";
import { confirmDeleteFiles } from "./confirm-delete";
import { FileTypeIcon } from "./file-icon";
import { formatBytes, formatMinIODate, getFileExtension } from "../utils/format";

type TDetailsPanelProps = {
  file: TAssetExplorerFile | null;
  permissions: TAssetExplorerPermissions;
  hasEditCapability: boolean;
  onClose: () => void;
  onPreviewFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onEditFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onDownloadFile: (file: TAssetExplorerFile) => void | Promise<void>;
  onDeleteFile: (assetId: string) => void | Promise<void>;
};

type TActionRowProps = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

const ActionRow = ({ icon, label, onClick, danger }: TActionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] font-medium transition ${
      danger
        ? "text-secondary hover:bg-rose-500/[0.08] hover:text-rose-500"
        : "text-secondary hover:bg-accent-primary/[0.08] hover:text-accent-primary"
    }`}
  >
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${
        danger
          ? "border-subtle group-hover:border-rose-400/40 group-hover:bg-rose-500/10"
          : "border-subtle group-hover:border-accent-strong/40 group-hover:bg-accent-primary/10"
      }`}
    >
      {icon}
    </span>
    <span className="flex-1 truncate">{label}</span>
    <ChevronRight className="size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
  </button>
);

const InfoRow = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex flex-col gap-1 py-2.5">
    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-tertiary">{label}</span>
    <span
      className={`break-words text-[12.5px] text-primary ${mono ? "font-mono tabular-nums" : ""}`}
    >
      {value}
    </span>
  </div>
);

export const DetailsPanel = ({
  file,
  permissions,
  hasEditCapability,
  onClose,
  onPreviewFile,
  onEditFile,
  onDownloadFile,
  onDeleteFile,
}: TDetailsPanelProps) => {
  const open = Boolean(file);
  const displayName = file ? file.name || file.filename || "未命名" : "";
  const ext = file ? getFileExtension(file.name || file.filename) : "";
  const mime = file?.type || "—";

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
            {/* Actions — vertical list, MinIO-style */}
            <section className="px-2 pb-3 pt-3">
              <h4 className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                Actions
              </h4>
              <div className="flex flex-col gap-0.5">
                <ActionRow
                  icon={<Eye className="size-4" strokeWidth={1.75} />}
                  label="Preview"
                  onClick={() => void onPreviewFile(file)}
                />
                {hasEditCapability && (
                  <ActionRow
                    icon={<Pencil className="size-4" strokeWidth={1.75} />}
                    label="Edit"
                    onClick={() => void onEditFile(file)}
                  />
                )}
                <ActionRow
                  icon={<Download className="size-4" strokeWidth={1.75} />}
                  label="Download"
                  onClick={() => void onDownloadFile(file)}
                />
                {permissions.canDelete && (
                  <ActionRow
                    icon={<Trash2 className="size-4" strokeWidth={1.75} />}
                    label="Delete"
                    danger
                    onClick={() =>
                      confirmDeleteFiles(1, () => {
                        void onDeleteFile(file.id);
                      })
                    }
                  />
                )}
              </div>
            </section>

            <div className="mx-4 h-px bg-subtle" />

            {/* Object Info */}
            <section className="px-4 pb-6 pt-3">
              <h4 className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                Object Info
              </h4>
              <div className="divide-y divide-subtle/60">
                <InfoRow label="Name" value={displayName} />
                <InfoRow label="Type" value={mime} mono />
                <InfoRow label="Size" value={formatBytes(file.size)} mono />
                <InfoRow label="Last Modified" value={formatMinIODate(file.created_at)} mono />
                <InfoRow label="Object ID" value={<span className="break-all">{file.id}</span>} mono />
              </div>
            </section>
          </div>
        </div>
      )}
    </aside>
  );
};
